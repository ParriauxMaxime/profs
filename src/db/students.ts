import type { AppDatabase } from ".";

/**
 * Per-pupil writes made from the seating plan's pupil card.
 *
 * Both fields here are the most sensitive data the app holds. A photo is a
 * `Blob` that never leaves IndexedDB and is excluded from the JSON export;
 * `notes` carries accommodations — PAP, PPRE, tiers-temps — and IS included
 * in the export, which `PRIVACY.md` states explicitly. Neither claim may
 * change without changing that document.
 */

/** Set or remove a pupil's photo. */
export async function setStudentPhoto(
  db: AppDatabase,
  studentId: string,
  photo: Blob | null,
): Promise<void> {
  await db.students.update(studentId, {
    photo: photo ?? undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Set a pupil's free-text notes.
 *
 * Blank notes are stored as absent rather than as an empty string, so a field
 * cleared by the teacher reads the same as one never filled in.
 */
export async function setStudentNotes(
  db: AppDatabase,
  studentId: string,
  notes: string,
): Promise<void> {
  const trimmed = notes.trim();
  await db.students.update(studentId, {
    notes: trimmed.length > 0 ? trimmed : undefined,
    updatedAt: Date.now(),
  });
}
