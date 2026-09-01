import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import {
  clearScore,
  createAssessment,
  createAssessmentFromTemplate,
  newCriterion,
  setCriteria,
  setScore,
} from "./rubrics";

function freshDb() {
  return openWorkspaceDb(`rubrics-${crypto.randomUUID()}`);
}

describe("newCriterion", () => {
  it("gives each criterion its own id", () => {
    expect(newCriterion("Clarté").id).not.toBe(newCriterion("Clarté").id);
  });
});

describe("createAssessmentFromTemplate", () => {
  it("copies the template's criteria rather than referencing them", async () => {
    const db = freshDb();
    const criteria = [newCriterion("Clarté"), newCriterion("Contenu")];
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria,
      createdAt: 1,
      updatedAt: 1,
    });

    const assessment = await createAssessmentFromTemplate(db, "t1", {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral du 12 mars",
    });

    expect(assessment.criteria.map((c) => c.label)).toEqual(["Clarté", "Contenu"]);

    // Editing the template afterwards must not touch the graded assessment.
    await db.rubricTemplates.update("t1", { criteria: [newCriterion("Autre chose")] });
    const reloaded = await db.rubricAssessments.get(assessment.id);
    expect(reloaded?.criteria.map((c) => c.label)).toEqual(["Clarté", "Contenu"]);
    db.close();
  });

  it("gives fresh criterion ids, not the template's", async () => {
    const db = freshDb();
    const criteria = [newCriterion("Clarté")];
    await db.rubricTemplates.add({ id: "t1", name: "Oral", criteria, createdAt: 1, updatedAt: 1 });

    const a1 = await createAssessmentFromTemplate(db, "t1", {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Session 1",
    });
    const a2 = await createAssessmentFromTemplate(db, "t1", {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Session 2",
    });

    expect(a1.criteria[0].id).not.toBe(criteria[0].id);
    expect(a1.criteria[0].id).not.toBe(a2.criteria[0].id);
    db.close();
  });

  it("throws for an unknown template rather than creating an empty grid", async () => {
    const db = freshDb();
    await expect(
      createAssessmentFromTemplate(db, "nope", {
        gradebookId: "g1",
        periodId: "pe1",
        name: "x",
      }),
    ).rejects.toThrow();
    db.close();
  });
});

describe("setCriteria", () => {
  it("deletes the scores of a removed criterion", async () => {
    const db = freshDb();
    const a = await createAssessment(db, {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      criteria: [newCriterion("Clarté"), newCriterion("Contenu")],
    });
    const [first, second] = a.criteria;
    await db.rubricScores.bulkPut([
      { assessmentId: a.id, criterionId: first.id, studentId: "p1", level: 3, updatedAt: 1 },
      { assessmentId: a.id, criterionId: second.id, studentId: "p1", level: 4, updatedAt: 1 },
    ]);

    await setCriteria(db, a.id, [first]);

    expect(await db.rubricScores.count()).toBe(1);
    expect((await db.rubricScores.toArray())[0].criterionId).toBe(first.id);
    expect((await db.rubricAssessments.get(a.id))?.criteria).toHaveLength(1);
    db.close();
  });

  it("keeps every score when criteria are only reordered", async () => {
    const db = freshDb();
    const a = await createAssessment(db, {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      criteria: [newCriterion("A"), newCriterion("B")],
    });
    await db.rubricScores.bulkPut(
      a.criteria.map((c) => ({
        assessmentId: a.id,
        criterionId: c.id,
        studentId: "p1",
        level: 2 as const,
        updatedAt: 1,
      })),
    );
    await setCriteria(db, a.id, [...a.criteria].reverse());
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
