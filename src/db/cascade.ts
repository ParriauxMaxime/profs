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
