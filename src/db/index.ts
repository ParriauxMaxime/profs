import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Assignment,
  AttendanceRecord,
  BehaviourEvent,
  Desk,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  Room,
  RubricAssessment,
  RubricScore,
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
  Desk,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  Room,
  RubricAssessment,
  RubricScore,
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
  rubricAssessments: EntityTable<RubricAssessment, "id">;
  rubricScores: Table<RubricScore, [string, string, string]>;
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

/** The compound primary key of one rubric cell. */
export function rubricScoreKey(
  assessmentId: string,
  criterionId: string,
  studentId: string,
): [string, string, string] {
  return [assessmentId, criterionId, studentId];
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
  // v9 adds saved rooms — a named shape a teacher can stamp onto any class.
  // A plain add, so it is one version and no upgrade callback, per the standing
  // rule; the drop-then-recreate pair v7/v8 used is only for a key that changes.
  // `positions` is embedded in the row and therefore not indexed: a room is
  // always read whole, and nothing ever queries one position.
  db.version(9).stores({
    rooms: "id, name",
  });
  // v10 drops the saved room. It was a user-defined TEMPLATE — positions
  // embedded in the row, stamped through `applyTemplate`, no back-reference,
  // "stamps and ceases to exist". A shared salle is the opposite: editing 204
  // must change what 3°B and 5°A both see, which a stamp cannot do.
  //
  // The name is reused at v11 for that new meaning, so the old shape has to go
  // rather than be carried forward — a v9 row would feed `positions` into code
  // reading a `desks` table, which is the silent-zombie failure v7 was written
  // for.
  db.version(10).stores({
    rooms: null,
  });
  // v11 lays down the salle: furniture that belongs to no class, and the
  // assignation as its own row.
  //
  // `&[roomId+x+y]` keeps v8's guarantee that no two desks share a point, so a
  // bug in `canPlace` surfaces as a rejected write rather than as a pupil
  // nobody can tap.
  //
  // `&[planId+studentId]` is new, and it is the database refusing to seat one
  // pupil in two chairs — an invariant that used to live only in careful code.
  // Its consequence is load-bearing rather than incidental: seating an
  // already-seated pupil THROWS unless the write clears their old row first,
  // so every seat and swap is one transaction that deletes before it puts.
  //
  // `&[classId+roomId]` is what makes "one plan per class per salle" a fact
  // rather than a convention `getOrCreatePlan` has to be trusted to keep.
  //
  // `[planId+deskId]` as the primary key copies `grades`: seating is a one-row
  // put, unseating a one-row delete, and nothing read-modify-writes a
  // collection.
  db.version(11).stores({
    rooms: "id, name",
    desks: "id, roomId, &[roomId+x+y]",
    seatingPlans: "id, classId, roomId, &[classId+roomId]",
    assignments: "[planId+deskId], planId, deskId, studentId, &[planId+studentId]",
  });
  // v12 drops the per-class layout, now that the plan tab reads the salle.
  //
  // Both stores changed SHAPE rather than key, which is the case v7's comment
  // generalised: a Seat carried a `studentId` and a SeatingLayout carried a
  // `classId`, and neither means anything once furniture belongs to a salle
  // and the assignation is its own row. Carried forward, a v11 seat would feed
  // a `layoutId` into code reading `planId` — a room that renders nothing and
  // cannot be told from an empty one.
  db.version(12).stores({
    seats: null,
    seatingLayouts: null,
  });
  // v13 points a timetable entry at a salle. A plain field add would need no
  // bump at all, but it is INDEXED — `deleteRoom` has to find every lesson
  // naming the salle it is about to remove, and a full scan of the timetable
  // on every delete is the kind of thing that is fine until it is not.
  //
  // The store is redeclared whole because Dexie's `stores` is a replacement,
  // not a patch. No upgrade callback, per the standing rule: a row carrying
  // the old free-text `room` simply keeps an unread property. That is NOT the
  // zombie case v7 was written for — a leftover string is inert, where a
  // missing `width` fed `undefined` into arithmetic and rendered scale(NaN).
  db.version(13).stores({
    scheduleEntries: "id, classId, weekday, gradebookId, roomId",
  });
  /**
   * A note belongs to a séance, not to a day.
   *
   * The store is dropped rather than migrated, per the standing rule: schema
   * changes are disposable, and a stale workspace is wiped rather than
   * upgraded. Every existing journal entry goes, which is accepted — the text
   * now lives on `Session.note`, which needed no version of its own because
   * `.stores()` declares indexes, not fields.
   */
  db.version(14).stores({ diaryEntries: null });
  /**
   * A lesson names a class and a matiere; it no longer names a carnet.
   *
   * `gradebookId` was a field the form wrote and NOTHING read — Today and the
   * hour grid both colour by `subjectId`, and the grid a lesson opens onto was
   * never built. What a `Gradebook` already knows is `(classId, subjectId)`,
   * which the entry states twice over, so the picker asked the teacher to
   * re-declare an association the two fields above it had already made.
   *
   * Only the INDEX needs a version — `.stores()` declares indexes, not fields
   * — and the store is redeclared whole because Dexie replaces rather than
   * patches. No upgrade callback: an existing row keeps an unread
   * `gradebookId` property, inert the way v13's leftover free-text `room` is.
   */
  db.version(15).stores({
    scheduleEntries: "id, classId, weekday, roomId",
  });
  return db;
}
