import type { GradeValue } from "@domain/gradebook/grade";
import type { AppDatabase } from ".";
import { gradeKey } from ".";

/**
 * One cell's mark. `null` means "clear this cell".
 *
 * The counterpart of `setGradeNote`, and it maintains the same invariant from
 * the other side: a row with neither a value nor a note is deleted rather than
 * left as an empty husk, since such a row is invisible in every grid and rides
 * along in every export forever.
 *
 * The read happens INSIDE the transaction rather than in the caller. A note
 * may have been written since the caller last rendered — by the note field's
 * own blur, or by another surface live on the same row — and a `put` built
 * from a stale snapshot drops it silently. Two of the three callers used to
 * hand-write this; one of them re-read and one did not.
 */
export async function writeGrade(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
  next: GradeValue | null,
): Promise<void> {
  const key = gradeKey(gradebookId, columnId, studentId);

  await db.transaction("rw", db.grades, async () => {
    const existing = await db.grades.get(key);

    if (next === null) {
      if (!existing) return;
      if (existing.note === undefined) {
        await db.grades.delete(key);
        return;
      }
      const { value: _dropped, ...rest } = existing;
      await db.grades.put({ ...rest, updatedAt: Date.now() });
      return;
    }

    await db.grades.put({
      ...(existing ?? { gradebookId, columnId, studentId }),
      value: next,
      updatedAt: Date.now(),
    });
  });
}

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
