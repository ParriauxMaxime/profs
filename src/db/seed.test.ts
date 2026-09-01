import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

describe("seedIfEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates the demo school on an empty database", async () => {
    const db = openWorkspaceDb("seed-empty");
    const seeded = await seedIfEmpty(db, "seed-empty");

    expect(seeded).toBe(true);
    expect(await db.classes.count()).toBe(2);
    expect(await db.subjects.count()).toBe(2);
    expect(await db.gradebooks.count()).toBe(2);
    expect(await db.students.count()).toBe(46);
    db.close();
  });

  it("gives every gradebook three periods and at least five columns", async () => {
    const db = openWorkspaceDb("seed-shape");
    await seedIfEmpty(db, "seed-shape");

    for (const gradebook of await db.gradebooks.toArray()) {
      const periods = await db.periods.where("gradebookId").equals(gradebook.id).toArray();
      const columns = await db.columns.where("gradebookId").equals(gradebook.id).toArray();
      expect(periods).toHaveLength(3);
      expect(columns.length).toBeGreaterThanOrEqual(5);
      for (const column of columns) {
        expect(periods.some((p) => p.id === column.periodId)).toBe(true);
      }
    }
    db.close();
  });

  it("writes grades that reference real students and columns", async () => {
    const db = openWorkspaceDb("seed-grades");
    await seedIfEmpty(db, "seed-grades");

    const grades = await db.grades.toArray();
    expect(grades.length).toBeGreaterThan(0);

    const studentIds = new Set((await db.students.toArray()).map((s) => s.id));
    const columnIds = new Set((await db.columns.toArray()).map((c) => c.id));
    for (const grade of grades) {
      expect(studentIds.has(grade.studentId)).toBe(true);
      expect(columnIds.has(grade.columnId)).toBe(true);
    }
    db.close();
  });

  it("does nothing on a database that already has classes", async () => {
    const db = openWorkspaceDb("seed-twice");
    await seedIfEmpty(db, "seed-twice");
    const before = await db.students.count();

    const seededAgain = await seedIfEmpty(db, "seed-twice");

    expect(seededAgain).toBe(false);
    expect(await db.students.count()).toBe(before);
    db.close();
  });

  it("never re-seeds after a wipe: the marker survives an emptied database", async () => {
    const db = openWorkspaceDb("seed-wiped");
    expect(await seedIfEmpty(db, "seed-wiped")).toBe(true);

    // Exactly what Réglages → "Supprimer toutes les données" does.
    for (const table of [
      db.classes,
      db.students,
      db.subjects,
      db.gradebooks,
      db.periods,
      db.columns,
      db.grades,
    ]) {
      await table.clear();
    }

    const seededAgain = await seedIfEmpty(db, "seed-wiped");

    expect(seededAgain).toBe(false);
    expect(await db.classes.count()).toBe(0);
    expect(await db.students.count()).toBe(0);
    db.close();
  });

  it("seeds a different workspace independently", async () => {
    const first = openWorkspaceDb("seed-ws-a");
    const second = openWorkspaceDb("seed-ws-b");

    expect(await seedIfEmpty(first, "seed-ws-a")).toBe(true);
    expect(await seedIfEmpty(second, "seed-ws-b")).toBe(true);

    first.close();
    second.close();
  });

  it("seeds one rubric template and one assessment per gradebook, partially filled", async () => {
    const db = openWorkspaceDb("seed-rubric");
    await seedIfEmpty(db, "seed-rubric");

    const templates = await db.rubricTemplates.toArray();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Exposé oral");
    expect(templates[0].criteria.map((c) => c.label)).toEqual([
      "Clarté",
      "Contenu",
      "Support",
      "Interaction",
    ]);

    const gradebooks = await db.gradebooks.toArray();
    const assessments = await db.rubricAssessments.toArray();
    expect(assessments).toHaveLength(gradebooks.length);

    const scores = await db.rubricScores.toArray();
    expect(scores.length).toBeGreaterThan(0);

    for (const assessment of assessments) {
      const gradebook = gradebooks.find((g) => g.id === assessment.gradebookId);
      if (!gradebook) throw new Error("assessment references an unknown gradebook");
      const studentCount =
        (await db.students.where("classId").equals(gradebook.classId).count()) *
        assessment.criteria.length;
      const assessmentScores = scores.filter((s) => s.assessmentId === assessment.id);
      // Roughly two thirds filled — never all of it, never none of it.
      expect(assessmentScores.length).toBeGreaterThan(0);
      expect(assessmentScores.length).toBeLessThan(studentCount);
      // Every scored criterion id belongs to this assessment's own copy.
      const criterionIds = new Set(assessment.criteria.map((c) => c.id));
      for (const score of assessmentScores) {
        expect(criterionIds.has(score.criterionId)).toBe(true);
      }
    }
    db.close();
  });
});
