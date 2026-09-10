/**
 * What the pupil page prints about one child.
 *
 * Pure: no React, no Dexie. Every function here refuses to answer rather than
 * answer wrongly, because each of these figures is one a teacher repeats at a
 * conseil de classe or to a parent.
 */

import { ATTENDANCE_VALUES, type AttendanceValue } from "./attendance";

export interface AttendanceSummary {
  counts: Record<AttendanceValue, number>;
  /** Séances where this pupil was marked at all. Never lessons held. */
  marked: number;
  /** Absences with no reason recorded — the only value the rate counts against. */
  unjustified: number;
  /** A fraction in [0, 1], or null when nothing was marked. Never a percentage. */
  rate: number | null;
}

/**
 * Assiduité, and deliberately not présence.
 *
 * The numerator is présent + en retard + excusé: a late pupil was in the room,
 * and an excused one was not but had a reason. That makes the figure meaningless
 * under the word *présence* — a pupil absent half the term with a note from home
 * would read near 100 % — so the interface names it assiduité and states the
 * definition beside it.
 *
 * The denominator is séances MARKED. A séance is created lazily, only when
 * somebody recorded something, so the app knows lessons recorded and never
 * lessons held. With nothing marked there is no rate at all: 0 % and 100 % are
 * both claims about lessons nobody registered.
 */
export function attendanceSummary(records: { value: AttendanceValue }[]): AttendanceSummary {
  const counts = Object.fromEntries(ATTENDANCE_VALUES.map((value) => [value, 0])) as Record<
    AttendanceValue,
    number
  >;
  for (const record of records) counts[record.value] += 1;

  const marked = records.length;
  const unjustified = counts.absent;

  return {
    counts,
    marked,
    unjustified,
    rate: marked === 0 ? null : (marked - unjustified) / marked,
  };
}

export interface Position {
  min: number;
  max: number;
  mean: number;
  /** Where the value sits between min and max, clamped to [0, 1]. */
  fraction: number;
  /** Where the mean sits on the same scale. */
  meanFraction: number;
}

/**
 * Where one average sits in the class's spread.
 *
 * Null under two values, and null when the spread has no width: a point drawn
 * as a scale says something false about a class, and a bar with min === max
 * has nowhere to put the dot.
 *
 * The value is clamped rather than allowed off the ends, so a caller passing an
 * average that is not itself in `values` still draws inside the bar.
 */
export function positionOnScale(value: number, values: number[]): Position | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return null;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const place = (n: number): number => Math.min(1, Math.max(0, (n - min) / (max - min)));

  return { min, max, mean, fraction: place(value), meanFraction: place(mean) };
}

/**
 * Which period tab a carnet opens on: the last one, by `order`, holding a
 * column somebody has marked — "where the marking has got to", which in
 * December is the trimestre being discussed.
 *
 * It needs no dates, which is the point: a `Period` carries none, and inventing
 * one would change what a bulletin filters by. A carnet with no mark at all
 * falls back to its first period, which is where its grid starts.
 */
export function lastMarkedPeriod(
  periods: { id: string; order: number }[],
  columns: { id: string; periodId: string }[],
  gradedColumnIds: Iterable<string>,
): string | null {
  const ordered = [...periods].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return null;

  const periodOf = new Map(columns.map((column) => [column.id, column.periodId]));
  const marked = new Set<string>();
  for (const columnId of gradedColumnIds) {
    const periodId = periodOf.get(columnId);
    if (periodId !== undefined) marked.add(periodId);
  }

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (marked.has(ordered[i].id)) return ordered[i].id;
  }
  return ordered[0].id;
}

export interface SeanceMonth<T> {
  /** `"2026-11"` — the year and the zero-based month, for React keys and state. */
  key: string;
  year: number;
  /** Zero-based, as `Date.getMonth()` gives it. */
  month: number;
  sessions: T[];
}

/**
 * A class's séances, newest first, in calendar months.
 *
 * The month comes off a `Date`, never from arithmetic on the timestamp: this
 * codebase adds days by walking the calendar for `weekParity`'s reason, and a
 * month is a worse offender than a day.
 *
 * Two séances of one class on one day is legal here, and `date` alone cannot
 * order them. Sorting on the date and stopping left that tie to the input
 * order, which is `createdAt` — so a 14h lesson could list above the 10h one
 * on a page whose whole claim is that the séance is the row.
 */
export function groupSeancesByMonth<T extends { date: number; startsAt: number }>(
  sessions: T[],
): SeanceMonth<T>[] {
  const months = new Map<string, SeanceMonth<T>>();

  for (const session of [...sessions].sort((a, b) => b.date - a.date || b.startsAt - a.startsAt)) {
    const day = new Date(session.date);
    const year = day.getFullYear();
    const month = day.getMonth();
    const key = `${year}-${month}`;
    const existing = months.get(key);
    if (existing) {
      existing.sessions.push(session);
    } else {
      months.set(key, { key, year, month, sessions: [session] });
    }
  }

  return [...months.values()];
}

/**
 * The month expanded when the page opens: the current one, or the most recent
 * one holding a séance. A page whose only open section is empty reads as a bug.
 */
export function defaultOpenMonth(months: { key: string }[], now: number): string | null {
  if (months.length === 0) return null;
  const today = new Date(now);
  const currentKey = `${today.getFullYear()}-${today.getMonth()}`;
  return months.some((month) => month.key === currentKey) ? currentKey : months[0].key;
}
