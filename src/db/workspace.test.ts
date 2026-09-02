import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { wipeWorkspace } from "./workspace";

describe("wipeWorkspace", () => {
  it("leaves no row in any table", async () => {
    const db = openWorkspaceDb(`wipe-all-${crypto.randomUUID()}`);

    // One row in every table the schema declares. Written through `db.tables`
    // so a table added in a future version fails this test the day it is
    // declared without a wipe covering it, rather than the day a teacher
    // discovers their behaviour log outlived "supprimer toutes les données".
    await db.classes.add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    await db.students.add({
      id: "s1",
      classId: "c1",
      firstName: "Camille",
      lastName: "Durand",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.subjects.add({
      id: "sub1",
      name: "Maths",
      color: "#2563eb",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.gradebooks.add({
      id: "g1",
      classId: "c1",
      subjectId: "sub1",
      name: "Maths",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.periods.add({ id: "p1", gradebookId: "g1", name: "Trimestre 1", order: 0 });
    await db.columns.add({
      id: "col1",
      gradebookId: "g1",
      periodId: "p1",
      label: "DS1",
      type: "numeric",
      max: 20,
      weight: 1,
      order: 0,
    });
    await db.grades.add({
      gradebookId: "g1",
      columnId: "col1",
      studentId: "s1",
      value: { type: "numeric", value: 14 },
      updatedAt: 1,
    });
    await db.sessions.add({ id: "sess1", classId: "c1", date: 1, createdAt: 1 });
    await db.attendance.add({
      sessionId: "sess1",
      studentId: "s1",
      value: "absent",
      updatedAt: 1,
    });
    await db.behaviourEvents.add({
      id: "b1",
      sessionId: "sess1",
      studentId: "s1",
      classId: "c1",
      type: "red",
      comment: "mot dans le carnet",
      createdAt: 1,
    });
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 2, cols: 2, updatedAt: 1 });
    await db.seats.add({ layoutId: "l1", row: 0, col: 0, studentId: "s1" });
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria: [{ id: "cr1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "p1",
      name: "Exposé",
      date: 1,
      criteria: [{ id: "cr1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.add({
      assessmentId: "a1",
      criterionId: "cr1",
      studentId: "s1",
      level: 3,
      updatedAt: 1,
    });
    await db.studentGroups.add({
      id: "grp1",
      classId: "c1",
      name: "Rouges",
      color: "#dc2626",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.groupMembers.add({ groupId: "grp1", studentId: "s1" });
    await db.diaryEntries.add({
      classId: "c1",
      date: 1,
      text: "on a fait les fractions",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.scheduleEntries.add({
      id: "sch1",
      classId: "c1",
      weekday: 1,
      startMinute: 600,
      endMinute: 660,
      weekCycle: "all",
      createdAt: 1,
      updatedAt: 1,
    });

    // Every table really was seeded — a wipe over empty tables proves nothing.
    for (const table of db.tables) {
      expect([table.name, await table.count()]).toEqual([table.name, 1]);
    }

    await wipeWorkspace(db);

    for (const table of db.tables) {
      expect([table.name, await table.count()]).toEqual([table.name, 0]);
    }
    db.close();
  });
});
