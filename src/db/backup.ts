import { gradeValueSchema } from "@domain/gradebook/grade";
import { z } from "zod";
import type { AppDatabase } from ".";
import type {
  AttendanceRecord,
  BehaviourEvent,
  Grade,
  Gradebook,
  GradeColumn,
  Period,
  SchoolClass,
  Seat,
  SeatingLayout,
  Session,
  Student,
  Subject,
} from "./types";

export interface WorkspaceBackup {
  version: 2;
  exportedAt: number;
  classes: SchoolClass[];
  students: Student[];
  subjects: Subject[];
  gradebooks: Gradebook[];
  periods: Period[];
  columns: GradeColumn[];
  grades: Grade[];
  sessions: Session[];
  attendance: AttendanceRecord[];
  behaviourEvents: BehaviourEvent[];
  seatingLayouts: SeatingLayout[];
  seats: Seat[];
}

/**
 * Shape check only — the rows themselves are trusted, since a backup can only
 * come from this app. A wrong shape must fail loudly rather than half-import.
 *
 * Version 1 is rejected outright, not upgraded: phase 2 introduced no
 * migration path, and a v1 file predates the classroom tables entirely, so
 * half-importing it would leave a workspace with gradebooks but no sessions
 * to hang attendance or behaviour off of.
 */
const backupSchema = z.object({
  version: z.literal(2),
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
  sessions: z.array(z.object({ id: z.string() }).loose()),
  attendance: z.array(
    z
      .object({
        sessionId: z.string(),
        studentId: z.string(),
      })
      .loose(),
  ),
  behaviourEvents: z.array(z.object({ id: z.string() }).loose()),
  seatingLayouts: z.array(z.object({ id: z.string() }).loose()),
  seats: z.array(
    z
      .object({
        layoutId: z.string(),
        row: z.number(),
        col: z.number(),
      })
      .loose(),
  ),
});

/**
 * Photos are Blobs and are not included — JSON cannot carry them.
 *
 * `notes` on a student *is* exported and now carries accommodations
 * (`PRIVACY.md` documents this) — unlike the photo, it is plain text and
 * survives `JSON.stringify` untouched, so it is not stripped here.
 */
export async function exportWorkspace(db: AppDatabase): Promise<WorkspaceBackup> {
  const [
    classes,
    students,
    subjects,
    gradebooks,
    periods,
    columns,
    grades,
    sessions,
    attendance,
    behaviourEvents,
    seatingLayouts,
    seats,
  ] = await Promise.all([
    db.classes.toArray(),
    db.students.toArray(),
    db.subjects.toArray(),
    db.gradebooks.toArray(),
    db.periods.toArray(),
    db.columns.toArray(),
    db.grades.toArray(),
    db.sessions.toArray(),
    db.attendance.toArray(),
    db.behaviourEvents.toArray(),
    db.seatingLayouts.toArray(),
    db.seats.toArray(),
  ]);

  return {
    version: 2,
    exportedAt: Date.now(),
    classes,
    students: students.map(({ photo: _photo, ...rest }) => rest),
    subjects,
    gradebooks,
    periods,
    columns,
    // Grades whose value no longer parses are dropped rather than exported.
    // A workspace created before `attendance` left the column types still
    // holds attendance grade rows; their column type is gone, so the rows are
    // unreachable in every grid and never averaged. Exporting them produced a
    // file this module's own `parseBackup` rejects — the teacher's backup was
    // unusable and nothing said why. Dropping an unreachable row loses
    // nothing that is still reachable.
    grades: grades.filter((grade) => gradeValueSchema.safeParse(grade.value).success),
    sessions,
    attendance,
    behaviourEvents,
    seatingLayouts,
    seats,
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
    db.sessions,
    db.attendance,
    db.behaviourEvents,
    db.seatingLayouts,
    db.seats,
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
    await db.sessions.bulkAdd(data.sessions);
    await db.attendance.bulkPut(data.attendance);
    await db.behaviourEvents.bulkAdd(data.behaviourEvents);
    await db.seatingLayouts.bulkAdd(data.seatingLayouts);
    await db.seats.bulkPut(data.seats);
  });
}
