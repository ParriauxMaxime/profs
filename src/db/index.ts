import Dexie, { type EntityTable, type Table } from "dexie";
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

export type {
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
  seatingLayouts: EntityTable<SeatingLayout, "id">;
  seats: EntityTable<Seat, "id">;
  rubricTemplates: EntityTable<RubricTemplate, "id">;
  rubricAssessments: EntityTable<RubricAssessment, "id">;
  rubricScores: Table<RubricScore, [string, string, string]>;
  studentGroups: EntityTable<StudentGroup, "id">;
  groupMembers: Table<GroupMember, [string, string]>;
  scheduleEntries: EntityTable<ScheduleEntry, "id">;
  diaryEntries: Table<DiaryEntry, [string, number]>;
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

/** The compound primary key of one rubric cell. */
export function rubricScoreKey(
  assessmentId: string,
  criterionId: string,
  studentId: string,
): [string, string, string] {
  return [assessmentId, criterionId, studentId];
}

/** The compound primary key of one day's journal entry for one class. */
export function diaryKey(classId: string, date: number): [string, number] {
  return [classId, date];
}

/** The compound primary key of one pupil's membership in one group. */
export function groupMemberKey(groupId: string, studentId: string): [string, string] {
  return [groupId, studentId];
}

export function openWorkspaceDb(workspaceId: string): AppDatabase {
  const db = new Dexie(`profs-${workspaceId}`) as AppDatabase;
  // v2 adds the classroom tables. Existing data is disposable — there is no
  // upgrade callback, so Dexie creates the new stores empty and any attendance
  // grade row left over from v1 is garbage the wipe in Réglages clears.
  db.version(2).stores({
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
    seatingLayouts: "id, classId",
    seats: "[layoutId+row+col], layoutId, studentId",
  });
  // v3 adds the rubric tables. Dexie carries forward every unchanged store,
  // so only the three new ones are listed here.
  db.version(3).stores({
    rubricTemplates: "id, name",
    rubricAssessments: "id, gradebookId, periodId, date",
    rubricScores: "[assessmentId+criterionId+studentId], assessmentId, criterionId, studentId",
  });
  // v4 adds student groups. Existing data is disposable — there is no
  // upgrade callback, so only the two new stores are listed here.
  db.version(4).stores({
    studentGroups: "id, classId",
    groupMembers: "[groupId+studentId], groupId, studentId",
  });
  // v5 adds the recurring timetable. Existing data is disposable — there is no
  // upgrade callback, so only the new store is listed here.
  db.version(5).stores({
    scheduleEntries: "id, classId, weekday, gradebookId",
  });
  // v6 adds the journal. Existing data is disposable — there is no upgrade
  // callback, so only the new store is listed here.
  db.version(6).stores({
    diaryEntries: "[classId+date], classId, date",
  });
  // v7 turns the room from a grid into free positions, and it takes TWO
  // versions to do it. Every earlier bump in this file added a table, and
  // "bump the version, write no upgrade" holds for that. Changing a table's
  // PRIMARY KEY is different: Dexie refuses it outright with `UpgradeError:
  // Not yet support for changing primary key`, thrown while opening. `init.ts`
  // does not catch it, so a teacher with an existing workspace would get a
  // blank screen — their pupils still in IndexedDB, and no route to the wipe
  // in Réglages. Disposable must mean wiped on the next boot, never bricked.
  //
  // Dropping the store and recreating it is the whole of the migration: a v6
  // seat keyed [layoutId+row+col] is garbage either way, and every other table
  // is carried forward untouched.
  //
  // `seatingLayouts` goes with the seats, and it must. Its primary key never
  // changed, so Dexie would happily carry a v6 room forward — but a v6 room
  // carries `rows`/`cols` where the new one carries `width`/`height`, and a
  // layout whose every seat was just discarded describes nothing anyway.
  // Carried forward, `layout.width` is `undefined`: the room renders at
  // `scale(NaN)`, `floorSlots` yields nothing, `addTable` refuses every
  // placement, and a backup taken in that window exports the zombie row
  // intact. Same doctrine as the seats — disposable, not migrated.
  db.version(7).stores({
    seats: null,
    seatingLayouts: null,
  });
  // v8 lays the free-position room down in a fresh store. `&[layoutId+x+y]` is
  // unique: it is the database's own guarantee that two tables never share a
  // point, so a bug in `canPlace` surfaces as a rejected write rather than as
  // a pupil nobody can tap. `seatingLayouts` is redeclared at its unchanged
  // key so the empty store comes back for `getOrCreateLayout` to fill.
  db.version(8).stores({
    seats: "id, layoutId, studentId, &[layoutId+x+y]",
    seatingLayouts: "id, classId",
  });
  return db;
}
