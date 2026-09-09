/**
 * The geometry of the weekly timetable, drawn as hours rather than as a list.
 *
 * This is `monthGrid`'s counterpart for the week, and it is here for the same
 * reason: a timetable wrong by one hour still looks exactly like a timetable,
 * and nobody checks a timetable against another timetable. A card list could
 * only be wrong in ways a teacher would notice — a lesson missing, a time
 * misprinted. A grid can put Tuesday's ten o'clock at eleven and read as
 * perfectly ordinary.
 *
 * Nothing here knows about React, about a `ScheduleEntry`, or about pixels.
 * `layoutDay` reports which of a cluster's columns a lesson occupies and how
 * many that cluster has; turning that into a width is the component's job.
 */

/** A lesson as the grid sees one: two times, minutes from midnight. */
export interface TimetableSpan {
  startMinute: number;
  endMinute: number;
}

export interface PlacedSpan<T> {
  entry: T;
  /** Which column of its cluster this lesson takes, from 0. */
  column: number;
  /** How many columns the cluster has. Every member reports the same number. */
  columns: number;
}

/** The hours the grid draws by default: a French secondary day, with room either side. */
export const DEFAULT_WINDOW_START = 7 * 60;
export const DEFAULT_WINDOW_END = 19 * 60;

const HOUR = 60;

/**
 * The hour window wide enough to hold every lesson.
 *
 * 7h–19h by default, widened out to whole hours around anything outside it.
 * Widening rather than clamping is the whole point: a lesson at 6h30 clamped
 * to the top edge does not disappear, which would at least be noticed — it
 * draws in the wrong hour, plausibly, and stays wrong until someone counts.
 *
 * The edges themselves do not widen. A lesson ending at exactly 19h is inside
 * the default window, and rounding it up would hang an empty hour under the
 * grid every time a teacher finishes at seven.
 */
export function gridWindow(spans: TimetableSpan[]): { start: number; end: number } {
  let start = DEFAULT_WINDOW_START;
  let end = DEFAULT_WINDOW_END;
  for (const span of spans) {
    if (span.startMinute < start) start = Math.floor(span.startMinute / HOUR) * HOUR;
    if (span.endMinute > end) end = Math.ceil(span.endMinute / HOUR) * HOUR;
  }
  return { start, end };
}

/**
 * One day's lessons, placed side by side where they collide.
 *
 * Overlapping lessons are legal here — `overlaps` in `schedule.ts` warns and
 * never refuses — and semaine A against semaine B is the common case rather
 * than the exception, since a teacher on an alternating cycle has two lessons
 * at one hour by design. So the grid splits the column instead of hiding one.
 *
 * Lessons are grouped into clusters of transitively-overlapping neighbours,
 * and every member of a cluster reports the cluster's full width. A lesson
 * that only meets one end of a chain could be drawn wider, but a block whose
 * width changed halfway down a cluster would line up with nothing above or
 * below it.
 *
 * Columns are reused as they free up, so 8–9, 8–10 and 9–10 is two columns
 * rather than three. Touching edges — 08:55 into 09:00, the normal shape of a
 * timetable — are not an overlap, which is the same strict comparison
 * `overlaps` makes; without it every block in the app would be half width.
 */
export function layoutDay<T extends TimetableSpan>(spans: T[]): PlacedSpan<T>[] {
  const sorted = [...spans].sort(
    (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );

  const placed: PlacedSpan<T>[] = [];
  // The cluster being built, and when each of its columns falls free.
  let cluster: PlacedSpan<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  // A cluster's width is only known once nothing more can join it.
  const closeCluster = (): void => {
    for (const member of cluster) member.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const entry of sorted) {
    if (entry.startMinute >= clusterEnd) closeCluster();

    let column = columnEnds.findIndex((freeAt) => freeAt <= entry.startMinute);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(entry.endMinute);
    } else {
      columnEnds[column] = entry.endMinute;
    }

    const member: PlacedSpan<T> = { entry, column, columns: 1 };
    cluster.push(member);
    placed.push(member);
    clusterEnd = Math.max(clusterEnd, entry.endMinute);
  }
  closeCluster();

  return placed;
}
