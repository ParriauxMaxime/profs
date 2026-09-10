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

/**
 * Mark présent every pupil of a séance who carries no row yet.
 *
 * REMAINING, never all. The gesture it serves is "the two absences are marked,
 * everyone else was here": overwriting would silently un-record the marks the
 * teacher had just made, and it is the one button on the page that touches a
 * whole class at once, so getting that wrong is thirty wrong facts rather than
 * one.
 *
 * It writes présent EXPLICITLY, which is not the same as the default
 * `attendance.ts` refuses to define. A default would claim a pupil was here
 * because nobody said otherwise; this is a teacher stating it for a class they
 * are standing in front of, and every row it writes is one somebody chose.
 *
 * Read and write in one transaction: the caller renders from a live query, so
 * a mark landing between deciding who is unmarked and writing them would be
 * overwritten by a decision made before it existed.
 */
export async function markRemainingPresent(
  db: AppDatabase,
  sessionId: string,
  studentIds: readonly string[],
): Promise<void> {
  await db.transaction("rw", db.attendance, async () => {
    const marked = new Set(
      (await db.attendance.where("sessionId").equals(sessionId).toArray()).map(
        (row) => row.studentId,
      ),
    );
    const updatedAt = Date.now();
    const rows = studentIds
      .filter((studentId) => !marked.has(studentId))
      .map((studentId) => ({ sessionId, studentId, value: "present" as const, updatedAt }));
    if (rows.length > 0) await db.attendance.bulkPut(rows);
  });
}
