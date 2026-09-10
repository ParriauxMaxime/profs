import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { clearLevel, setColumnCriteria, setLevel } from "./criterion-levels";
import { newCriterion } from "./rubrics";

describe("setLevel", () => {
  it("writes one row and leaves its neighbours alone", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await setLevel(db, "col", "just", "adam", 3);
    await setLevel(db, "col", "ryth", "adam", 4);
    await setLevel(db, "col", "just", "lucas", 2);

    await setLevel(db, "col", "just", "adam", 1);

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.criterionId === "just" && r.studentId === "adam")?.level).toBe(1);
    expect(rows.find((r) => r.criterionId === "ryth" && r.studentId === "adam")?.level).toBe(4);
    expect(rows.find((r) => r.studentId === "lucas")?.level).toBe(2);
    db.close();
  });
});

describe("clearLevel", () => {
  it("deletes one row and no other", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await setLevel(db, "col", "just", "adam", 3);
    await setLevel(db, "col", "ryth", "adam", 4);

    await clearLevel(db, "col", "just", "adam");

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionId).toBe("ryth");
    db.close();
  });

  it("is a no-op on a cell that was never written", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await setLevel(db, "col", "just", "adam", 3);
    await clearLevel(db, "col", "just", "personne");
    expect(await db.criterionLevels.where("columnId").equals("col").count()).toBe(1);
    db.close();
  });
});

describe("setColumnCriteria", () => {
  it("drops the levels of a critère that did not survive", async () => {
    // A level for a removed critère is unreachable: invisible in the grid,
    // never summarised, still carried by every export.
    const db = openWorkspaceDb(crypto.randomUUID());
    const keep = newCriterion("Justesse");
    const doomed = newCriterion("Rythme");
    await db.columns.add({
      id: "col",
      gradebookId: "gb",
      periodId: "p1",
      type: "rubric",
      label: "Oral",
      weight: 1,
      max: 20,
      order: 0,
      criteria: [keep, doomed],
    });
    await setLevel(db, "col", keep.id, "adam", 3);
    await setLevel(db, "col", doomed.id, "adam", 2);

    await setColumnCriteria(db, "col", [keep]);

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionId).toBe(keep.id);
    expect((await db.columns.get("col"))?.criteria).toEqual([keep]);
    db.close();
  });

  it("keeps every level when the critères are merely reordered", async () => {
    // Reordering is the common edit, and it must not read as a removal: what
    // survives is the set of ids, never their positions.
    const db = openWorkspaceDb(crypto.randomUUID());
    const criteria = [newCriterion("Justesse"), newCriterion("Rythme")];
    await db.columns.add({
      id: "col",
      gradebookId: "gb",
      periodId: "p1",
      type: "rubric",
      label: "Oral",
      weight: 1,
      max: 20,
      order: 0,
      criteria,
    });
    for (const criterion of criteria) await setLevel(db, "col", criterion.id, "adam", 3);

    await setColumnCriteria(db, "col", [...criteria].reverse());

    expect(await db.criterionLevels.where("columnId").equals("col").count()).toBe(2);
    db.close();
  });
});
