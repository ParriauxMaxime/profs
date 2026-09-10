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

  it("seats every class in the salle its level is taught in", async () => {
    // Room counts belong beside the class and pupil counts above: they are
    // fixed, unlike the séance history, which grows with the calendar.
    //
    // The plan-per-level assertion is the one that earns its place. Nothing
    // else notices if the level lists and the salles drift apart — a class
    // would simply be seated in the wrong room, with the right number of
    // pupils, and every other test would still pass.
    const db = openWorkspaceDb("seed-salles");
    await seedIfEmpty(db, "seed-salles");

    const rooms = await db.rooms.toArray();
    expect(rooms.map((r) => r.name).sort()).toEqual(["101", "102"]);

    const deskCount = new Map<string, number>();
    for (const room of rooms) {
      deskCount.set(room.name, await db.desks.where("roomId").equals(room.id).count());
    }
    // 4 rangs × 3 tables × 2 places, and 3 rangs bombés de 10.
    expect(deskCount.get("101")).toBe(24);
    expect(deskCount.get("102")).toBe(30);

    const salleByName = new Map(rooms.map((r) => [r.name, r.id]));
    const classes = await db.classes.toArray();
    const plans = await db.seatingPlans.toArray();
    expect(plans).toHaveLength(classes.length);

    const planByClass = new Map(plans.map((p) => [p.classId, p.roomId]));
    for (const schoolClass of classes) {
      const expected = salleByName.get(
        schoolClass.level === "6e" || schoolClass.level === "5e" ? "101" : "102",
      );
      expect(planByClass.get(schoolClass.id)).toBe(expected);
    }
    db.close();
  });

  it("points every lesson at the salle its class is seated in", async () => {
    // The timetable carries its own roomId, so it can name a salle the class
    // never sits in — a disagreement no screen would surface, since the class
    // page picks the salle and Aujourd'hui only colours by subject.
    const db = openWorkspaceDb("seed-lesson-salle");
    await seedIfEmpty(db, "seed-lesson-salle");

    const planByClass = new Map(
      (await db.seatingPlans.toArray()).map((p) => [p.classId, p.roomId]),
    );
    const entries = await db.scheduleEntries.toArray();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.roomId).toBe(planByClass.get(entry.classId));
    }
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

  it("seeds one rubric template and one rubric column per carnet, partially filled", async () => {
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
    const rubricColumns = (await db.columns.toArray()).filter((c) => c.type === "rubric");
    expect(rubricColumns).toHaveLength(gradebooks.length);

    const levels = await db.criterionLevels.toArray();
    expect(levels.length).toBeGreaterThan(0);

    for (const column of rubricColumns) {
      const gradebook = gradebooks.find((g) => g.id === column.gradebookId);
      if (!gradebook) throw new Error("a rubric column references an unknown carnet");
      // The column sits in the carnet's own first period, like every other
      // column the seed writes.
      const periods = await db.periods.where("gradebookId").equals(gradebook.id).toArray();
      const firstPeriod = periods.sort((a, b) => a.order - b.order)[0];
      expect(column.periodId).toBe(firstPeriod.id);
      expect(column.date).toBeDefined();

      const criteria = column.criteria ?? [];
      expect(criteria.map((c) => c.label)).toEqual(templates[0].criteria.map((c) => c.label));
      // Fresh ids, never the template's: a level written against one column
      // must not be readable from another.
      for (const criterion of criteria) {
        expect(templates[0].criteria.some((t) => t.id === criterion.id)).toBe(false);
      }

      const cellCount =
        (await db.students.where("classId").equals(gradebook.classId).count()) * criteria.length;
      const columnLevels = levels.filter((l) => l.columnId === column.id);
      // Roughly two thirds filled — never all of it, never none of it.
      expect(columnLevels.length).toBeGreaterThan(0);
      expect(columnLevels.length).toBeLessThan(cellCount);
      // Every level's critère belongs to this column's own copy.
      const criterionIds = new Set(criteria.map((c) => c.id));
      for (const level of columnLevels) {
        expect(criterionIds.has(level.criterionId)).toBe(true);
      }
    }
    db.close();
  });
});

describe("the demo roster reads like a school, not like a generator", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps shared surnames rare, and no surname common", async () => {
    const db = openWorkspaceDb("seed-names");
    await seedIfEmpty(db, "seed-names");
    const students = await db.students.toArray();

    const counts = new Map<string, number>();
    for (const student of students) {
      counts.set(student.lastName, (counts.get(student.lastName) ?? 0) + 1);
    }

    // Two separate properties, and the 60-name pool this replaced satisfied
    // the first while failing the second 60 times over: every surname was 6
    // of 360 — comfortably under 2% — yet EVERY pupil had five namesakes, and
    // a roster sorted by surname read CHEVALIER six times before CLEMENT.
    const largest = Math.max(...counts.values());
    expect(largest / students.length).toBeLessThanOrEqual(0.02);

    const sharing = [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
    expect(sharing / students.length).toBeLessThanOrEqual(0.02);

    // Rare, but not absent: a collège has siblings, and a pool the size of the
    // roster would quietly assert that no two pupils are ever related.
    expect(sharing).toBeGreaterThan(0);
    db.close();
  });

  it("gives no two pupils the same full name", async () => {
    const db = openWorkspaceDb("seed-fullnames");
    await seedIfEmpty(db, "seed-fullnames");
    const students = await db.students.toArray();

    const full = new Set(students.map((s) => `${s.lastName} ${s.firstName}`));

    // The two pools are walked out of step precisely so the siblings above do
    // not collide into one person.
    expect(full.size).toBe(students.length);
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
