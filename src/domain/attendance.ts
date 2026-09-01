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
