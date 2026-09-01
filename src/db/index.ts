import Dexie, { type EntityTable, type Table } from "dexie";
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

export type {
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
  seats: Table<Seat, [string, number, number]>;
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

/** The compound primary key of one cell of a room. */
export function seatKey(layoutId: string, row: number, col: number): [string, number, number] {
  return [layoutId, row, col];
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
  return db;
}
