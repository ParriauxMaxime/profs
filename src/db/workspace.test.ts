import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { deleteWorkspaceDb, wipeWorkspace } from "./workspace";

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
    await db.sessions.add({
      id: "sess1",
      classId: "c1",
      date: 1,
      startsAt: 480,
      endsAt: 535,
      createdAt: 1,
    });
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
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria: [{ id: "cr1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.columns.add({
      id: "col2",
      gradebookId: "g1",
      periodId: "p1",
      label: "Projet",
      type: "rubric",
      max: 20,
      weight: 1,
      order: 1,
      criteria: [{ id: "cr1", label: "Clarté" }],
    });
    await db.criterionLevels.add({
      columnId: "col2",
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
    // The seed makes no salle, so one is put here for the same reason every
    // other table below is seeded: this test asserts every table is emptied,
    // and a table that is empty on both sides proves nothing.
    await db.rooms.add({
      id: "r1",
      name: "204",
      width: 20,
      height: 16,
      createdAt: 1,
      updatedAt: 1,
    });
    await db.desks.add({ id: "d1", roomId: "r1", x: 2, y: 2 });
    await db.seatingPlans.add({ id: "pl1", classId: "c1", roomId: "r1", updatedAt: 1 });
    await db.assignments.put({ planId: "pl1", deskId: "d1", studentId: "s1" });
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
    await db.settings.add({
      id: "workspace",
      escalation: { enabled: true, seances: 2, yellows: 2 },
    });

    // Every table really was seeded — a wipe over empty tables proves nothing.
    // Counted as "holds rows" rather than "holds exactly one": `columns` holds
    // two, since a level hangs off a rubric column and a grade off a numeric
    // one, and pinning the number would make the fixture's shape the assertion
    // instead of its completeness.
    for (const table of db.tables) {
      expect([table.name, (await table.count()) > 0]).toEqual([table.name, true]);
    }

    await wipeWorkspace(db);

    for (const table of db.tables) {
      expect([table.name, await table.count()]).toEqual([table.name, 0]);
    }
    db.close();
  });
});

describe("deleteWorkspaceDb", () => {
  it("removes the database, so reopening the same workspace id finds nothing", async () => {
    const workspaceId = `delete-${crypto.randomUUID()}`;
    const db = openWorkspaceDb(workspaceId);
    await db.classes.add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    db.close();

    await deleteWorkspaceDb(workspaceId);

    const reopened = openWorkspaceDb(workspaceId);
    expect(await reopened.classes.count()).toBe(0);
    reopened.close();
  });

  it("leaves other workspaces untouched", async () => {
    const doomedId = `doomed-${crypto.randomUUID()}`;
    const keptId = `kept-${crypto.randomUUID()}`;
    const doomed = openWorkspaceDb(doomedId);
    const kept = openWorkspaceDb(keptId);
    await doomed.classes.add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    await kept.classes.add({ id: "c2", name: "4°A", createdAt: 1, updatedAt: 1 });
    doomed.close();

    await deleteWorkspaceDb(doomedId);

    expect(await kept.classes.count()).toBe(1);
    kept.close();
  });

  it("resolves for a workspace that was never opened", async () => {
    await expect(deleteWorkspaceDb(`never-opened-${crypto.randomUUID()}`)).resolves.toBeUndefined();
  });
});
