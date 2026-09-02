import type { AttendanceValue } from "@domain/attendance";
import type { AppDatabase } from ".";
import { attendanceKey } from ".";

/**
 * Attendance: one row per pupil per session.
 *
 * Attendance is a property of a session, never a gradebook column — a lesson
 * happened on a date to a class, and that fact must not be recordable in two
 * places.
 *
 * The stored `value` is a raw domain string. Only the display is translated.
 */

/** Record a pupil's presence, replacing whatever was there. */
export async function setAttendance(
  db: AppDatabase,
  sessionId: string,
  studentId: string,
  value: AttendanceValue,
): Promise<void> {
  await db.attendance.put({ sessionId, studentId, value, updatedAt: Date.now() });
}

/** Remove the record entirely — no mark, not a mark of "present". */
export async function clearAttendance(
  db: AppDatabase,
  sessionId: string,
  studentId: string,
): Promise<void> {
  await db.attendance.delete(attendanceKey(sessionId, studentId));
}

/**
 * Tap semantics: tapping the value already recorded clears it.
 *
 * This is what the pupil card calls. It re-reads inside a transaction rather
 * than trusting the value the card last rendered — a stale render would
 * otherwise turn an intended clear into a no-op, or worse, re-record a mark
 * the teacher had just removed.
 */
export async function toggleAttendance(
  db: AppDatabase,
  sessionId: string,
  studentId: string,
  value: AttendanceValue,
): Promise<void> {
  const key = attendanceKey(sessionId, studentId);
  await db.transaction("rw", db.attendance, async () => {
    const existing = await db.attendance.get(key);
    if (existing?.value === value) {
      await db.attendance.delete(key);
      return;
    }
    await db.attendance.put({ sessionId, studentId, value, updatedAt: Date.now() });
  });
}
