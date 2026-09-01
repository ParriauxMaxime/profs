import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { deleteColumn, deleteStudent } from "./cascade";
import { seedIfEmpty } from "./seed";

describe("cascading deletes", () => {
  it("deleteColumn removes the column and every grade in it, and nothing else", async () => {
    const db = openWorkspaceDb("cascade-column");
    await seedIfEmpty(db, "cascade-column");

    const column = (await db.columns.toArray())[0];
    const before = await db.grades.count();
    const inColumn = await db.grades.where("columnId").equals(column.id).count();
    expect(inColumn).toBeGreaterThan(0);

    await deleteColumn(db, column.id);

    expect(await db.columns.get(column.id)).toBeUndefined();
    expect(await db.grades.where("columnId").equals(column.id).count()).toBe(0);
    expect(await db.grades.count()).toBe(before - inColumn);
    expect(await db.columns.count()).toBeGreaterThan(0);
    db.close();
  });

  it("deleteColumn on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-column-missing");
    await seedIfEmpty(db, "cascade-column-missing");
    const columns = await db.columns.count();
    const grades = await db.grades.count();

    await deleteColumn(db, "no-such-column");

    expect(await db.columns.count()).toBe(columns);
    expect(await db.grades.count()).toBe(grades);
    db.close();
  });

  it("deleteStudent removes the student and every grade of theirs, and nothing else", async () => {
    const db = openWorkspaceDb("cascade-student");
    await seedIfEmpty(db, "cascade-student");

    const student = (await db.students.toArray())[0];
    const before = await db.grades.count();
    const ofStudent = await db.grades.where("studentId").equals(student.id).count();
    expect(ofStudent).toBeGreaterThan(0);

    await deleteStudent(db, student.id);

    expect(await db.students.get(student.id)).toBeUndefined();
    expect(await db.grades.where("studentId").equals(student.id).count()).toBe(0);
    expect(await db.grades.count()).toBe(before - ofStudent);
    expect(await db.students.count()).toBeGreaterThan(0);
    db.close();
  });

  it("deleteStudent on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-student-missing");
    await seedIfEmpty(db, "cascade-student-missing");
    const students = await db.students.count();
    const grades = await db.grades.count();

    await deleteStudent(db, "no-such-student");

    expect(await db.students.count()).toBe(students);
    expect(await db.grades.count()).toBe(grades);
    db.close();
  });
});
