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

/**
 * A group and its memberships only. The pupils it named are untouched: a
 * group is a way of selecting and viewing them, never a thing that holds a
 * grade, so deleting one must never delete — or otherwise change — a person.
 */
export async function deleteGroup(db: AppDatabase, groupId: string): Promise<void> {
  await db.transaction("rw", [db.studentGroups, db.groupMembers], async () => {
    await db.groupMembers.where("groupId").equals(groupId).delete();
    await db.studentGroups.delete(groupId);
  });
}

/**
 * Deleting a column must also prune it out of every calculation column that
 * references it as a source, in the same transaction. A calculation left
 * pointing at a column that no longer exists would silently change meaning
 * while still rendering a plausible number — the worst kind of wrong.
 */
export async function deleteColumn(db: AppDatabase, columnId: string): Promise<void> {
  await db.transaction("rw", [db.columns, db.grades, db.criterionLevels], async () => {
    // A rubric column stores no grades and a numeric one stores no levels, so
    // one of these two sweeps always finds nothing. Both run regardless: the
    // type is not read here, and a delete that branched on it would be a
    // second place the column types have to be kept right.
    await db.criterionLevels.where("columnId").equals(columnId).delete();
    await db.grades.where("columnId").equals(columnId).delete();
    const referencing = await db.columns
      .filter((c) => c.calculation?.sourceColumnIds.includes(columnId) ?? false)
      .toArray();
    for (const calc of referencing) {
      const spec = calc.calculation;
      if (!spec) continue;
      await db.columns.update(calc.id, {
        calculation: {
          ...spec,
          sourceColumnIds: spec.sourceColumnIds.filter((id) => id !== columnId),
        },
      });
    }
    await db.columns.delete(columnId);
  });
}

/**
 * A pupil's rows reach into six tables.
 *
 * Their ASSIGNMENT is deleted rather than emptied: an assignment is the pair
 * (place, pupil), so without the pupil there is no row left to hold. The DESK
 * is untouched — it is furniture in a salle, and a pupil leaving the class is
 * no reason to take a table out of the room.
 */
export async function deleteStudent(db: AppDatabase, studentId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.students,
      db.grades,
      db.attendance,
      db.behaviourEvents,
      db.assignments,
      db.criterionLevels,
      db.groupMembers,
    ],
    async () => {
      await db.grades.where("studentId").equals(studentId).delete();
      await db.attendance.where("studentId").equals(studentId).delete();
      await db.behaviourEvents.where("studentId").equals(studentId).delete();
      // Deleted rather than emptied: an assignment is the pair (place, pupil),
      // so without the pupil there is no row left to keep — unlike a Seat,
      // which is furniture that survives its occupant.
      await db.assignments.where("studentId").equals(studentId).delete();
      await db.criterionLevels.where("studentId").equals(studentId).delete();
      await db.groupMembers.where("studentId").equals(studentId).delete();
      await db.students.delete(studentId);
    },
  );
}

export async function deleteGradebook(db: AppDatabase, gradebookId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.gradebooks, db.periods, db.columns, db.grades, db.criterionLevels],
    async () => {
      await db.grades.where("gradebookId").equals(gradebookId).delete();
      // Collected BEFORE the columns go: a level names its column and nothing
      // else, so once the column rows are deleted there is no way left to find
      // the levels that hung off them.
      const columnIds = await db.columns.where("gradebookId").equals(gradebookId).primaryKeys();
      if (columnIds.length > 0) {
        await db.criterionLevels.where("columnId").anyOf(columnIds).delete();
      }
      await db.columns.where("gradebookId").equals(gradebookId).delete();
      await db.periods.where("gradebookId").equals(gradebookId).delete();
      // The timetable is deliberately absent from this transaction. A lesson
      // names a class and a matiere, so no entry points at the carnet being
      // removed and there is nothing here to unlink.
      await db.gradebooks.delete(gradebookId);
    },
  );
}

/**
 * A grade row carries no periodId — the period is only known through its
 * column — so the grades to drop are found by column, not by period.
 */
export async function deletePeriod(db: AppDatabase, periodId: string): Promise<void> {
  await db.transaction("rw", [db.periods, db.columns, db.grades, db.criterionLevels], async () => {
    const columnIds = await db.columns.where("periodId").equals(periodId).primaryKeys();
    if (columnIds.length > 0) {
      await db.grades.where("columnId").anyOf(columnIds).delete();
      await db.criterionLevels.where("columnId").anyOf(columnIds).delete();
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
      db.seatingPlans,
      db.assignments,
      db.criterionLevels,
      db.studentGroups,
      db.groupMembers,
      db.scheduleEntries,
    ],
    async () => {
      await db.scheduleEntries.where("classId").equals(classId).delete();
      const gradebookIds = await db.gradebooks.where("classId").equals(classId).primaryKeys();
      if (gradebookIds.length > 0) {
        await db.grades.where("gradebookId").anyOf(gradebookIds).delete();
        // Collected before the columns go, for `deleteGradebook`'s reason: a
        // level names its column and nothing else.
        const columnIds = await db.columns.where("gradebookId").anyOf(gradebookIds).primaryKeys();
        if (columnIds.length > 0) {
          await db.criterionLevels.where("columnId").anyOf(columnIds).delete();
        }
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
        await db.criterionLevels.where("studentId").anyOf(studentIds).delete();
        await db.students.bulkDelete(studentIds);
      }

      const sessionIds = await db.sessions.where("classId").equals(classId).primaryKeys();
      if (sessionIds.length > 0) {
        await db.attendance.where("sessionId").anyOf(sessionIds).delete();
        await db.sessions.bulkDelete(sessionIds);
      }
      await db.behaviourEvents.where("classId").equals(classId).delete();

      // The class's arrangements go; the SALLES they were made in do not. A
      // room belongs to the établissement and outlives every class taught in
      // it, which is the whole point of the split.
      const planIds = await db.seatingPlans.where("classId").equals(classId).primaryKeys();
      if (planIds.length > 0) {
        await db.assignments.where("planId").anyOf(planIds).delete();
        await db.seatingPlans.bulkDelete(planIds);
      }

      const groupIds = await db.studentGroups.where("classId").equals(classId).primaryKeys();
      if (groupIds.length > 0) {
        await db.groupMembers.where("groupId").anyOf(groupIds).delete();
        await db.studentGroups.bulkDelete(groupIds);
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

/** The room and every table in it. */
/**
 * A salle, its furniture, and every arrangement made in it.
 *
 * Cascades rather than refusing, unlike `deleteSubject`. Destroying gradebooks
 * as a side effect of removing a subject is too much to do implicitly; an
 * arrangement is rebuilt in a minute, and refusing would strand a salle behind
 * classes a teacher no longer teaches, with no way to be rid of it. The
 * `ConfirmButton` names the classes that lose one, which is where the weight
 * of the decision belongs.
 */
export async function deleteRoom(db: AppDatabase, roomId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.rooms, db.desks, db.seatingPlans, db.assignments, db.scheduleEntries],
    async () => {
      const planIds = await db.seatingPlans.where("roomId").equals(roomId).primaryKeys();
      if (planIds.length > 0) {
        await db.assignments.where("planId").anyOf(planIds).delete();
        await db.seatingPlans.bulkDelete(planIds);
      }
      // The timetable is UNLINKED, never deleted — the same ruling
      // `deleteGradebook` follows. The lesson still happens on Monday at 10h;
      // it simply no longer names a salle. Deleting a room must never delete
      // part of a teacher's week.
      const lessons = await db.scheduleEntries.where("roomId").equals(roomId).toArray();
      for (const lesson of lessons) {
        const { roomId: _unlinked, ...rest } = lesson;
        await db.scheduleEntries.put({ ...rest, updatedAt: Date.now() });
      }
      await db.desks.where("roomId").equals(roomId).delete();
      await db.rooms.delete(roomId);
    },
  );
}

/**
 * A template holds nothing of its own — a column copied its criteria — so
 * deleting one destroys no grades and needs no refusal, unlike `deleteSubject`.
 */
export async function deleteRubricTemplate(db: AppDatabase, templateId: string): Promise<void> {
  await db.rubricTemplates.delete(templateId);
}

/**
 * Single-table, but it lives here because every delete does.
 *
 * Nothing references a schedule entry, so there is nothing to cascade — and
 * that is worth stating rather than leaving to be rediscovered: an entry
 * predicts lessons, it does not own the sessions that happened, so removing
 * it changes what Today expects and touches no history.
 */
export async function deleteScheduleEntry(db: AppDatabase, entryId: string): Promise<void> {
  await db.scheduleEntries.delete(entryId);
}
