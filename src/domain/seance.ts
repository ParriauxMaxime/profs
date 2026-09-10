import { nextDay, previousDay } from "./calendar";
import { entriesForDay, type ScheduleEntryLike } from "./schedule";

/**
 * The ordinary French lesson, in minutes.
 *
 * It is the default END of a séance that has no lesson to take one from —
 * never a stored duration, and never a render-time guess. A séance's end is
 * a fact about that lesson, so it is written down.
 */
export const DEFAULT_SEANCE_MINUTES = 55;

/**
 * The local hour of a timestamp, as minutes from midnight.
 *
 * `getHours` rather than any arithmetic on the epoch value: the offset from
 * UTC is not constant, so dividing a timestamp would land an hour out for
 * half the year.
 */
export function hourOfDay(ms: number): number {
  return new Date(ms).getHours() * 60;
}

/**
 * ONE séance's times, repaired from whatever an older row does carry.
 *
 * `createdAt` is the right source for a missing start because of how a séance
 * comes into being: all four things that create one — an attendance mark, a
 * behaviour event, note text, "Commencer une séance" — are acts performed
 * during the lesson, so the hour a séance was created in is the hour it was
 * taught in. Where it guesses wrong, the séance strip's editor corrects it.
 *
 * This is the per-row half of the repair, and nothing outside this file calls
 * it. It cannot see siblings, so it cannot know whether the hour it invents
 * collides with another séance of the same class on the same day — that is
 * `repairSeanceCollisions`, below, which wraps it and is what the one real
 * caller uses: the schema's `db.version(17)` upgrade.
 *
 * It used to be two callers. `backup.ts` ran the same repair on import, for a
 * format-11 file whose séances carried no times; with one backup format
 * accepted and every format-13 séance already timed, that call was inert and
 * is gone.
 */
export function backfillSeanceTimes(row: {
  startsAt?: number;
  endsAt?: number;
  createdAt: number;
}): { startsAt: number; endsAt: number } {
  const startsAt = row.startsAt ?? hourOfDay(row.createdAt);
  return { startsAt, endsAt: row.endsAt ?? startsAt + DEFAULT_SEANCE_MINUTES };
}

/** What `repairSeanceCollisions` needs from a séance row. */
interface SeanceTimeRow {
  id: string;
  classId: string;
  date: number;
  createdAt: number;
  startsAt?: number;
  endsAt?: number;
}

/**
 * A whole collection's séance times, repaired so that no two séances of one
 * class on one day ever share a `startsAt`.
 *
 * Pure, and in the domain, because it has two callers in two layers — the
 * `db.version(16)` upgrade and `parseBackup` — and a repair rule kept in two
 * places is a repair rule that eventually disagrees with itself. This is the
 * argument that made `entriesForDay` one function.
 *
 * `backfillSeanceTimes` alone cannot prevent the collision this exists to
 * fix: it repairs one row at a time, so two untimed séances of the same
 * class created in the same hour both floor to the identical `startsAt`.
 * `slotsForDay` then builds two slots with one time, and `resolveSlot` —
 * which matches by `startsAt` alone — always returns the first. The second
 * séance becomes unreachable from the strip, the register and the note,
 * present only in the export, though its attendance and behaviour rows are
 * never lost.
 *
 * The rules:
 * - Grouped by `(classId, date)`: rows in different classes, or on different
 *   days, never collide with one another.
 * - A row that already carries a stored `startsAt` keeps it EXACTLY. A
 *   repair moves only a time it invented, never one already recorded.
 * - Among the rows with no stored start, the earliest CREATED keeps the exact
 *   hour `backfillSeanceTimes` would give it alone; any later one that would
 *   collide — with a stored start or with another derived one — is nudged
 *   forward a minute at a time until it lands on a free one. A minute is
 *   deliberately preferred over the next hour: it stays close to the truth,
 *   it is visible in the strip, and the teacher can correct it there.
 * - `endsAt` follows the same rule one level down: a stored one survives
 *   untouched, a derived one is recomputed from whatever `startsAt` its row
 *   ends up with.
 */
export function repairSeanceCollisions(
  rows: readonly SeanceTimeRow[],
): { id: string; startsAt: number; endsAt: number }[] {
  const groups = new Map<string, SeanceTimeRow[]>();
  for (const row of rows) {
    const key = `${row.classId}/${row.date}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const repaired = new Map<string, { startsAt: number; endsAt: number }>();

  for (const group of groups.values()) {
    const taken = new Set<number>();

    // Stored starts are fixed points: reserved before anything derived is
    // placed, and never themselves moved.
    for (const row of group) {
      if (row.startsAt === undefined) continue;
      const times = backfillSeanceTimes(row);
      repaired.set(row.id, times);
      taken.add(times.startsAt);
    }

    // Derived rows, earliest created first, so the earliest-created keeps
    // its exact hour and a later collision is the one that moves.
    const derived = [...group]
      .filter((row) => row.startsAt === undefined)
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const row of derived) {
      let startsAt = hourOfDay(row.createdAt);
      while (taken.has(startsAt)) startsAt += 1;
      taken.add(startsAt);
      repaired.set(row.id, { startsAt, endsAt: row.endsAt ?? startsAt + DEFAULT_SEANCE_MINUTES });
    }
  }

  return rows.map((row) => {
    const times = repaired.get(row.id);
    /* istanbul ignore next -- every row belongs to exactly one group above */
    if (!times) throw new Error("repairSeanceCollisions: row not repaired");
    return { id: row.id, ...times };
  });
}

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
  /** Minutes from midnight. Every slot has one — see `Session.startsAt`. */
  startsAt: number;
  /** Minutes from midnight. What gives a block its height on the week grid. */
  endsAt: number;
  /** The séance, once something has been recorded against it. */
  sessionId: string | null;
  /** The timetable entry that predicted it, if any. */
  entryId: string | null;
}

interface SessionLike {
  id: string;
  classId: string;
  startsAt: number;
  endsAt: number;
}

interface EntryLike {
  id: string;
  classId: string;
  startMinute: number;
  endMinute: number;
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
 */
export function slotsForDay(
  sessions: readonly SessionLike[],
  entries: readonly EntryLike[],
  date: number,
): Slot[] {
  const claimed = new Set<string>();
  const pairedEntry = new Map<string, EntryLike>();

  for (const session of sessions) {
    const entry = entries.find(
      (e) =>
        e.classId === session.classId && e.startMinute === session.startsAt && !claimed.has(e.id),
    );
    if (!entry) continue;
    claimed.add(entry.id);
    pairedEntry.set(session.id, entry);
  }

  const slots: Slot[] = sessions.map((session) => {
    const entry = pairedEntry.get(session.id);
    return {
      date,
      // The séance's own times win over the entry's: the entry says what was
      // intended, the séance says what happened, and a lesson that ran long
      // must draw as long as it ran.
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sessionId: session.id,
      entryId: entry?.id ?? null,
    };
  });

  for (const entry of entries) {
    if (claimed.has(entry.id)) continue;
    slots.push({
      date,
      startsAt: entry.startMinute,
      endsAt: entry.endMinute,
      sessionId: null,
      entryId: entry.id,
    });
  }

  return slots.sort((a, b) => a.startsAt - b.startsAt);
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
  wanted: { startsAt: number } | null,
): Slot | null {
  if (slots.length === 0) return null;
  if (wanted === null) return slots[0];
  return slots.find((slot) => slot.startsAt === wanted.startsAt) ?? slots[0];
}

/**
 * The days the day menu offers: those holding a lesson, taught or predicted.
 *
 * The window is asymmetric on purpose — further back than forward — because
 * the past is where marking happens, while ahead only needs to reach the other
 * side of an A/B alternation to prepare next week.
 *
 * The walk steps the CALENDAR with `nextDay` / `previousDay` rather than adding
 * `86_400_000`, for the reason `weekParity` and `monthGrid` do: millisecond
 * arithmetic slides an hour at each DST change and eventually a whole day, and
 * a day menu wrong by one is indistinguishable from a correct one.
 *
 * It does NOT guarantee the day currently on screen is in the list — a day may
 * carry neither a séance nor a lesson and still be the one the URL names. The
 * caller unions it in, so the `<select>` never shows a value absent from its
 * own options.
 */
export function teachingDays(
  entries: ScheduleEntryLike[],
  history: readonly { date: number }[],
  termStart: number | null,
  today: number,
  window: { backDays: number; aheadDays: number },
): number[] {
  const days = new Set<number>();

  let cursor = today;
  for (let i = 0; i <= window.aheadDays; i += 1) {
    if (entriesForDay(entries, termStart, cursor).length > 0) {
      days.add(cursor);
    }
    cursor = nextDay(cursor);
  }
  const last = previousDay(cursor);

  cursor = today;
  for (let i = 0; i < window.backDays; i += 1) {
    cursor = previousDay(cursor);
    if (entriesForDay(entries, termStart, cursor).length > 0) {
      days.add(cursor);
    }
  }
  const first = cursor;

  // Séances are bounded by the same window, so a term of history does not
  // become a menu nobody can scan.
  for (const session of history) {
    if (session.date >= first && session.date <= last) days.add(session.date);
  }

  return [...days].sort((a, b) => a - b);
}
