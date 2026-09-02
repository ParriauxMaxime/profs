import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { exportWorkspace, importWorkspace, parseBackup } from "./backup";
import { seedIfEmpty } from "./seed";

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

    expect(await target.classes.count()).toBe(2);
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

    await expect(
      importWorkspace(db, {
        version: 5,
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
        seatingLayouts: [],
        seats: [],
        rubricTemplates: [],
        rubricAssessments: [],
        rubricScores: [],
        studentGroups: [],
        groupMembers: [],
      }),
    ).rejects.toThrow();

    expect(await db.classes.count()).toBe(classCountBefore);
    expect(await db.students.count()).toBe(studentCountBefore);
    expect(await db.classes.get(sampleBefore.id)).toEqual(sampleBefore);
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
        seatingLayouts: [],
        seats: [],
        rubricTemplates: [],
        rubricAssessments: [],
        rubricScores: [],
      }),
    ).toThrow();
    db.close();
  });

  it("exports version 4 with the group tables", async () => {
    const db = openWorkspaceDb("backup-export-v4");
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
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
    expect(backup.version).toBe(4);
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
        seatingLayouts: [],
        seats: [],
      }),
    ).toThrow();
    db.close();
  });

  it("round-trips the classroom tables", async () => {
    const db = openWorkspaceDb("backup-round-trip-v2");
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "red",
      comment: "bavardage",
      createdAt: 1,
    });
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 2, cols: 2, updatedAt: 1 });
    await db.seats.put({ layoutId: "l1", row: 1, col: 1, studentId: "p1" });

    const backup = await exportWorkspace(db);
    await importWorkspace(db, backup);

    expect(await db.behaviourEvents.get("e1")).toMatchObject({
      type: "red",
      comment: "bavardage",
    });
    expect(await db.seats.get(["l1", 1, 1])).toMatchObject({ studentId: "p1" });
    db.close();
  });

  it("round-trips a rubric assessment's embedded criteria and its scores", async () => {
    const db = openWorkspaceDb("backup-round-trip-rubric");
    await db.rubricTemplates.add({
      id: "t1",
      name: "Exposé oral",
      criteria: [{ id: "c1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral du 12 mars",
      date: 1,
      criteria: [
        { id: "c1", label: "Clarté" },
        { id: "c2", label: "Contenu" },
      ],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.put({
      assessmentId: "a1",
      criterionId: "c1",
      studentId: "p1",
      level: 3,
      updatedAt: 1,
    });

    const backup = await exportWorkspace(db);
    await importWorkspace(db, JSON.parse(JSON.stringify(backup)));

    expect(await db.rubricTemplates.get("t1")).toMatchObject({ name: "Exposé oral" });
    expect((await db.rubricAssessments.get("a1"))?.criteria).toEqual([
      { id: "c1", label: "Clarté" },
      { id: "c2", label: "Contenu" },
    ]);
    expect(await db.rubricScores.get(["a1", "c1", "p1"])).toMatchObject({ level: 3 });
    db.close();
  });

  it("importing twice in a row replaces rather than accumulates, in every table", async () => {
    const db = openWorkspaceDb("backup-double-import");
    await seedIfEmpty(db, "backup-double-import");
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.attendance.put({ sessionId: "s1", studentId: "p1", value: "late", updatedAt: 1 });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "red",
      createdAt: 1,
    });
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 1, cols: 1, updatedAt: 1 });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria: [{ id: "c1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria: [{ id: "c1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.put({
      assessmentId: "a1",
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
      seatingLayouts: await db.seatingLayouts.count(),
      seats: await db.seats.count(),
      rubricTemplates: await db.rubricTemplates.count(),
      rubricAssessments: await db.rubricAssessments.count(),
      rubricScores: await db.rubricScores.count(),
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
      seatingLayouts: await db.seatingLayouts.count(),
      seats: await db.seats.count(),
      rubricTemplates: await db.rubricTemplates.count(),
      rubricAssessments: await db.rubricAssessments.count(),
      rubricScores: await db.rubricScores.count(),
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

  it("rejects a seat row missing studentId rather than letting it become a fourth state", async () => {
    const db = openWorkspaceDb("backup-bad-seat");
    await seedIfEmpty(db, "backup-bad-seat");

    const backup = await exportWorkspace(db);
    const corrupted = JSON.parse(JSON.stringify(backup));
    corrupted.seatingLayouts = [{ id: "l1", classId: "c1", rows: 1, cols: 1, updatedAt: 1 }];
    corrupted.seats = [{ layoutId: "l1", row: 0, col: 0 }];

    expect(() => parseBackup(corrupted)).toThrow();
    db.close();
  });
});

describe("exportWorkspace — unreachable rows", () => {
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
