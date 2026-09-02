import "fake-indexeddb/auto";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { openWorkspaceDb } from ".";
import { createGradebookWithPeriods } from "./gradebooks";

function freshDb(label: string) {
  return openWorkspaceDb(`gradebooks-${label}-${crypto.randomUUID()}`);
}

describe("createGradebookWithPeriods", () => {
  it("creates the gradebook together with its three trimesters, in order", async () => {
    const db = freshDb("create");
    const gradebook = await createGradebookWithPeriods(db, {
      classId: "c1",
      subjectId: "sub1",
      name: "Maths 3°B",
    });

    expect((await db.gradebooks.get(gradebook.id))?.name).toBe("Maths 3°B");

    const periods = await db.periods.where("gradebookId").equals(gradebook.id).sortBy("order");
    expect(periods.map((p) => p.name)).toEqual([...DEFAULT_PERIOD_NAMES]);
    expect(periods.map((p) => p.order)).toEqual([0, 1, 2]);
    db.close();
  });

  it("gives each period its own id", async () => {
    // Sharing an id across the three trimesters would make deleting one
    // delete all three, and a column's periodId would address the wrong term.
    const db = freshDb("ids");
    const gradebook = await createGradebookWithPeriods(db, {
      classId: "c1",
      subjectId: "sub1",
      name: "Maths",
    });

    const periods = await db.periods.where("gradebookId").equals(gradebook.id).toArray();
    expect(new Set(periods.map((p) => p.id)).size).toBe(3);
    db.close();
  });

  it("never leaves a gradebook without periods", async () => {
    const db = freshDb("atomic");
    await createGradebookWithPeriods(db, { classId: "c1", subjectId: "sub1", name: "A" });
    await createGradebookWithPeriods(db, { classId: "c1", subjectId: "sub1", name: "B" });

    for (const gradebook of await db.gradebooks.toArray()) {
      expect(await db.periods.where("gradebookId").equals(gradebook.id).count()).toBe(3);
    }
    db.close();
  });
});
