import { startOfDay } from "@domain/term";
import type { AppDatabase, DiaryEntry } from ".";
import { diaryKey } from ".";

/**
 * The journal's writes.
 *
 * Nothing here creates, reads or touches a `Session`. An entry is writable
 * whether or not the lesson has happened, and phase 4a's ruling — the schedule
 * predicts, it never pre-creates — holds only because these functions write to
 * exactly one table.
 *
 * Every date is normalised to local midnight on the way in, so an entry
 * written at 21h and one written at 08h the same morning are the same row
 * rather than two.
 */

/**
 * Write one day's entry, or delete it when the text is blank.
 *
 * The empty-husk invariant, the same one `setGradeNote` and `setStudentNotes`
 * maintain: a row with nothing in it is invisible in the calendar, rides along
 * in every export forever, and makes "does this day have an entry?" answer
 * wrongly. Clearing the textarea deletes the row outright.
 */
export async function setDiaryEntry(
  db: AppDatabase,
  classId: string,
  date: number,
  text: string,
): Promise<void> {
  const day = startOfDay(date);
  const trimmed = text.trim();
  const key = diaryKey(classId, day);

  await db.transaction("rw", db.diaryEntries, async () => {
    const existing = await db.diaryEntries.get(key);

    if (trimmed.length === 0) {
      if (existing) await db.diaryEntries.delete(key);
      return;
    }

    const now = Date.now();
    await db.diaryEntries.put({
      classId,
      date: day,
      text: trimmed,
      // Kept from the original write: `createdAt` is when the teacher first
      // wrote about this lesson, not when they last corrected a typo.
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  });
}

export async function clearDiaryEntry(
  db: AppDatabase,
  classId: string,
  date: number,
): Promise<void> {
  await db.diaryEntries.delete(diaryKey(classId, startOfDay(date)));
}

/** One class's whole journal, oldest first. */
export async function diaryForClass(db: AppDatabase, classId: string): Promise<DiaryEntry[]> {
  const entries = await db.diaryEntries.where("classId").equals(classId).toArray();
  return entries.sort((a, b) => a.date - b.date);
}

/**
 * Every entry in a date range, across all classes — what the calendar reads.
 *
 * Named `diary*` rather than `entriesInRange`: `src/db/schedule.ts` already
 * exports `entriesForClass` for schedule entries, and a calendar joining both
 * is exactly where two functions of the same name would be read wrong.
 */
export async function diaryInRange(
  db: AppDatabase,
  from: number,
  to: number,
): Promise<DiaryEntry[]> {
  const entries = await db.diaryEntries
    .where("date")
    .between(startOfDay(from), startOfDay(to), true, true)
    .toArray();
  return entries.sort((a, b) => a.date - b.date);
}
