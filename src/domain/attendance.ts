/**
 * Whether a pupil was in the room.
 *
 * Attendance is a property of a session, not of a gradebook column: a lesson
 * happened on a date to a class, and the same fact must not be recordable in
 * two places. Values are stored raw and translated only for display.
 */

export const ATTENDANCE_VALUES = ["present", "absent", "late", "excused"] as const;

export type AttendanceValue = (typeof ATTENDANCE_VALUES)[number];

/**
 * There is deliberately no default value. An absent row means "not recorded",
 * not "present": the pupil page counts only what a teacher actually marked,
 * and a constant implying otherwise would argue for backfilling unmarked
 * sessions as present — inventing a record nobody made.
 */
export function parseAttendanceValue(raw: unknown): AttendanceValue | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return ATTENDANCE_VALUES.find((v) => v === text) ?? null;
}

/**
 * The colour each value wears on a seat, as a CSS custom property rather than
 * a literal — `BEHAVIOUR_COLORS`'s rule, for its reason: the same meaning needs
 * a different value on paper and on slate, so the domain owns which token a
 * value maps to and the stylesheet owns what that token is worth.
 *
 * These are their OWN tokens rather than the behaviour palette reused. A seat
 * carries both facts at once, and a green that means *présent* beside a green
 * that means *encouragement* would be one colour with two meanings on one
 * tile.
 *
 * There is deliberately no entry for "not recorded", which is not a value: an
 * unmarked pupil's seat draws no ring at all, the same distinction
 * `parseAttendanceValue` keeps above.
 */
export const ATTENDANCE_COLORS: Record<AttendanceValue, string> = {
  present: "var(--attendance-present)",
  absent: "var(--attendance-absent)",
  late: "var(--attendance-late)",
  excused: "var(--attendance-excused)",
};
