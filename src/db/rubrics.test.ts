import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { clearScore, newCriterion, saveTemplate, setCriteria, setScore } from "./rubrics";

function freshDb() {
  return openWorkspaceDb(`rubrics-${crypto.randomUUID()}`);
}

describe("newCriterion", () => {
  it("gives each criterion its own id", () => {
    expect(newCriterion("Clarté").id).not.toBe(newCriterion("Clarté").id);
  });
});

describe("setCriteria", () => {
  it("deletes the scores of a removed criterion", async () => {
    const db = freshDb();
    const [first, second] = [newCriterion("Clarté"), newCriterion("Contenu")];
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria: [first, second],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.bulkPut([
      { assessmentId: "a1", criterionId: first.id, studentId: "p1", level: 3, updatedAt: 1 },
      { assessmentId: "a1", criterionId: second.id, studentId: "p1", level: 4, updatedAt: 1 },
    ]);

    await setCriteria(db, "a1", [first]);

    expect(await db.rubricScores.count()).toBe(1);
    expect((await db.rubricScores.toArray())[0].criterionId).toBe(first.id);
    expect((await db.rubricAssessments.get("a1"))?.criteria).toHaveLength(1);
    db.close();
  });

  it("keeps every score when criteria are only reordered", async () => {
    const db = freshDb();
    const criteria = [newCriterion("A"), newCriterion("B")];
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.bulkPut(
      criteria.map((c) => ({
        assessmentId: "a1",
        criterionId: c.id,
        studentId: "p1",
        level: 2 as const,
        updatedAt: 1,
      })),
    );
    await setCriteria(db, "a1", [...criteria].reverse());
    expect(await db.rubricScores.count()).toBe(2);
    db.close();
  });
});

describe("setScore / clearScore", () => {
  it("writes one cell with a single put", async () => {
    const db = freshDb();
    await setScore(db, "a1", "c1", "p1", 3);
    expect((await db.rubricScores.get(["a1", "c1", "p1"]))?.level).toBe(3);
    db.close();
  });

  it("overwrites a previous level on the same cell rather than adding a row", async () => {
    const db = freshDb();
    await setScore(db, "a1", "c1", "p1", 2);
    await setScore(db, "a1", "c1", "p1", 4);
    expect(await db.rubricScores.count()).toBe(1);
    expect((await db.rubricScores.get(["a1", "c1", "p1"]))?.level).toBe(4);
    db.close();
  });

  it("clearScore removes only its own cell, leaving other pupils and criteria untouched", async () => {
    const db = freshDb();
    await setScore(db, "a1", "c1", "p1", 3);
    await setScore(db, "a1", "c1", "p2", 1);
    await setScore(db, "a1", "c2", "p1", 4);

    await clearScore(db, "a1", "c1", "p1");

    expect(await db.rubricScores.get(["a1", "c1", "p1"])).toBeUndefined();
    expect((await db.rubricScores.get(["a1", "c1", "p2"]))?.level).toBe(1);
    expect((await db.rubricScores.get(["a1", "c2", "p1"]))?.level).toBe(4);
    expect(await db.rubricScores.count()).toBe(2);
    db.close();
  });

  it("clearScore on an unknown cell is a no-op", async () => {
    const db = freshDb();
    await setScore(db, "a1", "c1", "p1", 3);
    await clearScore(db, "a1", "c1", "nope");
    expect(await db.rubricScores.count()).toBe(1);
    db.close();
  });
});

describe("saveTemplate", () => {
  it("creates a template and returns its id", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "Oral", criteria: [newCriterion("Clarté")] });
    const stored = await db.rubricTemplates.get(id);
    expect(stored?.name).toBe("Oral");
    expect(stored?.criteria).toHaveLength(1);
    db.close();
  });

  it("updates in place without creating a second row", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "Oral", criteria: [] });
    await saveTemplate(db, { templateId: id, name: "Exposé oral", criteria: [] });
    expect(await db.rubricTemplates.count()).toBe(1);
    expect((await db.rubricTemplates.get(id))?.name).toBe("Exposé oral");
    db.close();
  });

  it("trims the name and refuses an empty one", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "  Oral  ", criteria: [] });
    expect((await db.rubricTemplates.get(id))?.name).toBe("Oral");
    await expect(saveTemplate(db, { name: "   ", criteria: [] })).rejects.toThrow();
    expect(await db.rubricTemplates.count()).toBe(1);
    db.close();
  });
});
