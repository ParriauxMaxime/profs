import Dexie, { type EntityTable, type Table } from "dexie";
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

export type {
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

export type AppDatabase = Dexie & {
  classes: EntityTable<SchoolClass, "id">;
  students: EntityTable<Student, "id">;
  subjects: EntityTable<Subject, "id">;
  gradebooks: EntityTable<Gradebook, "id">;
  periods: EntityTable<Period, "id">;
  columns: EntityTable<GradeColumn, "id">;
  grades: Table<Grade, [string, string, string]>;
  sessions: EntityTable<Session, "id">;
  attendance: Table<AttendanceRecord, [string, string]>;
  behaviourEvents: EntityTable<BehaviourEvent, "id">;
  rooms: EntityTable<Room, "id">;
  desks: EntityTable<Desk, "id">;
  seatingPlans: EntityTable<SeatingPlan, "id">;
  assignments: Table<Assignment, [string, string]>;
  rubricTemplates: EntityTable<RubricTemplate, "id">;
  criterionLevels: Table<CriterionLevel, [string, string, string]>;
  studentGroups: EntityTable<StudentGroup, "id">;
  groupMembers: Table<GroupMember, [string, string]>;
  scheduleEntries: EntityTable<ScheduleEntry, "id">;
};

/** The compound primary key of a cell. */
export function gradeKey(
  gradebookId: string,
  columnId: string,
  studentId: string,
): [string, string, string] {
  return [gradebookId, columnId, studentId];
}

/** The compound primary key of one pupil's presence at one session. */
export function attendanceKey(sessionId: string, studentId: string): [string, string] {
  return [sessionId, studentId];
}

/** The compound primary key of one pupil's level on one critère. */
export function criterionLevelKey(
  columnId: string,
  criterionId: string,
  studentId: string,
): [string, string, string] {
  return [columnId, criterionId, studentId];
}

/** The compound primary key of one pupil's membership in one group. */
export function groupMemberKey(groupId: string, studentId: string): [string, string] {
  return [groupId, studentId];
}

export function openWorkspaceDb(workspaceId: string): AppDatabase {
  const db = new Dexie(`profs-${workspaceId}`) as AppDatabase;
  /**
   * ONE version, declaring the schema as it stands.
   *
   * There were sixteen, each a bump with no upgrade callback, because schema
   * changes here are disposable: a stale workspace is wiped on the next boot
   * rather than migrated. Nothing is deployed, so that chain described
   * migrations nobody will ever run, and the current shape could only be read
   * by replaying fifteen diffs.
   *
   * The consequence is load-bearing and deliberate: IndexedDB refuses to open
   * a database at a version LOWER than the stored one, so every workspace
   * built by an earlier build fails to open with `VersionError`, reaches
   * `RecoveryShell`, and is offered the discard. That is only true because
   * `classifyOpenFailure` treats `VersionError` as `corrupt` — see
   * `src/domain/recovery.ts`. Without that, this line bricks every existing
   * workspace instead of wiping it.
   *
   * The rule for the next change is unchanged: add a table or a field, bump to
   * version 2, write no upgrade function.
   *
   * `&` marks a unique index. `desks` refuses two tables on one square,
   * `seatingPlans` one plan per class per salle, and `assignments` one pupil
   * in two chairs — invariants that used to live only in careful code.
   */
  db.version(1).stores({
    classes: "id, name",
    students: "id, classId, lastName",
    subjects: "id, name",
    gradebooks: "id, classId, subjectId",
    periods: "id, gradebookId, order",
    columns: "id, gradebookId, periodId, order",
    grades: "[gradebookId+columnId+studentId], gradebookId, columnId, studentId",
    sessions: "id, classId, date, [classId+date], subjectId",
    attendance: "[sessionId+studentId], sessionId, studentId",
    behaviourEvents: "id, sessionId, studentId, classId, createdAt",
    rooms: "id, name",
    desks: "id, roomId, &[roomId+x+y]",
    seatingPlans: "id, classId, roomId, &[classId+roomId]",
    assignments: "[planId+deskId], planId, deskId, studentId, &[planId+studentId]",
    rubricTemplates: "id, name",
    // A level, not a score: it is one pupil's level on one critère of one
    // COLUMN. The name it had pointed at an assessment row that no longer
    // exists. Keyed like `grades` — one tap is one put, one clear is one
    // delete, and nothing read-modify-writes a collection of them.
    criterionLevels: "[columnId+criterionId+studentId], columnId, criterionId, studentId",
    studentGroups: "id, classId",
    groupMembers: "[groupId+studentId], groupId, studentId",
    scheduleEntries: "id, classId, weekday, roomId",
  });
  return db;
}
