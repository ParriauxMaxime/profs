import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";

describe("openWorkspaceDb", () => {
  it("names the database after the workspace", () => {
    const db = openWorkspaceDb("ws-1");
    expect(db.name).toBe("profs-ws-1");
    db.close();
  });

  it("stores and reads back a student", async () => {
    const db = openWorkspaceDb("ws-students");
    await db.students.add({
      id: "s1",
      classId: "c1",
      firstName: "Marie",
      lastName: "Dupont",
      createdAt: 1,
      updatedAt: 1,
    });
    const found = await db.students.where("classId").equals("c1").toArray();
    expect(found.map((s) => s.lastName)).toEqual(["Dupont"]);
    db.close();
  });

  it("upserts a grade on its compound key rather than duplicating it", async () => {
    const db = openWorkspaceDb("ws-grades");
    const base = { gradebookId: "g1", columnId: "col1", studentId: "s1", updatedAt: 1 };
    await db.grades.put({ ...base, value: { type: "numeric", value: 12 } });
    await db.grades.put({ ...base, value: { type: "numeric", value: 15 }, updatedAt: 2 });

    const all = await db.grades.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].value).toEqual({ type: "numeric", value: 15 });
    db.close();
  });

  it("finds a grade by its compound key", async () => {
    const db = openWorkspaceDb("ws-key");
    await db.grades.put({
      gradebookId: "g1",
      columnId: "col1",
      studentId: "s1",
      value: { type: "numeric", value: 9 },
      updatedAt: 1,
    });
    const found = await db.grades.get(gradeKey("g1", "col1", "s1"));
    expect(found?.value).toEqual({ type: "numeric", value: 9 });
    db.close();
  });

  it("queries every grade of one gradebook", async () => {
    const db = openWorkspaceDb("ws-bulk");
    await db.grades.bulkPut([
      {
        gradebookId: "g1",
        columnId: "c1",
        studentId: "s1",
        value: { type: "numeric", value: 1 },
        updatedAt: 1,
      },
      {
        gradebookId: "g1",
        columnId: "c1",
        studentId: "s2",
        value: { type: "numeric", value: 2 },
        updatedAt: 1,
      },
      {
        gradebookId: "g2",
        columnId: "c9",
        studentId: "s1",
        value: { type: "numeric", value: 3 },
        updatedAt: 1,
      },
    ]);
    const found = await db.grades.where("gradebookId").equals("g1").toArray();
    expect(found).toHaveLength(2);
    db.close();
  });
});
