import { gradeValueSchema } from "@domain/gradebook/grade";
import { z } from "zod";
import type { AppDatabase } from ".";
import type { Grade, Gradebook, GradeColumn, Period, SchoolClass, Student, Subject } from "./types";

export interface WorkspaceBackup {
  version: 1;
  exportedAt: number;
  classes: SchoolClass[];
  students: Student[];
  subjects: Subject[];
  gradebooks: Gradebook[];
  periods: Period[];
  columns: GradeColumn[];
  grades: Grade[];
}

/**
 * Shape check only — the rows themselves are trusted, since a backup can only
 * come from this app. A wrong shape must fail loudly rather than half-import.
 */
const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number(),
  classes: z.array(z.object({ id: z.string() }).loose()),
  students: z.array(z.object({ id: z.string() }).loose()),
  subjects: z.array(z.object({ id: z.string() }).loose()),
  gradebooks: z.array(z.object({ id: z.string() }).loose()),
  periods: z.array(z.object({ id: z.string() }).loose()),
  columns: z.array(z.object({ id: z.string() }).loose()),
  grades: z.array(
    z
      .object({
        gradebookId: z.string(),
        columnId: z.string(),
        studentId: z.string(),
        value: gradeValueSchema,
      })
      .loose(),
  ),
});

/** Photos are Blobs and are not included — JSON cannot carry them. */
export async function exportWorkspace(db: AppDatabase): Promise<WorkspaceBackup> {
  const [classes, students, subjects, gradebooks, periods, columns, grades] = await Promise.all([
    db.classes.toArray(),
    db.students.toArray(),
    db.subjects.toArray(),
    db.gradebooks.toArray(),
    db.periods.toArray(),
    db.columns.toArray(),
    db.grades.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: Date.now(),
    classes,
    students: students.map(({ photo: _photo, ...rest }) => rest),
    subjects,
    gradebooks,
    periods,
    columns,
    grades,
  };
}

/**
 * Validates an unknown payload as a `WorkspaceBackup`, throwing on any
 * mismatch. Shared by `importWorkspace` and by the settings page, which
 * needs to read a chosen file's `exportedAt` before the teacher confirms —
 * without writing anything to the database yet.
 */
export function parseBackup(backup: unknown): WorkspaceBackup {
  const parsed = backupSchema.safeParse(backup);
  if (!parsed.success) {
    throw new Error("Invalid backup file");
  }
  return parsed.data as unknown as WorkspaceBackup;
}

/** Destructive: clears every table, then writes the backup's rows. */
export async function importWorkspace(db: AppDatabase, backup: unknown): Promise<void> {
  const data = parseBackup(backup);

  const tables = [
    db.classes,
    db.students,
    db.subjects,
    db.gradebooks,
    db.periods,
    db.columns,
    db.grades,
  ];

  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
    await db.classes.bulkAdd(data.classes);
    await db.students.bulkAdd(data.students);
    await db.subjects.bulkAdd(data.subjects);
    await db.gradebooks.bulkAdd(data.gradebooks);
    await db.periods.bulkAdd(data.periods);
    await db.columns.bulkAdd(data.columns);
    await db.grades.bulkPut(data.grades);
  });
}
