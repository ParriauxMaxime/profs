import { repairSeanceCollisions } from "@domain/seance";
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
   * ONE declaration, numbered above the last of the chain it replaces.
   *
   * There were sixteen versions, each a bump with no upgrade callback, because
   * schema changes here are disposable: a stale workspace is wiped rather than
   * migrated. Nothing is deployed, so that chain described migrations nobody
   * will ever run, and the current shape could only be read by replaying
   * fifteen diffs. What replaces it is not a chain of one — it is the same
   * rule stated once, at the next number up.
   *
   * The NUMBER is the load-bearing part, and 1 would have been a silent bug.
   * Dexie does not surface a downgrade: `dexieOpen` catches the `VersionError`
   * that a lower number provokes, reopens with no version at all, and patches
   * the declared schema into whatever it finds. A store that is GONE is not
   * dropped that way — it stays in IndexedDB, outside `db.tables`, and
   * therefore outside `wipeWorkspace`, which reads `db.tables` directly (the
   * backup's clear list does not: `importWorkspace` clears a hand-written
   * array, so it needs no fix here but also earns nothing from this number).
   * A term of pupils' levels would survive "supprimer toutes les données", and
   * `PRIVACY.md` promises that erase is permanent.
   *
   * At 17 the upgrade runs forwards, as an upgrade: Dexie diffs this
   * declaration against the stored schema, DELETES the stores that are gone —
   * `rubricAssessments`, `rubricScores`, and the older casualties before them
   * — and carries every surviving store forward with its rows untouched. A
   * grille already graded is lost because its store is dropped, not because
   * the workspace is discarded, and nothing reaches `RecoveryShell`.
   *
   * The rule for the next change is unchanged: add a table or a field, bump to
   * 18, write no upgrade function.
   *
   * `&` marks a unique index. `desks` refuses two tables on one square,
   * `seatingPlans` one plan per class per salle, and `assignments` one pupil
   * in two chairs — invariants that used to live only in careful code.
   */
  db.version(17).stores({
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
  /**
   * The one upgrade callback, and it is the same exception `db.version(16)`
   * made: a field became REQUIRED under rows that carry dependents.
   *
   * `Session.startsAt` and `endsAt` are not optional on the type, so a séance
   * recorded before séances carried times is a row that fails its own
   * declaration — the zombie the standing rule drops a store to avoid. Here
   * the rule's usual move is unavailable rather than merely unattractive:
   * `attendance` and `behaviourEvents` are keyed to `sessions.id`, so dropping
   * `sessions` leaves a term of both as rows nothing reads, nothing counts,
   * and every export carries. That argument survived the collapse untouched,
   * so the repair survives with it.
   *
   * One `.stores()` and one `.upgrade()` is still one version. The rule for
   * the next change is unchanged: bump to 18, and write no upgrade function —
   * this is what "unless a field becomes required under rows with dependents"
   * looks like when it happens, not a licence to write one by habit.
   */
  db.version(17).upgrade(async (tx) => {
    // Repaired as a WHOLE collection, never row by row: `backfillSeanceTimes`
    // alone cannot see that two untimed séances of one class on one day floor
    // to the same hour, and the first `resolveSlot` match would strand the
    // second forever. See `repairSeanceCollisions` for the invariant.
    const sessions = await tx.table("sessions").toArray();
    const repaired = new Map(repairSeanceCollisions(sessions).map((r) => [r.id, r]));
    await tx
      .table("sessions")
      .toCollection()
      .modify((session) => {
        const times = repaired.get(session.id);
        if (!times) return;
        session.startsAt = times.startsAt;
        session.endsAt = times.endsAt;
      });
  });
  return db;
}
