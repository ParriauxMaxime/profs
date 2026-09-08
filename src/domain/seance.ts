/**
 * A slot: a lesson that is scheduled, taught, or merely prepared.
 *
 * The timetable predicts and never pre-creates, so a lesson exists on screen
 * before any row exists in the database. A slot is that lesson — the pairing
 * of what the timetable expects with what was actually recorded — and it is
 * what a link names and what the séance strip lists.
 */
export interface Slot {
  date: number;
  /** Minutes from midnight, or null for an unscheduled séance. */
  startsAt: number | null;
  /** The séance, once something has been recorded against it. */
  sessionId: string | null;
  /** The timetable entry that predicted it, if any. */
  entryId: string | null;
}

interface SessionLike {
  id: string;
  startsAt?: number;
}

interface EntryLike {
  id: string;
  startMinute: number;
}

/**
 * Every slot on one day, earliest first.
 *
 * A séance is paired with a scheduled lesson by TIME, not by class. Today's
 * page pairs by class and accepts being wrong when a class is taught twice in
 * a day; with `startsAt` that compromise is no longer needed.
 *
 * An untimed séance sorts last: it has nothing to sort by.
 */
export function slotsForDay(
  sessions: readonly SessionLike[],
  entries: readonly EntryLike[],
  date: number,
): Slot[] {
  const claimed = new Set<string>();
  const slots: Slot[] = sessions.map((session) => {
    const entry =
      session.startsAt === undefined
        ? undefined
        : entries.find((e) => e.startMinute === session.startsAt && !claimed.has(e.id));
    if (entry) claimed.add(entry.id);
    return {
      date,
      startsAt: session.startsAt ?? null,
      sessionId: session.id,
      entryId: entry?.id ?? null,
    };
  });

  for (const entry of entries) {
    if (claimed.has(entry.id)) continue;
    slots.push({ date, startsAt: entry.startMinute, sessionId: null, entryId: entry.id });
  }

  return slots.sort((a, b) => {
    if (a.startsAt === b.startsAt) return 0;
    if (a.startsAt === null) return 1;
    if (b.startsAt === null) return -1;
    return a.startsAt - b.startsAt;
  });
}

/**
 * The slot a link asked for, or the day's first.
 *
 * The fallback is the point: a lesson moved to another hour leaves older
 * links naming a time nothing sits at, and an empty screen is a worse answer
 * than the day's first lesson.
 */
export function resolveSlot(
  slots: readonly Slot[],
  wanted: { startsAt: number | null } | null,
): Slot | null {
  if (slots.length === 0) return null;
  if (wanted === null) return slots[0];
  return slots.find((slot) => slot.startsAt === wanted.startsAt) ?? slots[0];
}
