import type { AppDatabase } from ".";

/**
 * Deletes that must take their dependent rows with them.
 *
 * A grade row is keyed [gradebookId+columnId+studentId] and nothing else
 * points back at it: dropping a column or a student without dropping its
 * grades leaves rows that are invisible in every grid, never averaged, and
 * still carried by export/import. Each cascade runs in one `rw` transaction so
 * a failure cannot leave the pair half-applied.
 */

export async function deleteColumn(db: AppDatabase, columnId: string): Promise<void> {
  await db.transaction("rw", [db.columns, db.grades], async () => {
    await db.grades.where("columnId").equals(columnId).delete();
    await db.columns.delete(columnId);
  });
}

/**
 * A pupil's rows reach into six tables. The seat is emptied rather than
 * deleted: removing it would punch a hole in the room's geometry, and a gap
 * means something different from an empty chair.
 */
export async function deleteStudent(db: AppDatabase, studentId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.students, db.grades, db.attendance, db.behaviourEvents, db.seats],
    async () => {
      await db.grades.where("studentId").equals(studentId).delete();
      await db.attendance.where("studentId").equals(studentId).delete();
      await db.behaviourEvents.where("studentId").equals(studentId).delete();
      await db.seats.where("studentId").equals(studentId).modify({ studentId: null });
      await db.students.delete(studentId);
    },
  );
}

export async function deleteGradebook(db: AppDatabase, gradebookId: string): Promise<void> {
  await db.transaction("rw", [db.gradebooks, db.periods, db.columns, db.grades], async () => {
    await db.grades.where("gradebookId").equals(gradebookId).delete();
    await db.columns.where("gradebookId").equals(gradebookId).delete();
    await db.periods.where("gradebookId").equals(gradebookId).delete();
    await db.gradebooks.delete(gradebookId);
  });
}

/**
 * A grade row carries no periodId — the period is only known through its
 * column — so the grades to drop are found by column, not by period.
 */
export async function deletePeriod(db: AppDatabase, periodId: string): Promise<void> {
  await db.transaction("rw", [db.periods, db.columns, db.grades], async () => {
    const columnIds = await db.columns.where("periodId").equals(periodId).primaryKeys();
    if (columnIds.length > 0) {
      await db.grades.where("columnId").anyOf(columnIds).delete();
      await db.columns.bulkDelete(columnIds);
    }
    await db.periods.delete(periodId);
  });
}

/**
 * Four levels deep: the class, its students, every gradebook teaching it, and
 * each of those gradebooks' periods, columns and grades.
 *
 * Grades are removed twice over — once by gradebook, once by student. The
 * second sweep should find nothing, since a student is only ever graded in
 * their own class's gradebooks; it is there so that an orphan produced by a
 * bad import cannot outlive the class it belonged to.
 */
export async function deleteClass(db: AppDatabase, classId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.classes,
      db.students,
      db.gradebooks,
      db.periods,
      db.columns,
      db.grades,
      db.sessions,
      db.attendance,
      db.behaviourEvents,
      db.seatingLayouts,
      db.seats,
    ],
    async () => {
      const gradebookIds = await db.gradebooks.where("classId").equals(classId).primaryKeys();
      if (gradebookIds.length > 0) {
        await db.grades.where("gradebookId").anyOf(gradebookIds).delete();
        await db.columns.where("gradebookId").anyOf(gradebookIds).delete();
        await db.periods.where("gradebookId").anyOf(gradebookIds).delete();
        await db.gradebooks.bulkDelete(gradebookIds);
      }

      const studentIds = await db.students.where("classId").equals(classId).primaryKeys();
      if (studentIds.length > 0) {
        await db.grades.where("studentId").anyOf(studentIds).delete();
        // Swept by student as well as by session, for the same reason grades
        // are swept twice: a row attached to another class's session should be
        // impossible, and if a bad import produced one it must not outlive the
        // pupil it describes.
        await db.attendance.where("studentId").anyOf(studentIds).delete();
        await db.behaviourEvents.where("studentId").anyOf(studentIds).delete();
        await db.seats.where("studentId").anyOf(studentIds).modify({ studentId: null });
        await db.students.bulkDelete(studentIds);
      }

      const sessionIds = await db.sessions.where("classId").equals(classId).primaryKeys();
      if (sessionIds.length > 0) {
        await db.attendance.where("sessionId").anyOf(sessionIds).delete();
        await db.sessions.bulkDelete(sessionIds);
      }
      await db.behaviourEvents.where("classId").equals(classId).delete();

      const layoutIds = await db.seatingLayouts.where("classId").equals(classId).primaryKeys();
      if (layoutIds.length > 0) {
        await db.seats.where("layoutId").anyOf(layoutIds).delete();
        await db.seatingLayouts.bulkDelete(layoutIds);
      }

      await db.classes.delete(classId);
    },
  );
}

/**
 * What `deleteSubject` did. A refusal is a normal outcome, not an error: the
 * caller is expected to branch on `deleted` and tell the teacher which
 * gradebooks stand in the way.
 */
export type DeleteSubjectResult =
  | { deleted: true }
  | { deleted: false; reason: "in-use"; gradebookCount: number; sessionCount: number };

/**
 * The one delete that refuses instead of cascading.
 *
 * A subject is shared across gradebooks and sessions and holds nothing of its
 * own, so cascading it would destroy whole gradebooks — every column and
 * every grade of a class in that subject — or orphan lessons, as a side
 * effect of tidying a label. When any gradebook or session still references
 * it, nothing is deleted and both referencing counts come back for the UI to
 * show. An unknown id is reported as deleted, like every other delete here:
 * there is nothing left to remove.
 */
export async function deleteSubject(
  db: AppDatabase,
  subjectId: string,
): Promise<DeleteSubjectResult> {
  return await db.transaction("rw", [db.subjects, db.gradebooks, db.sessions], async () => {
    const gradebookCount = await db.gradebooks.where("subjectId").equals(subjectId).count();
    const sessionCount = await db.sessions.where("subjectId").equals(subjectId).count();
    if (gradebookCount > 0 || sessionCount > 0) {
      return { deleted: false, reason: "in-use", gradebookCount, sessionCount };
    }
    await db.subjects.delete(subjectId);
    return { deleted: true };
  });
}

/** A lesson and everything recorded during it. */
export async function deleteSession(db: AppDatabase, sessionId: string): Promise<void> {
  await db.transaction("rw", [db.sessions, db.attendance, db.behaviourEvents], async () => {
    await db.attendance.where("sessionId").equals(sessionId).delete();
    await db.behaviourEvents.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

/**
 * Behaviour events are append-only, so removing one is the only correction
 * available. Single-table, but it lives here so every delete is in one place.
 */
export async function deleteBehaviourEvent(db: AppDatabase, eventId: string): Promise<void> {
  await db.behaviourEvents.delete(eventId);
}

/** The room and its cells. */
export async function deleteSeatingLayout(db: AppDatabase, layoutId: string): Promise<void> {
  await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    await db.seats.where("layoutId").equals(layoutId).delete();
    await db.seatingLayouts.delete(layoutId);
  });
}
