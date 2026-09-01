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

export async function deleteStudent(db: AppDatabase, studentId: string): Promise<void> {
  await db.transaction("rw", [db.students, db.grades], async () => {
    await db.grades.where("studentId").equals(studentId).delete();
    await db.students.delete(studentId);
  });
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
    [db.classes, db.students, db.gradebooks, db.periods, db.columns, db.grades],
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
        await db.students.bulkDelete(studentIds);
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
  | { deleted: false; reason: "in-use"; gradebookCount: number };

/**
 * The one delete that refuses instead of cascading.
 *
 * A subject is shared across gradebooks and holds nothing of its own, so
 * cascading it would destroy whole gradebooks — every column and every grade
 * of a class in that subject — as a side effect of tidying a label. When any
 * gradebook still references it, nothing is deleted and the count of
 * referencing gradebooks comes back for the UI to show. An unknown id is
 * reported as deleted, like every other delete here: there is nothing left to
 * remove.
 */
export async function deleteSubject(
  db: AppDatabase,
  subjectId: string,
): Promise<DeleteSubjectResult> {
  return await db.transaction("rw", [db.subjects, db.gradebooks], async () => {
    const gradebookCount = await db.gradebooks.where("subjectId").equals(subjectId).count();
    if (gradebookCount > 0) return { deleted: false, reason: "in-use", gradebookCount };
    await db.subjects.delete(subjectId);
    return { deleted: true };
  });
}
