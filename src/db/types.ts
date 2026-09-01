import type { AttendanceValue } from "@domain/attendance";
import type { BehaviourType } from "@domain/behaviour";
import type { ColumnType } from "@domain/gradebook/column";
import type { GradeValue } from "@domain/gradebook/grade";

/** A teaching group: "3°B". `class` is reserved, hence SchoolClass. */
export interface SchoolClass {
  id: string;
  name: string;
  level?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Student {
  id: string;
  classId: string;
  firstName: string;
  lastName: string;
  photo?: Blob;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** One class taught in one subject. Owns its periods and columns. */
export interface Gradebook {
  id: string;
  classId: string;
  subjectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** A trimestre or semestre. Belongs to a gradebook, not the workspace. */
export interface Period {
  id: string;
  gradebookId: string;
  name: string;
  order: number;
}

/** One assessment column. `max` only meaningful when type is "numeric". */
export interface GradeColumn {
  id: string;
  gradebookId: string;
  periodId: string;
  type: ColumnType;
  label: string;
  weight: number;
  max: number;
  order: number;
  date?: number;
}

/** One cell. Keyed by [gradebookId+columnId+studentId]. */
export interface Grade {
  gradebookId: string;
  columnId: string;
  studentId: string;
  value: GradeValue;
  note?: string;
  updatedAt: number;
}

/**
 * One lesson: a class, a date, optionally a subject. Attendance and behaviour
 * events hang off it. A stored row rather than a (classId, date) key so that a
 * class taught twice in one day is representable.
 */
export interface Session {
  id: string;
  classId: string;
  subjectId?: string;
  date: number;
  createdAt: number;
}

/** One pupil's presence at one session. Keyed [sessionId+studentId]. */
export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  value: AttendanceValue;
  note?: string;
  updatedAt: number;
}

/**
 * One behaviour observation. Append-only: never edited in place, only deleted.
 * `classId` is denormalised so a class timeline is one index hit.
 */
export interface BehaviourEvent {
  id: string;
  sessionId: string;
  studentId: string;
  classId: string;
  type: BehaviourType;
  comment?: string;
  createdAt: number;
}

/** The room. One per class. */
export interface SeatingLayout {
  id: string;
  classId: string;
  rows: number;
  cols: number;
  updatedAt: number;
}

/**
 * One cell of the room. Keyed [layoutId+row+col].
 *
 * Three states, and they must stay distinct: no row at all is a gap (an aisle
 * or a doorway), a row with `studentId: null` is an empty seat, and a row with
 * a `studentId` is an occupied one.
 */
export interface Seat {
  layoutId: string;
  row: number;
  col: number;
  studentId: string | null;
}
