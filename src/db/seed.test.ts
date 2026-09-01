import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

describe("seedIfEmpty", () => {
  it("creates the demo school on an empty database", async () => {
    const db = openWorkspaceDb("seed-empty");
    const seeded = await seedIfEmpty(db);

    expect(seeded).toBe(true);
    expect(await db.classes.count()).toBe(2);
    expect(await db.subjects.count()).toBe(2);
    expect(await db.gradebooks.count()).toBe(2);
    expect(await db.students.count()).toBe(46);
    db.close();
  });

  it("gives every gradebook three periods and at least five columns", async () => {
    const db = openWorkspaceDb("seed-shape");
    await seedIfEmpty(db);

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
    await seedIfEmpty(db);

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
    await seedIfEmpty(db);
    const before = await db.students.count();

    const seededAgain = await seedIfEmpty(db);

    expect(seededAgain).toBe(false);
    expect(await db.students.count()).toBe(before);
    db.close();
  });
});
