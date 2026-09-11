import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { BackupOverCapacityError, exportWorkspace, importWorkspace, parseBackup } from "./backup";
import { seedIfEmpty } from "./seed";
import { readEscalation, writeEscalation } from "./settings";
import { wipeWorkspace } from "./workspace";

/**
 * The double-import tests seed the demo school — sixteen classes, 360 pupils —
 * and then import that whole export twice, which makes them the heaviest
 * fake-indexeddb workload in the suite.
 *
 * The gap was measured, not assumed: the file runs in 9.5s locally and 35.4s
 * on CI, and each double-import test takes under 2s here. A runner ~3.7x
 * slower puts that just past Jest's 5s default, which is exactly where it
 * landed once the demo school grew (run 34271881990) — the export and the
 * import did not change. If either ever becomes slow in the BROWSER, this
 * timeout is not the thing to raise.
 */
jest.setTimeout(30_000);

describe("workspace backup", () => {
  it("round-trips a seeded workspace into an empty one, values intact", async () => {
    const source = openWorkspaceDb("backup-source");
    await seedIfEmpty(source, "backup-source");
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-target");
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    expect(await target.classes.count()).toBe(await source.classes.count());
    expect(await target.students.count()).toBe(await source.students.count());
    expect(await target.grades.count()).toBe(await source.grades.count());

    const sourceClass = (await source.classes.toArray())[0];
    const targetClass = await target.classes.get(sourceClass.id);
    expect(targetClass?.name).toBe(sourceClass.name);

    const sourceStudent = (await source.students.toArray())[0];
    const targetStudent = await target.students.get(sourceStudent.id);
    expect(targetStudent?.firstName).toBe(sourceStudent.firstName);
    expect(targetStudent?.lastName).toBe(sourceStudent.lastName);

    const sourceColumn = (await source.columns.toArray())[0];
    const targetColumn = await target.columns.get(sourceColumn.id);
    expect(targetColumn?.weight).toBe(sourceColumn.weight);
    expect(targetColumn?.max).toBe(sourceColumn.max);

    // A non-numeric grade proves the discriminated union survives JSON.stringify
    // with its `type` intact, not just its outer shape.
    const sourceGrades = await source.grades.toArray();
    const nonNumericGrade = sourceGrades.find(
      (g) => g.value !== undefined && g.value.type !== "numeric",
    );
    if (!nonNumericGrade) throw new Error("seed did not produce a non-numeric grade");
    const targetGrade = await target.grades.get([
      nonNumericGrade.gradebookId,
      nonNumericGrade.columnId,
      nonNumericGrade.studentId,
    ]);
    expect(targetGrade?.value).toEqual(nonNumericGrade.value);

    source.close();
    target.close();
  });

  it("replaces existing content rather than merging into it", async () => {
    const source = openWorkspaceDb("backup-replace-source");
    await seedIfEmpty(source, "backup-replace-source");
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-replace-target");
    await seedIfEmpty(target, "backup-replace-target");
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    // The demo collège, not the demo collège twice: import replaces.
    expect(await target.classes.count()).toBe(16);
    source.close();
    target.close();
  });

  it("rejects a payload that is not a backup, leaving existing data untouched", async () => {
    const db = openWorkspaceDb("backup-bad");
    await seedIfEmpty(db, "backup-bad");
    const classCountBefore = await db.classes.count();
    const studentCountBefore = await db.students.count();
    const sampleBefore = (await db.classes.toArray())[0];

    await expect(importWorkspace(db, { hello: "world" })).rejects.toThrow();

    expect(await db.classes.count()).toBe(classCountBefore);
    expect(await db.students.count()).toBe(studentCountBefore);
    expect(await db.classes.get(sampleBefore.id)).toEqual(sampleBefore);
    db.close();
  });

  it("rejects a backup from a future version, leaving existing data untouched", async () => {
    const db = openWorkspaceDb("backup-future");
    await seedIfEmpty(db, "backup-future");
    const classCountBefore = await db.classes.count();
    const studentCountBefore = await db.students.count();
    const sampleBefore = (await db.classes.toArray())[0];

    // Every key the CURRENT schema wants is present, so the only thing wrong
    // with this file is that it comes from the future. Leaving a key out would
    // make it fail the shape check instead, and the test would pass while
    // asserting nothing about the version at all.
    await expect(
      importWorkspace(db, {
        version: 15,
        exportedAt: 0,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
        rubricTemplates: [],
        criterionLevels: [],
        studentGroups: [],
        groupMembers: [],
        scheduleEntries: [],
        rooms: [],
        desks: [],
        seatingPlans: [],
        assignments: [],
        settings: [],
      }),
    ).rejects.toThrow();

    expect(await db.classes.count()).toBe(classCountBefore);
    expect(await db.students.count()).toBe(studentCountBefore);
    expect(await db.classes.get(sampleBefore.id)).toEqual(sampleBefore);
    db.close();
  });

  it("rejects a version 10 backup rather than silently dropping its journal", async () => {
    // A v10 file predates the séance-owned note: its journal lived in
    // `diaryEntries`, a day-keyed store that no longer exists. Before the
    // schema literal was bumped to 11, this exact payload PARSED — zod strips
    // an object's unrecognised top-level key rather than failing on it — so
    // importing an old backup silently threw away every journal entry with no
    // error at all. `diaryEntries` is included here to pin that regression.
    const db = openWorkspaceDb("backup-import-v10");
    expect(() =>
      parseBackup({
        version: 10,
        exportedAt: 1,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
        rooms: [],
        desks: [],
        seatingPlans: [],
        assignments: [],
        rubricTemplates: [],
        criterionLevels: [],
        studentGroups: [],
        groupMembers: [],
        scheduleEntries: [],
        diaryEntries: [],
      }),
    ).toThrow();
    db.close();
  });

  it("exports at version 14", async () => {
    const db = openWorkspaceDb(`backup-v14-${crypto.randomUUID()}`);
    expect((await exportWorkspace(db)).version).toBe(14);
    db.close();
  });

  it("refuses every file from before the grille was a column", async () => {
    // 11 and 12 both export rubricAssessments, a store that no longer exists, so
    // both carry grilles with nowhere to land. Half-importing is worse than
    // refusing: the grilles would vanish silently rather than the file being
    // turned away. From here only the current format is accepted — a file is
    // importable only while every store it names still exists.
    const db = openWorkspaceDb(`backup-old-${crypto.randomUUID()}`);
    const current = await exportWorkspace(db);
    for (const version of [10, 11, 12]) {
      expect(() => parseBackup({ ...current, version })).toThrow();
    }
    expect(() => parseBackup(current)).not.toThrow();
    db.close();
  });

  it("rejects a version 5 backup rather than half-importing it", async () => {
    // A v5 file predates the journal. Importing it would restore every class,
    // gradebook and lesson while silently losing a year of written notes —
    // and a workspace that looks complete is worse than one that refuses.
    const db = openWorkspaceDb("backup-import-v5");
    expect(() =>
      parseBackup({
        version: 5,
        exportedAt: 1,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
        rubricTemplates: [],
        criterionLevels: [],
        studentGroups: [],
        groupMembers: [],
        scheduleEntries: [],
        rooms: [],
      }),
    ).toThrow();
    db.close();
  });

  it("rejects a version 4 backup rather than half-importing it", async () => {
    // A v4 file predates the recurring timetable. Importing it would leave a
    // workspace whose classes and gradebooks are all present and whose week is
    // silently empty — half a workspace looks like a whole one.
    const db = openWorkspaceDb("backup-import-v4");
    expect(() =>
      parseBackup({
        version: 4,
        exportedAt: 1,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
        rubricTemplates: [],
        criterionLevels: [],
        studentGroups: [],
        groupMembers: [],
        scheduleEntries: [],
        rooms: [],
      }),
    ).toThrow();
    db.close();
  });

  it("rejects a version 3 backup rather than half-importing it", async () => {
    const db = openWorkspaceDb("backup-import-v3");
    expect(() =>
      parseBackup({
        version: 3,
        exportedAt: 1,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
        rubricTemplates: [],
        criterionLevels: [],
      }),
    ).toThrow();
    db.close();
  });

  it("exports the current version with every table", async () => {
    const db = openWorkspaceDb("backup-export-v4");
    await db.sessions.add({
      id: "s1",
      classId: "c1",
      date: 1,
      startsAt: 540,
      endsAt: 595,
      createdAt: 1,
    });
    await db.attendance.put({ sessionId: "s1", studentId: "p1", value: "late", updatedAt: 1 });
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.studentGroups.add({
      id: "g1",
      classId: "c1",
      name: "Groupe A",
      color: "#2563eb",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.groupMembers.put({ groupId: "g1", studentId: "p1" });
    const backup = await exportWorkspace(db);
    expect(backup.version).toBe(14);
    expect(backup.sessions).toHaveLength(1);
    expect(backup.attendance).toHaveLength(1);
    expect(backup.rubricTemplates).toHaveLength(1);
    expect(backup.studentGroups).toHaveLength(1);
    expect(backup.groupMembers).toHaveLength(1);
    db.close();
  });

  it("rejects a version 2 backup rather than half-importing it", async () => {
    const db = openWorkspaceDb("backup-import-v2");
    expect(() =>
      parseBackup({
        version: 2,
        exportedAt: 1,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
        sessions: [],
        attendance: [],
        behaviourEvents: [],
      }),
    ).toThrow();
    db.close();
  });

  it("round-trips the classroom tables", async () => {
    const db = openWorkspaceDb("backup-round-trip-v2");
    await db.sessions.add({
      id: "s1",
      classId: "c1",
      date: 1,
      startsAt: 540,
      endsAt: 595,
      createdAt: 1,
    });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "red",
      comment: "bavardage",
      createdAt: 1,
    });

    const backup = await exportWorkspace(db);
    await importWorkspace(db, backup);

    expect(await db.behaviourEvents.get("e1")).toMatchObject({
      type: "red",
      comment: "bavardage",
    });
    db.close();
  });

  it("round-trips a rubric column's embedded critères and its levels", async () => {
    const db = openWorkspaceDb("backup-round-trip-rubric");
    await db.rubricTemplates.add({
      id: "t1",
      name: "Exposé oral",
      criteria: [{ id: "c1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.columns.add({
      id: "col1",
      gradebookId: "g1",
      periodId: "pe1",
      type: "rubric",
      label: "Oral du 12 mars",
      weight: 1,
      max: 20,
      order: 0,
      date: 1,
      criteria: [
        { id: "c1", label: "Clarté" },
        { id: "c2", label: "Contenu" },
      ],
    });
    await db.criterionLevels.put({
      columnId: "col1",
      criterionId: "c1",
      studentId: "p1",
      level: 3,
      updatedAt: 1,
    });

    const backup = await exportWorkspace(db);
    await importWorkspace(db, JSON.parse(JSON.stringify(backup)));

    expect(await db.rubricTemplates.get("t1")).toMatchObject({ name: "Exposé oral" });
    expect((await db.columns.get("col1"))?.criteria).toEqual([
      { id: "c1", label: "Clarté" },
      { id: "c2", label: "Contenu" },
    ]);
    expect(await db.criterionLevels.get(["col1", "c1", "p1"])).toMatchObject({ level: 3 });
    db.close();
  });

  it("importing twice in a row replaces rather than accumulates, in every table", async () => {
    const db = openWorkspaceDb("backup-double-import");
    await seedIfEmpty(db, "backup-double-import");
    await db.sessions.add({
      id: "s1",
      classId: "c1",
      date: 1,
      startsAt: 540,
      endsAt: 595,
      createdAt: 1,
    });
    await db.attendance.put({ sessionId: "s1", studentId: "p1", value: "late", updatedAt: 1 });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "red",
      createdAt: 1,
    });
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria: [{ id: "c1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.columns.add({
      id: "col1",
      gradebookId: "g1",
      periodId: "pe1",
      type: "rubric",
      label: "Oral",
      weight: 1,
      max: 20,
      order: 0,
      date: 1,
      criteria: [{ id: "c1", label: "Clarté" }],
    });
    await db.criterionLevels.put({
      columnId: "col1",
      criterionId: "c1",
      studentId: "p1",
      level: 2,
      updatedAt: 1,
    });

    const backup = await exportWorkspace(db);

    await importWorkspace(db, JSON.parse(JSON.stringify(backup)));
    const firstImportCounts = {
      classes: await db.classes.count(),
      students: await db.students.count(),
      grades: await db.grades.count(),
      sessions: await db.sessions.count(),
      attendance: await db.attendance.count(),
      behaviourEvents: await db.behaviourEvents.count(),
      rubricTemplates: await db.rubricTemplates.count(),
      criterionLevels: await db.criterionLevels.count(),
      studentGroups: await db.studentGroups.count(),
      groupMembers: await db.groupMembers.count(),
    };
    expect(firstImportCounts.studentGroups).toBeGreaterThan(0);
    expect(firstImportCounts.groupMembers).toBeGreaterThan(0);

    await importWorkspace(db, JSON.parse(JSON.stringify(backup)));
    const secondImportCounts = {
      classes: await db.classes.count(),
      students: await db.students.count(),
      grades: await db.grades.count(),
      sessions: await db.sessions.count(),
      attendance: await db.attendance.count(),
      behaviourEvents: await db.behaviourEvents.count(),
      rubricTemplates: await db.rubricTemplates.count(),
      criterionLevels: await db.criterionLevels.count(),
      studentGroups: await db.studentGroups.count(),
      groupMembers: await db.groupMembers.count(),
    };

    expect(secondImportCounts).toEqual(firstImportCounts);
    db.close();
  });

  it("rejects a backup whose grade value is malformed, leaving existing data untouched", async () => {
    const db = openWorkspaceDb("backup-bad-grade");
    await seedIfEmpty(db, "backup-bad-grade");
    const classCountBefore = await db.classes.count();
    const gradeCountBefore = await db.grades.count();
    const sampleBefore = (await db.classes.toArray())[0];

    const backup = await exportWorkspace(db);
    const corrupted = JSON.parse(JSON.stringify(backup));
    corrupted.grades[0].value = "5";

    await expect(importWorkspace(db, corrupted)).rejects.toThrow();

    expect(await db.classes.count()).toBe(classCountBefore);
    expect(await db.grades.count()).toBe(gradeCountBefore);
    expect(await db.classes.get(sampleBefore.id)).toEqual(sampleBefore);
    db.close();
  });

  it("drops grades whose value no longer parses, so the export can be imported", async () => {
    const db = openWorkspaceDb(`backup-stale-${crypto.randomUUID()}`);
    await db.grades.bulkPut([
      {
        gradebookId: "g1",
        columnId: "c1",
        studentId: "p1",
        value: { type: "numeric", value: 14 },
        updatedAt: 1,
      },
      // A row left behind by a workspace created before `attendance` stopped
      // being a column type. Its column no longer exists.
      {
        gradebookId: "g1",
        columnId: "c2",
        studentId: "p1",
        value: { type: "attendance", value: "absent" },
        updatedAt: 1,
      } as unknown as Parameters<typeof db.grades.put>[0],
    ]);

    const backup = await exportWorkspace(db);

    expect(backup.grades).toHaveLength(1);
    expect(backup.grades[0].columnId).toBe("c1");
    // The whole point: the export round-trips instead of being rejected.
    expect(() => parseBackup(backup)).not.toThrow();
    db.close();
  });
});

describe("exportWorkspace — note-only rows", () => {
  it("keeps a row that carries a note but no mark, and round-trips it", async () => {
    const db = openWorkspaceDb(`backup-note-${crypto.randomUUID()}`);
    await db.grades.bulkPut([
      {
        gradebookId: "g1",
        columnId: "c1",
        studentId: "p1",
        value: { type: "numeric", value: 14 },
        note: "copie rendue en retard",
        updatedAt: 1,
      },
      // No value at all: the teacher noted something before there was a mark.
      {
        gradebookId: "g1",
        columnId: "c2",
        studentId: "p1",
        note: "absent, à rattraper",
        updatedAt: 1,
      } as Parameters<typeof db.grades.put>[0],
    ]);

    const backup = await exportWorkspace(db);
    expect(backup.grades).toHaveLength(2);
    expect(() => parseBackup(backup)).not.toThrow();

    await importWorkspace(db, backup);
    const restored = await db.grades.get(["g1", "c2", "p1"]);
    expect(restored?.note).toBe("absent, à rattraper");
    expect(restored?.value).toBeUndefined();
    db.close();
  });
});

describe("export completeness", () => {
  it("carries every table the schema declares", async () => {
    // The hole the double-import guard does NOT cover, found the hard way:
    // that test compares counts before and after a second import, so a table
    // missing from the backup ENTIRELY keeps its count on both passes and
    // looks perfectly healthy. The journal's day-keyed table was absent from
    // export and import for a whole commit while every backup test passed.
    //
    // Asserted over db.tables so the next schema version is covered the day
    // it is declared.
    const db = openWorkspaceDb(`backup-complete-${crypto.randomUUID()}`);
    const backup = (await exportWorkspace(db)) as unknown as Record<string, unknown>;

    for (const table of db.tables) {
      expect([table.name, Array.isArray(backup[table.name])]).toEqual([table.name, true]);
    }
    db.close();
  });

  it("restores every table, so nothing is exported and then dropped on the way back", async () => {
    const db = openWorkspaceDb(`backup-restore-${crypto.randomUUID()}`);
    await seedIfEmpty(db, `backup-restore-${crypto.randomUUID()}`);
    // The demo school has no discipline rule of its own: without this, the
    // settings table would sit at zero rows both before and after, and the
    // "every table really held rows" assertion below would prove nothing
    // about it.
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });

    const before: Record<string, number> = {};
    for (const table of db.tables) before[table.name] = await table.count();

    const backup = JSON.parse(JSON.stringify(await exportWorkspace(db)));
    await wipeWorkspace(db);
    await importWorkspace(db, backup);

    const after: Record<string, number> = {};
    for (const table of db.tables) after[table.name] = await table.count();

    // Photos are Blobs and cannot survive JSON, but no ROW is lost — only the
    // photo field on a student. Row counts must match exactly.
    expect(after).toEqual(before);
    for (const [name, count] of Object.entries(before)) {
      expect([name, count > 0]).toEqual([name, true]);
    }
    db.close();
  });
});

describe("importing twice", () => {
  it("leaves identical row counts, table by table", async () => {
    // The guard against a table added to the WRITES but not to the clear
    // list: the first import looks perfect, and the second doubles that
    // table — or throws on a duplicate key — long after anyone is watching.
    // Asserted over db.tables rather than a hand-written list, so the next
    // schema version is covered the day it is declared.
    const db = openWorkspaceDb(`backup-double-${crypto.randomUUID()}`);
    await seedIfEmpty(db, `backup-double-${crypto.randomUUID()}`);
    // The demo school carries no discipline rule of its own, so without this
    // the settings table would sit at zero both times and the "every table
    // really held rows" assertion below would prove nothing about it.
    await writeEscalation(db, { enabled: false, seances: 3, yellows: 2 });
    await db.scheduleEntries.add({
      id: "sch1",
      classId: (await db.classes.toArray())[0].id,
      weekday: 1,
      startMinute: 600,
      endMinute: 660,
      weekCycle: "all",
      createdAt: 1,
      updatedAt: 1,
    });

    const backup = JSON.parse(JSON.stringify(await exportWorkspace(db)));

    await importWorkspace(db, backup);
    const first: Record<string, number> = {};
    for (const table of db.tables) first[table.name] = await table.count();

    await importWorkspace(db, backup);
    const second: Record<string, number> = {};
    for (const table of db.tables) second[table.name] = await table.count();

    expect(second).toEqual(first);
    // Every table really did hold rows, or equal counts prove nothing: two
    // empty tables also match. Listed per table so a failure names which one.
    for (const [name, count] of Object.entries(first)) {
      expect([name, count > 0]).toEqual([name, true]);
    }
    db.close();
  });
});

describe("class-size ceiling on import", () => {
  /** A minimal, schema-valid backup carrying `count` pupils in one class. */
  function backupWithRoster(count: number) {
    return {
      version: 14,
      exportedAt: Date.now(),
      classes: [{ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 }],
      students: Array.from({ length: count }, (_, i) => ({
        id: `s${i}`,
        classId: "c1",
        lastName: `NOM${i}`,
        firstName: "Test",
        createdAt: 1,
        updatedAt: 1,
      })),
      subjects: [],
      gradebooks: [],
      periods: [],
      columns: [],
      grades: [],
      sessions: [],
      attendance: [],
      behaviourEvents: [],
      rubricTemplates: [],
      criterionLevels: [],
      studentGroups: [],
      groupMembers: [],
      scheduleEntries: [],
      rooms: [],
      desks: [],
      seatingPlans: [],
      assignments: [],
      settings: [],
    };
  }

  it("accepts a class sitting exactly on the ceiling", () => {
    expect(() => parseBackup(backupWithRoster(100))).not.toThrow();
  });

  it("refuses a file whose class exceeds the ceiling, naming the class", () => {
    try {
      parseBackup(backupWithRoster(101));
      throw new Error("expected parseBackup to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BackupOverCapacityError);
      expect((error as BackupOverCapacityError).classIds).toEqual(["c1"]);
    }
  });

  it("leaves the workspace untouched when it refuses", async () => {
    // The refusal has to happen before the transaction that clears every
    // table, or a rejected file would still have destroyed the workspace.
    const db = openWorkspaceDb("backup-over-capacity");
    await seedIfEmpty(db, "backup-over-capacity");
    const before = await db.students.count();

    await expect(importWorkspace(db, backupWithRoster(101))).rejects.toBeInstanceOf(
      BackupOverCapacityError,
    );

    expect(await db.students.count()).toBe(before);
    expect(await db.classes.count()).toBeGreaterThan(0);
    db.close();
  });
});

describe("the settings store in a backup", () => {
  it("exports the workspace's rule and reads it back", async () => {
    const db = openWorkspaceDb(`backup-settings-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });

    const backup = await exportWorkspace(db);
    expect(backup.version).toBe(14);
    expect(backup.settings).toEqual([
      { id: "workspace", escalation: { enabled: true, seances: 4, yellows: 3 } },
    ]);

    await importWorkspace(db, parseBackup(JSON.parse(JSON.stringify(backup))));
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 4, yellows: 3 });
    db.close();
  });

  it("refuses a format-13 file", () => {
    const stale = { version: 13, exportedAt: 1, classes: [], students: [] };
    expect(() => parseBackup(stale)).toThrow();
  });

  it("leaves no second settings row after a double import", async () => {
    const db = openWorkspaceDb(`backup-settings-twice-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: false, seances: 3, yellows: 2 });
    const backup = parseBackup(JSON.parse(JSON.stringify(await exportWorkspace(db))));
    await importWorkspace(db, backup);
    await importWorkspace(db, backup);
    expect(await db.settings.count()).toBe(1);
    db.close();
  });
});
