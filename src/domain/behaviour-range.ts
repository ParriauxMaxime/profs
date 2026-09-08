import { startOfDay } from "./term";

/**
 * The window a pupil's behaviour counts are read over.
 *
 * The backlog asked for counts "by period", and that is deliberately NOT what
 * this is. A `Period` carries no dates — it is `{ id, gradebookId, name,
 * order }` — and it belongs to a gradebook, so a class with three gradebooks
 * has three period calendars that need not agree, while a `Session` is simply
 * dated. There is no mapping from one to the other that is not invented.
 *
 * Giving `Period` dates was the alternative, and it was rejected: periods are
 * what `studentAverage` filters a bulletin by, and making them mean a span of
 * time as well as a set of columns would change marking everywhere to put a
 * date filter on one count. The blast radius is not worth it.
 *
 * So the counts filter by DATE, over ranges that need no boundary anyone had
 * to invent: everything, the last 30 days, or since the term anchor the app
 * already keeps for A/B week parity. "Ce trimestre" is not offered, because
 * nothing in the app knows when a trimestre ends and a guess printed beside a
 * count of red cards is worse than an honest "since the start of term".
 */

export const BEHAVIOUR_RANGES = ["all", "days30", "term"] as const;
export type BehaviourRange = (typeof BEHAVIOUR_RANGES)[number];

export const DEFAULT_BEHAVIOUR_RANGE: BehaviourRange = "all";

/** How many days back `days30` reaches. Named so the copy and the maths agree. */
export const RECENT_DAYS = 30;

/**
 * The inclusive lower bound of a range, or `null` for "everything".
 *
 * Walks the calendar rather than subtracting milliseconds. `now - 30 *
 * 86_400_000` is an hour out at each DST change and, at the wrong moment,
 * lands on the day before the one a teacher counted — the same trap
 * `nextDay` and `monthGrid` exist to avoid.
 *
 * `term` with no anchor set falls back to "everything" rather than to today:
 * showing zero events because nobody has entered a term-start date would read
 * as a pupil with a clean record.
 */
export function rangeStart(
  range: BehaviourRange,
  termStart: number | null,
  now: number,
): number | null {
  switch (range) {
    case "all":
      return null;
    case "days30": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - RECENT_DAYS);
      return d.getTime();
    }
    case "term":
      return termStart === null ? null : startOfDay(termStart);
  }
}

/**
 * The events falling inside a range.
 *
 * Takes the bound rather than the range so the caller computes "now" once. A
 * component that called `Date.now()` per event could straddle midnight in a
 * long list and drop one.
 */
export function withinRange<T extends { createdAt: number }>(
  events: readonly T[],
  start: number | null,
): T[] {
  if (start === null) return [...events];
  return events.filter((event) => event.createdAt >= start);
}
