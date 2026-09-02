import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";
import {
  deleteClass,
  deleteColumn,
  deleteDiaryEntry,
  deleteGradebook,
  deleteGroup,
  deletePeriod,
  deleteRubricAssessment,
  deleteRubricTemplate,
  deleteScheduleEntry,
  deleteSeatingLayout,
  deleteSession,
  deleteStudent,
  deleteSubject,
} from "./cascade";
import { seedIfEmpty } from "./seed";
import { createSession } from "./sessions";

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

  it("deleteColumn removes its id from a calculation column that references it", async () => {
    const db = openWorkspaceDb("cascade-column-calc-referencing");
    const gradebookId = "gb1";
    const periodId = "p1";
    await db.columns.bulkAdd([
      { id: "a", gradebookId, periodId, type: "numeric", label: "A", weight: 1, max: 20, order: 0 },
      { id: "b", gradebookId, periodId, type: "numeric", label: "B", weight: 1, max: 20, order: 1 },
      {
        id: "calc",
        gradebookId,
        periodId,
        type: "calculation",
        label: "Mean",
        weight: 1,
        max: 20,
        order: 2,
        calculation: { kind: "mean", sourceColumnIds: ["a", "b"] },
      },
    ]);

    await deleteColumn(db, "a");

    const calc = await db.columns.get("calc");
    expect(calc?.calculation?.sourceColumnIds).toEqual(["b"]);
    db.close();
  });

  it("leaves a calculation column referencing a different column untouched", async () => {
    const db = openWorkspaceDb("cascade-column-calc-other");
    const gradebookId = "gb1";
    const periodId = "p1";
    await db.columns.bulkAdd([
      { id: "a", gradebookId, periodId, type: "numeric", label: "A", weight: 1, max: 20, order: 0 },
      { id: "c", gradebookId, periodId, type: "numeric", label: "C", weight: 1, max: 20, order: 1 },
      {
        id: "calc2",
        gradebookId,
        periodId,
        type: "calculation",
        label: "Sum",
        weight: 1,
        max: 20,
        order: 2,
        calculation: { kind: "sum", sourceColumnIds: ["c"] },
      },
    ]);

    await deleteColumn(db, "a");

    const calc = await db.columns.get("calc2");
    expect(calc?.calculation?.sourceColumnIds).toEqual(["c"]);
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

  it("removes the student's group memberships without touching the group or its other members", async () => {
    const db = openWorkspaceDb("cascade-student-groups");
    await seedIfEmpty(db, "cascade-student-groups");

    const group = (await db.studentGroups.toArray())[0];
    const members = await db.groupMembers.where("groupId").equals(group.id).toArray();
    expect(members.length).toBeGreaterThan(1);
    const [doomed, survivor] = members;

    await deleteStudent(db, doomed.studentId);

    expect(await db.groupMembers.get([group.id, doomed.studentId])).toBeUndefined();
    expect(await db.studentGroups.get(group.id)).toBeDefined();
    expect(await db.groupMembers.get([group.id, survivor.studentId])).toBeDefined();
    db.close();
  });
});

describe("deleteGroup", () => {
  it("removes the group and its memberships, leaving the pupils untouched", async () => {
    const db = openWorkspaceDb("cascade-group");
    await seedIfEmpty(db, "cascade-group");

    const [group, survivorGroup] = await db.studentGroups.toArray();
    const memberIds = (await db.groupMembers.where("groupId").equals(group.id).toArray()).map(
      (m) => m.studentId,
    );
    expect(memberIds.length).toBeGreaterThan(0);
    const studentsBefore = await db.students.count();

    await deleteGroup(db, group.id);

    expect(await db.studentGroups.get(group.id)).toBeUndefined();
    expect(await db.groupMembers.where("groupId").equals(group.id).count()).toBe(0);
    // The pupils themselves survive — deleting a grouping must never delete a person.
    expect(await db.students.count()).toBe(studentsBefore);
    for (const studentId of memberIds) {
      expect(await db.students.get(studentId)).toBeDefined();
    }
    // The sibling group is untouched.
    expect(await db.studentGroups.get(survivorGroup.id)).toBeDefined();
    expect(await db.groupMembers.where("groupId").equals(survivorGroup.id).count()).toBeGreaterThan(
      0,
    );
    db.close();
  });

  it("on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-group-missing");
    await seedIfEmpty(db, "cascade-group-missing");
    const groups = await db.studentGroups.count();
    const members = await db.groupMembers.count();

    await deleteGroup(db, "no-such-group");

    expect(await db.studentGroups.count()).toBe(groups);
    expect(await db.groupMembers.count()).toBe(members);
    db.close();
  });
});

describe("deleteGradebook", () => {
  it("removes the gradebook, its periods, its columns and all its grades", async () => {
    const db = openWorkspaceDb("cascade-gradebook");
    await seedIfEmpty(db, "cascade-gradebook");

    const [gradebook, survivor] = await db.gradebooks.toArray();
    const periods = await db.periods.where("gradebookId").equals(gradebook.id).count();
    const columns = await db.columns.where("gradebookId").equals(gradebook.id).count();
    const grades = await db.grades.where("gradebookId").equals(gradebook.id).count();
    expect(periods).toBeGreaterThan(0);
    expect(columns).toBeGreaterThan(0);
    expect(grades).toBeGreaterThan(0);
    const periodsBefore = await db.periods.count();
    const columnsBefore = await db.columns.count();
    const gradesBefore = await db.grades.count();

    await deleteGradebook(db, gradebook.id);

    expect(await db.gradebooks.get(gradebook.id)).toBeUndefined();
    expect(await db.periods.count()).toBe(periodsBefore - periods);
    expect(await db.columns.count()).toBe(columnsBefore - columns);
    expect(await db.grades.count()).toBe(gradesBefore - grades);
    // The sibling gradebook is untouched.
    expect(await db.gradebooks.get(survivor.id)).toBeDefined();
    expect(await db.periods.where("gradebookId").equals(survivor.id).count()).toBeGreaterThan(0);
    expect(await db.columns.where("gradebookId").equals(survivor.id).count()).toBeGreaterThan(0);
    expect(await db.grades.where("gradebookId").equals(survivor.id).count()).toBeGreaterThan(0);
    // Students and classes are not owned by a gradebook.
    expect(await db.students.count()).toBeGreaterThan(0);
    expect(await db.classes.count()).toBe(2);
    db.close();
  });

  it("leaves no orphan column or grade behind", async () => {
    const db = openWorkspaceDb("cascade-gradebook-orphans");
    await seedIfEmpty(db, "cascade-gradebook-orphans");
    const gradebook = (await db.gradebooks.toArray())[0];

    await deleteGradebook(db, gradebook.id);

    const gradebookIds = new Set((await db.gradebooks.toArray()).map((g) => g.id));
    const columnIds = new Set((await db.columns.toArray()).map((c) => c.id));
    for (const column of await db.columns.toArray()) {
      expect(gradebookIds.has(column.gradebookId)).toBe(true);
    }
    for (const period of await db.periods.toArray()) {
      expect(gradebookIds.has(period.gradebookId)).toBe(true);
    }
    for (const grade of await db.grades.toArray()) {
      expect(gradebookIds.has(grade.gradebookId)).toBe(true);
      expect(columnIds.has(grade.columnId)).toBe(true);
    }
    db.close();
  });

  it("on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-gradebook-missing");
    await seedIfEmpty(db, "cascade-gradebook-missing");
    const counts = [await db.gradebooks.count(), await db.periods.count(), await db.grades.count()];

    await deleteGradebook(db, "no-such-gradebook");

    expect([
      await db.gradebooks.count(),
      await db.periods.count(),
      await db.grades.count(),
    ]).toEqual(counts);
    db.close();
  });
});

describe("deletePeriod", () => {
  it("removes the period, the columns in it and those columns' grades", async () => {
    const db = openWorkspaceDb("cascade-period");
    await seedIfEmpty(db, "cascade-period");

    // The seed puts every column in the first period of each gradebook.
    const gradebook = (await db.gradebooks.toArray())[0];
    const periods = await db.periods.where("gradebookId").equals(gradebook.id).sortBy("order");
    const period = periods[0];
    const doomed = await db.columns.where("periodId").equals(period.id).toArray();
    expect(doomed.length).toBeGreaterThan(0);
    const doomedGrades = await db.grades
      .where("columnId")
      .anyOf(doomed.map((c) => c.id))
      .count();
    expect(doomedGrades).toBeGreaterThan(0);
    const periodsBefore = await db.periods.count();
    const columnsBefore = await db.columns.count();
    const gradesBefore = await db.grades.count();

    await deletePeriod(db, period.id);

    expect(await db.periods.get(period.id)).toBeUndefined();
    expect(await db.periods.count()).toBe(periodsBefore - 1);
    expect(await db.columns.count()).toBe(columnsBefore - doomed.length);
    expect(await db.grades.count()).toBe(gradesBefore - doomedGrades);
    expect(await db.columns.where("periodId").equals(period.id).count()).toBe(0);
    // The gradebook itself and its other periods survive.
    expect(await db.gradebooks.get(gradebook.id)).toBeDefined();
    expect(await db.periods.get(periods[1].id)).toBeDefined();
    // So does the sibling gradebook, columns and grades included.
    const survivor = (await db.gradebooks.toArray()).find((g) => g.id !== gradebook.id);
    if (!survivor) throw new Error("expected a sibling gradebook");
    expect(await db.columns.where("gradebookId").equals(survivor.id).count()).toBeGreaterThan(0);
    expect(await db.grades.where("gradebookId").equals(survivor.id).count()).toBeGreaterThan(0);
    db.close();
  });

  it("removes an empty period without touching anything else", async () => {
    const db = openWorkspaceDb("cascade-period-empty");
    await seedIfEmpty(db, "cascade-period-empty");
    const gradebook = (await db.gradebooks.toArray())[0];
    const empty = (await db.periods.where("gradebookId").equals(gradebook.id).sortBy("order"))[1];
    expect(await db.columns.where("periodId").equals(empty.id).count()).toBe(0);
    const columns = await db.columns.count();
    const grades = await db.grades.count();

    await deletePeriod(db, empty.id);

    expect(await db.periods.get(empty.id)).toBeUndefined();
    expect(await db.columns.count()).toBe(columns);
    expect(await db.grades.count()).toBe(grades);
    db.close();
  });

  it("on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-period-missing");
    await seedIfEmpty(db, "cascade-period-missing");
    const counts = [await db.periods.count(), await db.columns.count(), await db.grades.count()];

    await deletePeriod(db, "no-such-period");

    expect([await db.periods.count(), await db.columns.count(), await db.grades.count()]).toEqual(
      counts,
    );
    db.close();
  });
});

describe("deleteClass", () => {
  it("removes the class, its students, its gradebooks and everything under them", async () => {
    const db = openWorkspaceDb("cascade-class");
    await seedIfEmpty(db, "cascade-class");

    const [schoolClass, survivorClass] = await db.classes.toArray();
    const students = await db.students.where("classId").equals(schoolClass.id).count();
    const gradebooks = await db.gradebooks.where("classId").equals(schoolClass.id).toArray();
    expect(students).toBeGreaterThan(0);
    expect(gradebooks.length).toBeGreaterThan(0);
    const ids = gradebooks.map((g) => g.id);
    const periods = await db.periods.where("gradebookId").anyOf(ids).count();
    const columns = await db.columns.where("gradebookId").anyOf(ids).count();
    const grades = await db.grades.where("gradebookId").anyOf(ids).count();
    const before = {
      classes: await db.classes.count(),
      students: await db.students.count(),
      gradebooks: await db.gradebooks.count(),
      periods: await db.periods.count(),
      columns: await db.columns.count(),
      grades: await db.grades.count(),
    };

    await deleteClass(db, schoolClass.id);

    expect(await db.classes.get(schoolClass.id)).toBeUndefined();
    expect(await db.classes.count()).toBe(before.classes - 1);
    expect(await db.students.count()).toBe(before.students - students);
    expect(await db.gradebooks.count()).toBe(before.gradebooks - gradebooks.length);
    expect(await db.periods.count()).toBe(before.periods - periods);
    expect(await db.columns.count()).toBe(before.columns - columns);
    expect(await db.grades.count()).toBe(before.grades - grades);

    // The other class keeps its students, gradebook, periods, columns, grades.
    expect(await db.classes.get(survivorClass.id)).toBeDefined();
    expect(await db.students.where("classId").equals(survivorClass.id).count()).toBeGreaterThan(0);
    const survivorGradebook = (await db.gradebooks.toArray())[0];
    expect(survivorGradebook.classId).toBe(survivorClass.id);
    expect(
      await db.periods.where("gradebookId").equals(survivorGradebook.id).count(),
    ).toBeGreaterThan(0);
    expect(
      await db.grades.where("gradebookId").equals(survivorGradebook.id).count(),
    ).toBeGreaterThan(0);
    // Subjects belong to the workspace, not to a class.
    expect(await db.subjects.count()).toBe(2);
    db.close();
  });

  it("leaves no orphan row of any kind", async () => {
    const db = openWorkspaceDb("cascade-class-orphans");
    await seedIfEmpty(db, "cascade-class-orphans");
    const schoolClass = (await db.classes.toArray())[0];

    await deleteClass(db, schoolClass.id);

    const classIds = new Set((await db.classes.toArray()).map((c) => c.id));
    const studentIds = new Set((await db.students.toArray()).map((s) => s.id));
    const gradebookIds = new Set((await db.gradebooks.toArray()).map((g) => g.id));
    const columnIds = new Set((await db.columns.toArray()).map((c) => c.id));
    for (const student of await db.students.toArray()) {
      expect(classIds.has(student.classId)).toBe(true);
    }
    for (const gradebook of await db.gradebooks.toArray()) {
      expect(classIds.has(gradebook.classId)).toBe(true);
    }
    for (const period of await db.periods.toArray()) {
      expect(gradebookIds.has(period.gradebookId)).toBe(true);
    }
    for (const column of await db.columns.toArray()) {
      expect(gradebookIds.has(column.gradebookId)).toBe(true);
    }
    for (const grade of await db.grades.toArray()) {
      expect(gradebookIds.has(grade.gradebookId)).toBe(true);
      expect(columnIds.has(grade.columnId)).toBe(true);
      expect(studentIds.has(grade.studentId)).toBe(true);
    }
    db.close();
  });

  it("also removes a stray grade of a deleted student sitting in another class's gradebook", async () => {
    const db = openWorkspaceDb("cascade-class-stray");
    await seedIfEmpty(db, "cascade-class-stray");

    const [doomedClass, otherClass] = await db.classes.toArray();
    const student = (await db.students.where("classId").equals(doomedClass.id).toArray())[0];
    const otherGradebook = (
      await db.gradebooks.where("classId").equals(otherClass.id).toArray()
    )[0];
    const otherColumn = (
      await db.columns.where("gradebookId").equals(otherGradebook.id).toArray()
    )[0];
    await db.grades.put({
      gradebookId: otherGradebook.id,
      columnId: otherColumn.id,
      studentId: student.id,
      value: { type: "numeric", value: 12 },
      updatedAt: Date.now(),
    });
    expect(
      await db.grades.get(gradeKey(otherGradebook.id, otherColumn.id, student.id)),
    ).toBeDefined();

    await deleteClass(db, doomedClass.id);

    expect(
      await db.grades.get(gradeKey(otherGradebook.id, otherColumn.id, student.id)),
    ).toBeUndefined();
    expect(await db.gradebooks.get(otherGradebook.id)).toBeDefined();
    expect(await db.columns.get(otherColumn.id)).toBeDefined();
    expect(await db.grades.where("columnId").equals(otherColumn.id).count()).toBeGreaterThan(0);
    db.close();
  });

  it("on an unknown id is a no-op", async () => {
    const db = openWorkspaceDb("cascade-class-missing");
    await seedIfEmpty(db, "cascade-class-missing");
    const counts = [
      await db.classes.count(),
      await db.students.count(),
      await db.gradebooks.count(),
      await db.grades.count(),
    ];

    await deleteClass(db, "no-such-class");

    expect([
      await db.classes.count(),
      await db.students.count(),
      await db.gradebooks.count(),
      await db.grades.count(),
    ]).toEqual(counts);
    db.close();
  });
});

describe("deleteSubject", () => {
  it("refuses, and deletes nothing, while a gradebook still references it", async () => {
    const db = openWorkspaceDb("cascade-subject-used");
    await seedIfEmpty(db, "cascade-subject-used");

    const gradebook = (await db.gradebooks.toArray())[0];
    const subjectId = gradebook.subjectId;
    const before = {
      subjects: await db.subjects.count(),
      gradebooks: await db.gradebooks.count(),
      grades: await db.grades.count(),
    };

    const result = await deleteSubject(db, subjectId);

    expect(result).toEqual({
      deleted: false,
      reason: "in-use",
      gradebookCount: 1,
      sessionCount: 0,
    });
    expect(await db.subjects.get(subjectId)).toBeDefined();
    expect(await db.subjects.count()).toBe(before.subjects);
    expect(await db.gradebooks.count()).toBe(before.gradebooks);
    expect(await db.grades.count()).toBe(before.grades);
    db.close();
  });

  it("reports how many gradebooks are in the way", async () => {
    const db = openWorkspaceDb("cascade-subject-used-twice");
    await seedIfEmpty(db, "cascade-subject-used-twice");

    // Point both gradebooks at the same subject.
    const [first, second] = await db.gradebooks.toArray();
    await db.gradebooks.update(second.id, { subjectId: first.subjectId });

    const result = await deleteSubject(db, first.subjectId);

    expect(result).toEqual({
      deleted: false,
      reason: "in-use",
      gradebookCount: 2,
      sessionCount: 0,
    });
    db.close();
  });

  it("refuses, and deletes nothing, while a session still references it", async () => {
    const db = openWorkspaceDb("cascade-subject-session");
    await seedIfEmpty(db, "cascade-subject-session");

    const schoolClass = (await db.classes.toArray())[0];
    const now = Date.now();
    const id = crypto.randomUUID();
    await db.subjects.add({ id, name: "Sport", color: "#a855f7", createdAt: now, updatedAt: now });
    await createSession(db, schoolClass.id, id);
    const before = await db.subjects.count();

    const result = await deleteSubject(db, id);

    expect(result).toEqual({
      deleted: false,
      reason: "in-use",
      gradebookCount: 0,
      sessionCount: 1,
    });
    expect(await db.subjects.get(id)).toBeDefined();
    expect(await db.subjects.count()).toBe(before);
    db.close();
  });

  it("deletes a subject no gradebook references", async () => {
    const db = openWorkspaceDb("cascade-subject-free");
    await seedIfEmpty(db, "cascade-subject-free");

    const now = Date.now();
    const id = crypto.randomUUID();
    await db.subjects.add({
      id,
      name: "Histoire",
      color: "#a855f7",
      createdAt: now,
      updatedAt: now,
    });
    const before = await db.subjects.count();
    const gradebooks = await db.gradebooks.count();

    const result = await deleteSubject(db, id);

    expect(result).toEqual({ deleted: true });
    expect(await db.subjects.get(id)).toBeUndefined();
    expect(await db.subjects.count()).toBe(before - 1);
    expect(await db.gradebooks.count()).toBe(gradebooks);
    db.close();
  });

  it("reports a deletion for an unknown id, having removed nothing", async () => {
    const db = openWorkspaceDb("cascade-subject-missing");
    await seedIfEmpty(db, "cascade-subject-missing");
    const subjects = await db.subjects.count();

    const result = await deleteSubject(db, "no-such-subject");

    expect(result).toEqual({ deleted: true });
    expect(await db.subjects.count()).toBe(subjects);
    db.close();
  });
});

describe("deleteStudent — phase 2 rows", () => {
  it("takes attendance, behaviour events and rubric-free seat state with it", async () => {
    const db = openWorkspaceDb(`cascade-student-phase2-${crypto.randomUUID()}`);
    await db.students.add({
      id: "p1",
      classId: "c1",
      firstName: "Emma",
      lastName: "Martin",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.attendance.put({
      sessionId: "s1",
      studentId: "p1",
      value: "absent",
      updatedAt: 1,
    });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "yellow",
      createdAt: 1,
    });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });

    await deleteStudent(db, "p1");

    expect(await db.students.count()).toBe(0);
    expect(await db.attendance.count()).toBe(0);
    expect(await db.behaviourEvents.count()).toBe(0);
    // The seat survives, emptied: deleting a pupil must not punch a hole in
    // the room's geometry.
    expect(await db.seats.get(["l1", 0, 0])).toEqual({
      layoutId: "l1",
      row: 0,
      col: 0,
      studentId: null,
    });
    db.close();
  });

  it("leaves another pupil's rows alone", async () => {
    const db = openWorkspaceDb(`cascade-student-neighbour-${crypto.randomUUID()}`);
    await db.attendance.bulkPut([
      { sessionId: "s1", studentId: "p1", value: "absent", updatedAt: 1 },
      { sessionId: "s1", studentId: "p2", value: "present", updatedAt: 1 },
    ]);
    await deleteStudent(db, "p1");
    expect(await db.attendance.count()).toBe(1);
    expect((await db.attendance.toArray())[0].studentId).toBe("p2");
    db.close();
  });
});

describe("deleteClass — phase 2 rows", () => {
  it("leaves zero orphans across every classroom table", async () => {
    const db = openWorkspaceDb(`cascade-class-phase2-${crypto.randomUUID()}`);
    await db.classes.add({ id: "c1", name: "3B", createdAt: 1, updatedAt: 1 });
    await db.students.add({
      id: "p1",
      classId: "c1",
      firstName: "Emma",
      lastName: "Martin",
      createdAt: 1,
      updatedAt: 1,
    });
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
    await db.studentGroups.add({
      id: "g1",
      classId: "c1",
      name: "Groupe A",
      color: "#2563eb",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.groupMembers.put({ groupId: "g1", studentId: "p1" });

    await deleteClass(db, "c1");

    for (const table of [
      db.classes,
      db.students,
      db.sessions,
      db.attendance,
      db.behaviourEvents,
      db.seatingLayouts,
      db.seats,
      db.studentGroups,
      db.groupMembers,
    ]) {
      expect(await table.count()).toBe(0);
    }
    db.close();
  });
});

describe("deleteSession", () => {
  it("takes its attendance and behaviour events", async () => {
    const db = openWorkspaceDb(`cascade-session-${crypto.randomUUID()}`);
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.sessions.add({ id: "s2", classId: "c1", date: 2, createdAt: 2 });
    await db.attendance.bulkPut([
      { sessionId: "s1", studentId: "p1", value: "absent", updatedAt: 1 },
      { sessionId: "s2", studentId: "p1", value: "present", updatedAt: 1 },
    ]);
    await db.behaviourEvents.bulkAdd([
      { id: "e1", sessionId: "s1", studentId: "p1", classId: "c1", type: "yellow", createdAt: 1 },
      { id: "e2", sessionId: "s2", studentId: "p1", classId: "c1", type: "green", createdAt: 2 },
    ]);

    await deleteSession(db, "s1");

    expect(await db.sessions.count()).toBe(1);
    expect(await db.attendance.count()).toBe(1);
    expect(await db.behaviourEvents.count()).toBe(1);
    expect((await db.behaviourEvents.toArray())[0].id).toBe("e2");
    db.close();
  });
});

describe("deleteSeatingLayout", () => {
  it("takes its seats", async () => {
    const db = openWorkspaceDb(`cascade-layout-${crypto.randomUUID()}`);
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 1, cols: 2, updatedAt: 1 });
    await db.seats.bulkPut([
      { layoutId: "l1", row: 0, col: 0, studentId: null },
      { layoutId: "l1", row: 0, col: 1, studentId: "p1" },
      { layoutId: "l2", row: 0, col: 0, studentId: null },
    ]);
    await deleteSeatingLayout(db, "l1");
    expect(await db.seatingLayouts.count()).toBe(0);
    expect(await db.seats.count()).toBe(1);
    db.close();
  });
});

describe("deleteClass — defensive sweeps", () => {
  it("removes a pupil's rows even when they hang off another class's session", async () => {
    const db = openWorkspaceDb("cascade-class-foreign-session");
    await db.classes.bulkAdd([
      { id: "c1", name: "3B", createdAt: 1, updatedAt: 1 },
      { id: "c2", name: "5A", createdAt: 1, updatedAt: 1 },
    ]);
    await db.students.bulkAdd([
      {
        id: "p1",
        classId: "c1",
        firstName: "Emma",
        lastName: "Martin",
        createdAt: 1,
        updatedAt: 1,
      },
      { id: "p2", classId: "c2", firstName: "Léo", lastName: "Roux", createdAt: 1, updatedAt: 1 },
    ]);
    // A row an import could produce but the UI never would: c1's pupil
    // recorded against c2's session.
    await db.sessions.add({ id: "s2", classId: "c2", date: 1, createdAt: 1 });
    await db.attendance.bulkPut([
      { sessionId: "s2", studentId: "p1", value: "absent", updatedAt: 1 },
      { sessionId: "s2", studentId: "p2", value: "present", updatedAt: 1 },
    ]);
    await db.behaviourEvents.bulkAdd([
      { id: "e1", sessionId: "s2", studentId: "p1", classId: "c2", type: "red", createdAt: 1 },
      { id: "e2", sessionId: "s2", studentId: "p2", classId: "c2", type: "green", createdAt: 1 },
    ]);

    await deleteClass(db, "c1");

    // c1's pupil is gone from both tables; c2's pupil and session are intact.
    expect(await db.attendance.count()).toBe(1);
    expect((await db.attendance.toArray())[0].studentId).toBe("p2");
    expect(await db.behaviourEvents.count()).toBe(1);
    expect((await db.behaviourEvents.toArray())[0].id).toBe("e2");
    expect(await db.sessions.count()).toBe(1);
    expect(await db.students.count()).toBe(1);
    db.close();
  });

  describe("deleteRubricAssessment", () => {
    it("takes its scores and leaves another assessment's alone", async () => {
      const db = openWorkspaceDb("cascade-rubric-assessment");
      await db.rubricAssessments.add({
        id: "a1",
        gradebookId: "g1",
        periodId: "pe1",
        name: "Oral",
        date: 1,
        criteria: [],
        createdAt: 1,
        updatedAt: 1,
      });
      await db.rubricScores.bulkPut([
        { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
        { assessmentId: "a2", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
      ]);
      await deleteRubricAssessment(db, "a1");
      expect(await db.rubricAssessments.count()).toBe(0);
      expect(await db.rubricScores.count()).toBe(1);
      expect((await db.rubricScores.toArray())[0].assessmentId).toBe("a2");
      db.close();
    });
  });

  describe("deleteRubricTemplate", () => {
    it("removes only the named template", async () => {
      const db = openWorkspaceDb("cascade-rubric-template");
      await db.rubricTemplates.bulkAdd([
        { id: "t1", name: "Oral", criteria: [], createdAt: 1, updatedAt: 1 },
        { id: "t2", name: "Écrit", criteria: [], createdAt: 1, updatedAt: 1 },
      ]);
      await deleteRubricTemplate(db, "t1");
      expect(await db.rubricTemplates.get("t1")).toBeUndefined();
      expect(await db.rubricTemplates.get("t2")).toBeDefined();
      db.close();
    });
  });

  describe("deleteStudent — rubric scores", () => {
    it("takes the pupil's scores", async () => {
      const db = openWorkspaceDb("cascade-rubric-student");
      await db.students.add({
        id: "p1",
        classId: "c1",
        firstName: "Emma",
        lastName: "Martin",
        createdAt: 1,
        updatedAt: 1,
      });
      await db.rubricScores.bulkPut([
        { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
        { assessmentId: "a1", criterionId: "c1", studentId: "p2", level: 2, updatedAt: 1 },
      ]);
      await deleteStudent(db, "p1");
      expect(await db.rubricScores.count()).toBe(1);
      expect((await db.rubricScores.toArray())[0].studentId).toBe("p2");
      db.close();
    });
  });

  describe("deleteGradebook — rubric assessments", () => {
    it("leaves zero orphan scores", async () => {
      const db = openWorkspaceDb("cascade-rubric-gradebook");
      await db.gradebooks.add({
        id: "g1",
        classId: "c1",
        subjectId: "s1",
        name: "Maths",
        createdAt: 1,
        updatedAt: 1,
      });
      await db.rubricAssessments.add({
        id: "a1",
        gradebookId: "g1",
        periodId: "pe1",
        name: "Oral",
        date: 1,
        criteria: [],
        createdAt: 1,
        updatedAt: 1,
      });
      await db.rubricScores.put({
        assessmentId: "a1",
        criterionId: "c1",
        studentId: "p1",
        level: 1,
        updatedAt: 1,
      });
      await deleteGradebook(db, "g1");
      expect(await db.rubricAssessments.count()).toBe(0);
      expect(await db.rubricScores.count()).toBe(0);
      db.close();
    });
  });

  describe("deletePeriod — rubric assessments", () => {
    it("takes an assessment naming that period and leaves another period's alone", async () => {
      const db = openWorkspaceDb("cascade-rubric-period");
      await db.periods.bulkAdd([
        { id: "pe1", gradebookId: "g1", name: "Trimestre 1", order: 0 },
        { id: "pe2", gradebookId: "g1", name: "Trimestre 2", order: 1 },
      ]);
      await db.rubricAssessments.bulkAdd([
        {
          id: "a1",
          gradebookId: "g1",
          periodId: "pe1",
          name: "Oral 1",
          date: 1,
          criteria: [],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "a2",
          gradebookId: "g1",
          periodId: "pe2",
          name: "Oral 2",
          date: 1,
          criteria: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      await db.rubricScores.bulkPut([
        { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
        { assessmentId: "a2", criterionId: "c1", studentId: "p1", level: 4, updatedAt: 1 },
      ]);

      await deletePeriod(db, "pe1");

      expect(await db.rubricAssessments.get("a1")).toBeUndefined();
      expect(await db.rubricAssessments.get("a2")).toBeDefined();
      expect(await db.rubricScores.count()).toBe(1);
      expect((await db.rubricScores.toArray())[0].assessmentId).toBe("a2");
      db.close();
    });
  });

  describe("deleteClass — rubric assessments", () => {
    it("takes assessments belonging to the class's gradebooks and leaves another class's alone", async () => {
      const db = openWorkspaceDb("cascade-rubric-class");
      await db.classes.bulkAdd([
        { id: "c1", name: "3B", createdAt: 1, updatedAt: 1 },
        { id: "c2", name: "5A", createdAt: 1, updatedAt: 1 },
      ]);
      await db.gradebooks.bulkAdd([
        { id: "g1", classId: "c1", subjectId: "s1", name: "Maths c1", createdAt: 1, updatedAt: 1 },
        { id: "g2", classId: "c2", subjectId: "s1", name: "Maths c2", createdAt: 1, updatedAt: 1 },
      ]);
      await db.rubricAssessments.bulkAdd([
        {
          id: "a1",
          gradebookId: "g1",
          periodId: "pe1",
          name: "Oral c1",
          date: 1,
          criteria: [],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "a2",
          gradebookId: "g2",
          periodId: "pe1",
          name: "Oral c2",
          date: 1,
          criteria: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      await db.rubricScores.bulkPut([
        { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
        { assessmentId: "a2", criterionId: "c1", studentId: "p2", level: 2, updatedAt: 1 },
      ]);

      await deleteClass(db, "c1");

      expect(await db.rubricAssessments.get("a1")).toBeUndefined();
      expect(await db.rubricAssessments.get("a2")).toBeDefined();
      expect(await db.rubricScores.count()).toBe(1);
      expect((await db.rubricScores.toArray())[0].assessmentId).toBe("a2");
      db.close();
    });
  });
});

describe("schedule entries", () => {
  async function seedSchedule(label: string) {
    const db = openWorkspaceDb(`cascade-schedule-${label}-${crypto.randomUUID()}`);
    await db.classes.bulkAdd([
      { id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 },
      { id: "c2", name: "5°A", createdAt: 1, updatedAt: 1 },
    ]);
    await db.subjects.add({
      id: "sub1",
      name: "Maths",
      color: "#2563eb",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.gradebooks.bulkAdd([
      { id: "g1", classId: "c1", subjectId: "sub1", name: "Maths 3°B", createdAt: 1, updatedAt: 1 },
      { id: "g2", classId: "c1", subjectId: "sub1", name: "Autre", createdAt: 1, updatedAt: 1 },
    ]);
    await db.scheduleEntries.bulkAdd([
      {
        id: "e1",
        classId: "c1",
        gradebookId: "g1",
        weekday: 1,
        startMinute: 600,
        endMinute: 660,
        weekCycle: "all",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "e2",
        classId: "c1",
        gradebookId: "g2",
        weekday: 2,
        startMinute: 480,
        endMinute: 540,
        weekCycle: "A",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "e3",
        classId: "c2",
        weekday: 3,
        startMinute: 540,
        endMinute: 600,
        weekCycle: "B",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    return db;
  }

  it("deleteScheduleEntry removes exactly that entry", async () => {
    const db = await seedSchedule("one");
    await deleteScheduleEntry(db, "e1");

    expect((await db.scheduleEntries.toArray()).map((e) => e.id).sort()).toEqual(["e2", "e3"]);
    db.close();
  });

  it("deleteClass takes its schedule entries and leaves another class's alone", async () => {
    const db = await seedSchedule("class");
    await deleteClass(db, "c1");

    expect((await db.scheduleEntries.toArray()).map((e) => e.id)).toEqual(["e3"]);
    db.close();
  });

  it("deleteGradebook UNLINKS its entries rather than deleting them", async () => {
    // The subtle cascade of this phase. A lesson still happens after its
    // gradebook is deleted; it just no longer opens onto a grid. Deleting a
    // gradebook must never delete part of a teacher's timetable.
    const db = await seedSchedule("gradebook");
    await deleteGradebook(db, "g1");

    const e1 = await db.scheduleEntries.get("e1");
    expect(e1).toBeDefined();
    expect(e1).not.toHaveProperty("gradebookId");
    expect(e1?.weekday).toBe(1);
    expect(e1?.startMinute).toBe(600);

    // An entry pointing at a DIFFERENT gradebook is untouched.
    expect((await db.scheduleEntries.get("e2"))?.gradebookId).toBe("g2");
    db.close();
  });

  it("deleteClass leaves no orphan entry behind", async () => {
    const db = await seedSchedule("orphans");
    await deleteClass(db, "c1");
    await deleteClass(db, "c2");

    expect(await db.scheduleEntries.count()).toBe(0);
    db.close();
  });
});

describe("the journal", () => {
  const day = (y: number, m: number, d: number): number => new Date(y, m, d).getTime();

  async function seedDiary(label: string) {
    const db = openWorkspaceDb(`cascade-diary-${label}-${crypto.randomUUID()}`);
    await db.classes.bulkAdd([
      { id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 },
      { id: "c2", name: "5°A", createdAt: 1, updatedAt: 1 },
    ]);
    await db.scheduleEntries.add({
      id: "sch1",
      classId: "c1",
      weekday: 2,
      startMinute: 600,
      endMinute: 660,
      weekCycle: "all",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.diaryEntries.bulkPut([
      { classId: "c1", date: day(2026, 8, 1), text: "3°B lundi", createdAt: 1, updatedAt: 1 },
      { classId: "c1", date: day(2026, 8, 8), text: "3°B mardi", createdAt: 1, updatedAt: 1 },
      { classId: "c2", date: day(2026, 8, 1), text: "5°A", createdAt: 1, updatedAt: 1 },
    ]);
    return db;
  }

  it("deleteDiaryEntry removes exactly that day", async () => {
    const db = await seedDiary("one");
    await deleteDiaryEntry(db, "c1", day(2026, 8, 1));

    expect((await db.diaryEntries.toArray()).map((e) => e.text).sort()).toEqual([
      "3°B mardi",
      "5°A",
    ]);
    db.close();
  });

  it("deleteClass takes its journal and leaves another class's alone", async () => {
    const db = await seedDiary("class");
    await deleteClass(db, "c1");

    expect((await db.diaryEntries.toArray()).map((e) => e.text)).toEqual(["5°A"]);
    db.close();
  });

  it("deleteScheduleEntry leaves the journal entirely untouched", async () => {
    // The subtle cascade of this phase, in the negative. The lesson happened;
    // taking it off next term's timetable must not erase what was written
    // about it.
    const db = await seedDiary("schedule");
    await deleteScheduleEntry(db, "sch1");

    expect(await db.diaryEntries.count()).toBe(3);
    expect(await db.scheduleEntries.count()).toBe(0);
    db.close();
  });

  it("deleteClass leaves no orphan entry behind", async () => {
    const db = await seedDiary("orphans");
    await deleteClass(db, "c1");
    await deleteClass(db, "c2");

    expect(await db.diaryEntries.count()).toBe(0);
    db.close();
  });
});
