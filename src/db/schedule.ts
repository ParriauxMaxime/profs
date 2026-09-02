import type { WeekCycle } from "@domain/schedule";
import type { AppDatabase, ScheduleEntry } from ".";

/**
 * The recurring timetable's writes.
 *
 * A schedule entry predicts a lesson; it never records one. Nothing here
 * creates a `Session` — that stays lazy, so a week the teacher was off leaves
 * no trace in anybody's attendance.
 */

export interface ScheduleEntryInput {
  /** Omit to create; pass an existing id to update in place. */
  id?: string;
  classId: string;
  subjectId?: string;
  gradebookId?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
  room?: string;
}

export type SaveScheduleResult =
  | { saved: true; id: string }
  | { saved: false; reason: "invalid-range" | "invalid-weekday" };

/**
 * Create or update one entry.
 *
 * A lesson that ends before it begins, or lasts no time at all, is refused
 * rather than stored: it would sort unpredictably against its neighbours and
 * render as a lesson of negative length. The refusal returns a reason instead
 * of throwing, because the caller is a form that has to say what is wrong and
 * keep the teacher's input on screen — the same shape as `deleteSubject`.
 */
export async function saveScheduleEntry(
  db: AppDatabase,
  input: ScheduleEntryInput,
): Promise<SaveScheduleResult> {
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    return { saved: false, reason: "invalid-weekday" };
  }
  if (input.endMinute <= input.startMinute) {
    return { saved: false, reason: "invalid-range" };
  }

  const now = Date.now();
  const id = input.id ?? crypto.randomUUID();
  const existing = input.id === undefined ? undefined : await db.scheduleEntries.get(input.id);

  const entry: ScheduleEntry = {
    id,
    classId: input.classId,
    // Absent rather than an empty value: an optional field that is stored as
    // `undefined` explicitly still rides along in every export.
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    ...(input.gradebookId ? { gradebookId: input.gradebookId } : {}),
    weekday: input.weekday,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    weekCycle: input.weekCycle,
    ...(input.room?.trim() ? { room: input.room.trim() } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.scheduleEntries.put(entry);
  return { saved: true, id };
}

/** One class's timetable, ordered as a week reads. */
export async function entriesForClass(db: AppDatabase, classId: string): Promise<ScheduleEntry[]> {
  const entries = await db.scheduleEntries.where("classId").equals(classId).toArray();
  return sortForWeek(entries);
}

/** Every entry in the workspace — what Today filters down to one day. */
export async function allEntries(db: AppDatabase): Promise<ScheduleEntry[]> {
  return sortForWeek(await db.scheduleEntries.toArray());
}

function sortForWeek(entries: ScheduleEntry[]): ScheduleEntry[] {
  return entries.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}
