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
