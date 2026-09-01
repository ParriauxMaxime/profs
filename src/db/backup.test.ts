import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { exportWorkspace, importWorkspace } from "./backup";
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
    const nonNumericGrade = sourceGrades.find((g) => g.value.type !== "numeric");
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
        version: 2,
        exportedAt: 0,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
      }),
    ).rejects.toThrow();

    expect(await db.classes.count()).toBe(classCountBefore);
    expect(await db.students.count()).toBe(studentCountBefore);
    expect(await db.classes.get(sampleBefore.id)).toEqual(sampleBefore);
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
});
