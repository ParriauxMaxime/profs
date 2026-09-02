import type { AppDatabase } from ".";
import { gradeKey } from ".";

/**
 * Notes on a cell.
 *
 * `Grade.note` has existed in the schema since v1 and nothing ever wrote it.
 * A note may exist without a mark — "absent, à rattraper" is worth recording
 * before there is anything to record it against — so these functions maintain
 * one invariant: a row with neither a value nor a note is deleted, never left
 * behind. Such a row is invisible in every grid and would ride along in every
 * export forever.
 */
export async function setGradeNote(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  const key = gradeKey(gradebookId, columnId, studentId);

  await db.transaction("rw", db.grades, async () => {
    const existing = await db.grades.get(key);

    if (trimmed.length === 0) {
      if (!existing) return;
      if (existing.value === undefined) {
        await db.grades.delete(key);
        return;
      }
      const { note: _dropped, ...rest } = existing;
      await db.grades.put({ ...rest, updatedAt: Date.now() });
      return;
    }

    await db.grades.put({
      ...(existing ?? { gradebookId, columnId, studentId }),
      note: trimmed,
      updatedAt: Date.now(),
    });
  });
}

export async function clearGradeNote(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
): Promise<void> {
  await setGradeNote(db, gradebookId, columnId, studentId, "");
}
