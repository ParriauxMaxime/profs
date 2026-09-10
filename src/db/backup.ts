import { classesOverCapacity, MAX_STUDENTS_PER_CLASS } from "@domain/class-size";
import { gradeValueSchema } from "@domain/gradebook/grade";
import { z } from "zod";
import type { AppDatabase } from ".";
import type {
  Assignment,
  AttendanceRecord,
  BehaviourEvent,
  CriterionLevel,
  Desk,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  Room,
  RubricTemplate,
  ScheduleEntry,
  SchoolClass,
  SeatingPlan,
  Session,
  Student,
  StudentGroup,
  Subject,
} from "./types";

export interface WorkspaceBackup {
  version: 13;
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
  rooms: Room[];
  desks: Desk[];
  seatingPlans: SeatingPlan[];
  assignments: Assignment[];
  rubricTemplates: RubricTemplate[];
  criterionLevels: CriterionLevel[];
  studentGroups: StudentGroup[];
  groupMembers: GroupMember[];
  scheduleEntries: ScheduleEntry[];
}

/**
 * Shape check only — the rows themselves are trusted, since a backup can only
 * come from this app. A wrong shape must fail loudly rather than half-import.
 *
 * ONE literal, and every other version refused. A file is importable only
 * while every store it names still exists, which is what each accumulated
 * literal had been quietly relying on: a format-12 file carries
 * `rubricAssessments`, a store this schema no longer has, so its grilles have
 * nowhere to land. Half-importing is worse than refusing — half a workspace
 * looks like a whole one — which is the ruling a format-10 file already got
 * for its day-keyed journal.
 *
 * The number stays monotonic rather than resetting with the schema. It now
 * carries no history, since nothing older is accepted, but a file written
 * today must not read as older than one written last week to anyone who opens
 * it in a text editor.
 *
 * The rule for the next schema change: bump this literal, write no upgrade.
 */
const backupSchema = z.object({
  version: z.literal(13),
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
  rooms: z.array(z.object({ id: z.string() }).loose()),
  desks: z.array(
    z.object({ id: z.string(), roomId: z.string(), x: z.number(), y: z.number() }).loose(),
  ),
  seatingPlans: z.array(
    z.object({ id: z.string(), classId: z.string(), roomId: z.string() }).loose(),
  ),
  assignments: z.array(
    z.object({ planId: z.string(), deskId: z.string(), studentId: z.string() }).loose(),
  ),
  rubricTemplates: z.array(z.object({ id: z.string() }).loose()),
  criterionLevels: z.array(
    z
      .object({
        columnId: z.string(),
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
    rooms,
    desks,
    seatingPlans,
    assignments,
    rubricTemplates,
    criterionLevels,
    studentGroups,
    groupMembers,
    scheduleEntries,
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
    db.rooms.toArray(),
    db.desks.toArray(),
    db.seatingPlans.toArray(),
    db.assignments.toArray(),
    db.rubricTemplates.toArray(),
    db.criterionLevels.toArray(),
    db.studentGroups.toArray(),
    db.groupMembers.toArray(),
    db.scheduleEntries.toArray(),
  ]);

  return {
    version: 13,
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
    rooms,
    desks,
    seatingPlans,
    assignments,
    rubricTemplates,
    criterionLevels,
    studentGroups,
    groupMembers,
    scheduleEntries,
  };
}

/**
 * A backup file carrying a class larger than the ceiling.
 *
 * Its own type, not a generic `Error`, because the settings page must tell
 * the teacher which of the two refusals happened: a malformed file is a bad
 * file, an over-capacity one is their own data hitting a rule added after it
 * was exported, and those need different words.
 */
export class BackupOverCapacityError extends Error {
  readonly classIds: string[];

  constructor(classIds: string[]) {
    super(`Class over capacity: ${classIds.join(", ")} (max ${MAX_STUDENTS_PER_CLASS})`);
    this.name = "BackupOverCapacityError";
    this.classIds = classIds;
  }
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
  const data = parsed.data as unknown as WorkspaceBackup;

  // Refused whole, never imported and capped afterwards: a backup that
  // violates an invariant is rejected the same way a v5 file is rejected
  // rather than upgraded. Half a legal workspace looks like a whole one.
  //
  // This runs BEFORE `importWorkspace`'s transaction clears every table, so a
  // refusal costs the teacher nothing.
  const over = classesOverCapacity(data.students);
  if (over.length > 0) throw new BackupOverCapacityError(over);

  return data;
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
    db.rooms,
    db.desks,
    db.seatingPlans,
    db.assignments,
    db.rubricTemplates,
    db.criterionLevels,
    db.studentGroups,
    db.groupMembers,
    db.scheduleEntries,
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
    await db.rooms.bulkAdd(data.rooms);
    await db.desks.bulkAdd(data.desks);
    await db.seatingPlans.bulkAdd(data.seatingPlans);
    await db.assignments.bulkPut(data.assignments);
    await db.rubricTemplates.bulkAdd(data.rubricTemplates);
    await db.criterionLevels.bulkPut(data.criterionLevels);
    await db.studentGroups.bulkAdd(data.studentGroups);
    await db.groupMembers.bulkPut(data.groupMembers);
    await db.scheduleEntries.bulkAdd(data.scheduleEntries);
  });
}
