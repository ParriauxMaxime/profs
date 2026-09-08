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
  classId: string;
  startsAt?: number;
}

interface EntryLike {
  id: string;
  classId: string;
  startMinute: number;
}

/**
 * Every slot on one day, earliest first.
 *
 * A séance pairs with a lesson of its OWN CLASS, and then by time. The class
 * is not redundant with the time: two classes at the same minute is legal
 * here — `overlaps` warns and never refuses — so pairing on time alone lets
 * one class's séance claim another's lesson, and Aujourd'hui, which reads
 * every class at once, would name the wrong class on the row and lose the
 * lesson that was actually started.
 *
 * Timed séances are paired first, so a séance that knows its hour cannot have
 * its lesson taken by one that only knows its class.
 *
 * An untimed séance sorts last: it has nothing to sort by.
 */
export function slotsForDay(
  sessions: readonly SessionLike[],
  entries: readonly EntryLike[],
  date: number,
): Slot[] {
  const claimed = new Set<string>();
  const pairedEntry = new Map<string, EntryLike>();

  for (const session of sessions) {
    if (session.startsAt === undefined) continue;
    const entry = entries.find(
      (e) =>
        e.classId === session.classId && e.startMinute === session.startsAt && !claimed.has(e.id),
    );
    if (!entry) continue;
    claimed.add(entry.id);
    pairedEntry.set(session.id, entry);
  }

  // A séance with no time at all is a séance recorded before séances carried
  // one, and it belongs to the lesson the timetable predicted — showing it as
  // a second, unscheduled row would render one lesson twice on the upgrade
  // day. It pairs only when it is its class's ONLY séance of the day: an
  // unscheduled séance is deliberately created BESIDE another one, and
  // absorbing that into a lesson the teacher has not started would leave the
  // strip with no unscheduled slot to open.
  for (const session of sessions) {
    if (session.startsAt !== undefined) continue;
    if (sessions.some((s) => s.id !== session.id && s.classId === session.classId)) continue;
    const entry = entries.find((e) => e.classId === session.classId && !claimed.has(e.id));
    if (!entry) continue;
    claimed.add(entry.id);
    pairedEntry.set(session.id, entry);
  }

  const slots: Slot[] = sessions.map((session) => {
    const entry = pairedEntry.get(session.id);
    return {
      date,
      startsAt: session.startsAt ?? entry?.startMinute ?? null,
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
