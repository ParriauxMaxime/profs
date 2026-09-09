import "fake-indexeddb/auto";
import { hasBeenSeeded } from "@domain/workspaces";
import { openWorkspaceDb } from ".";
import { resetToFixture, seedIfEmpty } from "./seed";

describe("seedIfEmpty", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates the demo school on an empty database", async () => {
    const db = openWorkspaceDb("seed-empty");
    const seeded = await seedIfEmpty(db, "seed-empty");

    expect(seeded).toBe(true);
    // A whole collège: 6e to 3e, four classes each, one carnet per class.
    // A music teacher sees every pupil in the building, which is why the demo
    // school is the school rather than two sample classes.
    expect(await db.classes.count()).toBe(16);
    expect(await db.subjects.count()).toBe(1);
    expect(await db.gradebooks.count()).toBe(16);
    expect(await db.students.count()).toBe(360);
    db.close();
  });

  it("gives every class exactly one weekly lesson, plus the chorale", async () => {
    // The timetable is written out by hand and deliberately scattered, so a
    // class is one careless edit away from having no lesson at all — which
    // would leave it with a carnet, thirty pupils and nothing on Aujourd'hui,
    // and nothing else in the suite would notice.
    const db = openWorkspaceDb("seed-timetable");
    await seedIfEmpty(db, "seed-timetable");

    const classes = await db.classes.toArray();
    const entries = await db.scheduleEntries.toArray();
    const byClass = new Map(classes.map((c) => [c.id, c.name]));

    const lessonsPerClass = new Map(classes.map((c) => [c.name, 0]));
    for (const entry of entries) {
      const name = byClass.get(entry.classId);
      expect(name).toBeDefined();
      lessonsPerClass.set(name as string, (lessonsPerClass.get(name as string) ?? 0) + 1);
    }

    // Every class once, except 3°D which also holds the chorale.
    const surprises = [...lessonsPerClass].filter(
      ([name, count]) => count !== (name === "3°D" ? 2 : 1),
    );
    expect(surprises).toEqual([]);
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
    expect(templates[0].name).toBe("Projet musical");
    expect(templates[0].criteria.map((c) => c.label)).toEqual([
      "Justesse",
      "Rythme",
      "Écoute",
      "Engagement",
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

describe("resetToFixture", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("puts the demo school back over a workspace that has diverged from it", async () => {
    const db = openWorkspaceDb("reset-diverged");
    await seedIfEmpty(db, "reset-diverged");
    await db.classes.add({
      id: "extra",
      name: "Chorale bis",
      level: "6e",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.students.where("classId").equals("extra").delete();
    expect(await db.classes.count()).toBe(17);

    await resetToFixture(db, "reset-diverged");

    // The fixture, exactly — not the fixture plus what was there before.
    expect(await db.classes.count()).toBe(16);
    expect(await db.students.count()).toBe(360);
    expect(await db.classes.get("extra")).toBeUndefined();
    db.close();
  });

  it("seeds even though the workspace is already marked seeded", async () => {
    // The marker is what makes "supprimer toutes les données" stay wiped, so
    // a reset that did not clear it would wipe and then seed nothing at all —
    // the failure this test exists to catch.
    const db = openWorkspaceDb("reset-marked");
    await seedIfEmpty(db, "reset-marked");
    expect(hasBeenSeeded("reset-marked")).toBe(true);

    await resetToFixture(db, "reset-marked");

    expect(await db.classes.count()).toBe(16);
    expect(hasBeenSeeded("reset-marked")).toBe(true);
    db.close();
  });

  it("works on a workspace that was never seeded", async () => {
    const db = openWorkspaceDb("reset-fresh");
    await resetToFixture(db, "reset-fresh");

    expect(await db.classes.count()).toBe(16);
    db.close();
  });
});
