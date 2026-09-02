import { gradeValueSchema } from "@domain/gradebook/grade";
import { z } from "zod";
import type { AppDatabase } from ".";
import type {
  AttendanceRecord,
  BehaviourEvent,
  DiaryEntry,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  RubricAssessment,
  RubricScore,
  RubricTemplate,
  ScheduleEntry,
  SchoolClass,
  Seat,
  SeatingLayout,
  Session,
  Student,
  StudentGroup,
  Subject,
} from "./types";

export interface WorkspaceBackup {
  version: 6;
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
  rubricTemplates: RubricTemplate[];
  rubricAssessments: RubricAssessment[];
  rubricScores: RubricScore[];
  studentGroups: StudentGroup[];
  groupMembers: GroupMember[];
  scheduleEntries: ScheduleEntry[];
  diaryEntries: DiaryEntry[];
}

/**
 * Shape check only — the rows themselves are trusted, since a backup can only
 * come from this app. A wrong shape must fail loudly rather than half-import.
 *
 * Version 2 is rejected outright, not upgraded: phase 2B introduced no
 * migration path, and a v2 file predates the rubric tables entirely, so
 * half-importing it would leave a workspace with gradebooks but no rubric
 * assessments to hang scores off of. Version 3 is rejected the same way: it
 * predates student groups entirely, version 4 the recurring timetable, and
 * version 5 the journal.
 * The rule for the next schema change is unchanged: bump the version, do not
 * write an upgrade — importing a file half-populated is worse than refusing
 * it, because half a workspace looks like a whole one.
 */
const backupSchema = z.object({
  version: z.literal(6),
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
        // Optional: a note may exist before a mark does — "absent, à
        // rattraper" is worth recording against a cell with no value yet.
        value: gradeValueSchema.optional(),
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
        studentId: z.string().nullable(),
      })
      .loose(),
  ),
  rubricTemplates: z.array(z.object({ id: z.string() }).loose()),
  rubricAssessments: z.array(z.object({ id: z.string() }).loose()),
  rubricScores: z.array(
    z
      .object({
        assessmentId: z.string(),
        criterionId: z.string(),
        studentId: z.string(),
      })
      .loose(),
  ),
  studentGroups: z.array(z.object({ id: z.string() }).loose()),
  groupMembers: z.array(
    z
      .object({
        groupId: z.string(),
        studentId: z.string(),
      })
      .loose(),
  ),
  scheduleEntries: z.array(z.object({ id: z.string() }).loose()),
  diaryEntries: z.array(z.object({ classId: z.string(), date: z.number() }).loose()),
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
    rubricTemplates,
    rubricAssessments,
    rubricScores,
    studentGroups,
    groupMembers,
    scheduleEntries,
    diaryEntries,
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
    db.rubricTemplates.toArray(),
    db.rubricAssessments.toArray(),
    db.rubricScores.toArray(),
    db.studentGroups.toArray(),
    db.groupMembers.toArray(),
    db.scheduleEntries.toArray(),
    db.diaryEntries.toArray(),
  ]);

  return {
    version: 6,
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
    // Drop only rows whose value is PRESENT and no longer parses — the stale
    // attendance rows a pre-phase-2 workspace left behind. A row with no value
    // at all is a legitimate note-only annotation and must survive: filtering
    // on parse success alone silently deleted a teacher's remarks on export.
    grades: grades.filter(
      (grade) => grade.value === undefined || gradeValueSchema.safeParse(grade.value).success,
    ),
    sessions,
    attendance,
    behaviourEvents,
    seatingLayouts,
    seats,
    rubricTemplates,
    rubricAssessments,
    rubricScores,
    studentGroups,
    groupMembers,
    scheduleEntries,
    diaryEntries,
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
    db.rubricTemplates,
    db.rubricAssessments,
    db.rubricScores,
    db.studentGroups,
    db.groupMembers,
    db.scheduleEntries,
    db.diaryEntries,
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
    await db.rubricTemplates.bulkAdd(data.rubricTemplates);
    await db.rubricAssessments.bulkAdd(data.rubricAssessments);
    await db.rubricScores.bulkPut(data.rubricScores);
    await db.studentGroups.bulkAdd(data.studentGroups);
    await db.groupMembers.bulkPut(data.groupMembers);
    await db.scheduleEntries.bulkAdd(data.scheduleEntries);
    await db.diaryEntries.bulkPut(data.diaryEntries);
  });
}
