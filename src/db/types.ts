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
 *
 * `criteria` is only meaningful when `type` is "rubric", and it is the third
 * instance of that pattern rather than a new one: it is embedded rather than
 * given its own store because a critère is never queried, listed or deleted
 * except through its column, so embedding avoids a join for something always
 * read whole. A LEVEL is the opposite and keeps its own row — see
 * `criterionLevels`.
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
  /** When the column was created. Read only for `type: "rubric"` — a grille happened on a day. */
  date?: number;
  calculation?: CalculationSpec;
  criteria?: RubricCriterion[];
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
  /**
   * Minutes from midnight. Required: a séance always has a time.
   *
   * It was optional until v16, and the absence meant "recorded before séances
   * carried a time, or opened outside the timetable". That absence had to be
   * covered by everything that read a séance, and on an hour grid it has no
   * answer at all — a lesson with no time has no position.
   *
   * This records WHEN THIS LESSON WAS; it is not a foreign key into the
   * timetable. A lesson moved to another hour next term leaves every past
   * séance holding the time it actually happened at, which is why both ends
   * are COPIED from the schedule entry rather than read through it.
   */
  startsAt: number;
  /** Minutes from midnight. `startsAt + DEFAULT_SEANCE_MINUTES` by default. */
  endsAt: number;
  /** What was done in this lesson. Free text, written and read whole. */
  note?: string;
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

/**
 * A salle: a physical room, sized in half-tiles.
 *
 * It belongs to the ÉTABLISSEMENT and to no class. 204 holds its tables
 * whether or not 3°B is in it, and both 3°B and 5°A sit at the same furniture.
 * That is the whole of why this is not a `SeatingLayout` with a nicer name:
 * a layout was owned by one class, so two classes in one physical room kept
 * two copies of it and editing one reached neither the other.
 *
 * It carries no `positions`. Furniture lives in `desks`, because a desk needs
 * an id for an assignment to name.
 */
export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One place at one table, in one salle.
 *
 * `Desk` rather than `Table`: a Dexie store named `tables` would shadow
 * `db.tables`, the getter `wipeWorkspace` reads directly — a silent, total
 * break. Same reason `SchoolClass` is not `class` and `GradeColumn` is not
 * `Column`. The French interface still says *table*.
 *
 * Carries no `studentId`. Who sits here is a property of a CLASS in this
 * salle, not of the furniture, and storing it on the desk is what made a room
 * unshareable.
 *
 * Two desks exactly `TABLE` apart share an edge and DRAW as one table. That
 * merge is a rendering and never a datum — see `tableGroups`.
 */
export interface Desk {
  id: string;
  roomId: string;
  x: number;
  y: number;
}

/**
 * One class's arrangement in one salle.
 *
 * Exactly one per (class, salle), which the `&[classId+roomId]` index
 * enforces. A class taught in two salles has two plans and picks between them
 * by picking the salle; several named arrangements of the SAME salle were
 * considered and cut, since rearranging and rearranging back is cheaper than
 * a feature.
 */
export interface SeatingPlan {
  id: string;
  classId: string;
  roomId: string;
  updatedAt: number;
}

/**
 * One pupil at one desk, within one plan.
 *
 * Keyed `[planId+deskId]`, which copies `Grade` exactly: seating is a one-row
 * `put`, unseating a one-row `delete`, and nothing ever read-modify-writes a
 * collection of them.
 *
 * `&[planId+studentId]` is the database refusing to seat one pupil in two
 * chairs — an invariant that used to live only in careful code. Its
 * consequence is load-bearing: seating an already-seated pupil THROWS unless
 * the write clears their old row first, so every seat and swap is one
 * transaction that deletes before it puts.
 */
export interface Assignment {
  planId: string;
  deskId: string;
  studentId: string;
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
 * One pupil's level on one critère of one column. Keyed
 * [columnId+criterionId+studentId].
 *
 * Its own row rather than a map inside a `Grade`, because a level is written
 * and cleared one tap at a time — the same fork `Grade` and `Assignment` are
 * on the other side of. A map would make each tap a read-modify-write, and
 * two fast taps could lose one silently.
 */
export interface CriterionLevel {
  columnId: string;
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
 * It names a class and a matiere, never a carnet. A `Gradebook` is itself
 * `(classId, subjectId, name)`, so a `gradebookId` here would restate the two
 * fields below it — and would have to choose between a class's carnets when it
 * holds two of one matiere ("Ecrit" and "Oral"), a choice that belongs where
 * the marking happens rather than in a timetable filled once a year.
 */
export interface ScheduleEntry {
  id: string;
  classId: string;
  subjectId?: string;
  /** ISO weekday, 1 = Monday through 7 = Sunday. */
  weekday: number;
  /** Minutes from midnight. A time is arithmetic, so it is stored as such. */
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
  /**
   * The salle this lesson happens in, when it is one the teacher has created.
   *
   * Replaces a free-text `room` label. Two spellings of "which room" was one
   * too many the moment a salle became a record: the label could say "B12"
   * while the class's plan lived in a salle called "204", and nothing could
   * tell they were meant to be the same place. A teacher who wants "Gymnase"
   * on the timetable creates a salle called Gymnase, which costs one click and
   * gives them a plan there.
   *
   * Optional, and it must stay optional: a lesson may legitimately have no
   * room recorded, and `deleteRoom` UNLINKS rather than cascades.
   */
  roomId?: string;
  createdAt: number;
  updatedAt: number;
}
