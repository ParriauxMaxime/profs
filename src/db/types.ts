import type { AttendanceValue } from "@domain/attendance";
import type { BehaviourType } from "@domain/behaviour";
import type { CalculationSpec } from "@domain/gradebook/calculation";
import type { ColumnType } from "@domain/gradebook/column";
import type { GradeValue } from "@domain/gradebook/grade";
import type { RubricCriterion, RubricLevel } from "@domain/rubric";
import type { WeekCycle } from "@domain/schedule";

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

/**
 * One assessment column. `max` only meaningful when type is "numeric".
 *
 * `calculation` is only meaningful when `type` is "calculation": the column
 * stores no grade rows of its own, its value is derived on read from other
 * columns' grades. See `src/domain/gradebook/calculation.ts`.
 */
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
  calculation?: CalculationSpec;
}

/**
 * One cell. Keyed by [gradebookId+columnId+studentId].
 *
 * `value` is optional: a note can exist before a mark does ("absent, à
 * rattraper"). A row with neither `value` nor `note` must never be stored —
 * see `src/db/grades.ts`.
 */
export interface Grade {
  gradebookId: string;
  columnId: string;
  studentId: string;
  value?: GradeValue;
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

/** A reusable criteria set, managed in Réglages. */
export interface RubricTemplate {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One assessment of one gradebook's class against a set of criteria.
 *
 * `criteria` is a COPY taken when a template was attached, never a reference:
 * editing the template afterwards must not rewrite a grid already graded.
 */
export interface RubricAssessment {
  id: string;
  gradebookId: string;
  periodId: string;
  sessionId?: string;
  name: string;
  date: number;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

/** One cell. Keyed [assessmentId+criterionId+studentId]. */
export interface RubricScore {
  assessmentId: string;
  criterionId: string;
  studentId: string;
  level: RubricLevel;
  updatedAt: number;
}

/**
 * A working group of pupils within a class — for selecting and viewing, never
 * for holding a grade. `color` follows the same palette as `Subject.color`.
 */
export interface StudentGroup {
  id: string;
  classId: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** One pupil's membership in one group. Keyed [groupId+studentId]. */
export interface GroupMember {
  groupId: string;
  studentId: string;
}

/**
 * One recurring lesson in the weekly timetable.
 *
 * A PREDICTION, never a record that a lesson happened — that stays a
 * `Session`, created lazily when a teacher starts recording. Keeping the two
 * apart is what stops every holiday and cancellation leaving an empty lesson
 * in a pupil's timeline.
 *
 * `gradebookId` is optional: a lesson usually maps to one, and Today can then
 * offer the grid directly, but a class with no gradebook yet must still be
 * schedulable.
 */
export interface ScheduleEntry {
  id: string;
  classId: string;
  subjectId?: string;
  gradebookId?: string;
  /** ISO weekday, 1 = Monday through 7 = Sunday. */
  weekday: number;
  /** Minutes from midnight. A time is arithmetic, so it is stored as such. */
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
  room?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * One day's journal entry for one class. Keyed [classId+date].
 *
 * `date` is local midnight, as `Session.date` is. Deliberately carries NO
 * `sessionId`: an entry is writable before the lesson happens, and hanging it
 * off a session would mean writing next Thursday's plan created a session for
 * a lesson nobody taught — quietly undoing phase 4a's ruling that the schedule
 * predicts and never pre-creates. The two are joined at read time only.
 *
 * One entry per class per day, not per lesson slot: keying on a start time
 * would pin the text to a clock, and moving a lesson from 10h to 11h would
 * make its entry match no lesson and vanish. A class taught twice in one day
 * shares an entry, which is accepted.
 */
export interface DiaryEntry {
  classId: string;
  date: number;
  text: string;
  createdAt: number;
  updatedAt: number;
}
