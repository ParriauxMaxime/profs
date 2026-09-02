/**
 * The recurring weekly timetable.
 *
 * A schedule entry is a PREDICTION — "3°B Maths, Monday 10h, week A". It is
 * never a record that a lesson happened; that is a Session, created lazily
 * when a teacher actually starts recording. Keeping the two apart is what
 * stops every holiday and cancellation leaving an empty lesson in a pupil's
 * timeline.
 *
 * Week parity is DERIVED from a term-start date rather than stored, so there
 * is no calendar of weeks to drift out of date. `weekParity` is the most
 * dangerous function here: wrong by one, it shows the wrong lessons for a
 * whole week, and plausibly enough that nobody suspects the app.
 */

export const WEEK_CYCLES = ["all", "A", "B"] as const;

export type WeekCycle = (typeof WEEK_CYCLES)[number];

/** Which alternating week a date falls in. */
export type WeekParity = "A" | "B";

export interface ScheduleEntryLike {
  /** ISO weekday, 1 = Monday through 7 = Sunday. */
  weekday: number;
  /** Minutes from midnight. Times are arithmetic, so they are stored as such. */
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
}

const MS_PER_DAY = 86_400_000;

/** Local midnight of the Monday on or before `ms`. */
function startOfIsoWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  // getDay() is 0 for Sunday; ISO wants Monday first.
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (isoDay - 1));
  return d.getTime();
}

/**
 * Which alternating week a date falls in, counting from the term's first week.
 *
 * Counted in whole ISO weeks, not in days: the term may start mid-week, and
 * the Monday before it still belongs to week one. Both ends are normalised to
 * local midnight before subtracting, so a daylight-saving change — which makes
 * one week 23 or 25 hours long — cannot shift the count.
 */
export function weekParity(termStart: number, date: number): WeekParity {
  const weeks = Math.floor((startOfIsoWeek(date) - startOfIsoWeek(termStart)) / (7 * MS_PER_DAY));
  return weeks % 2 === 0 ? "A" : "B";
}

/** ISO weekday of a timestamp, 1 = Monday. */
export function isoWeekday(ms: number): number {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
}

/**
 * The entries running on a date, earliest first.
 *
 * A date before the term start returns nothing. Its parity would be negative
 * and arbitrary, and showing week A's lessons in August is worse than showing
 * none — an empty day is obviously empty; a wrong day is not.
 */
export function entriesForDate<T extends ScheduleEntryLike>(
  entries: T[],
  termStart: number,
  date: number,
): T[] {
  if (startOfIsoWeek(date) < startOfIsoWeek(termStart)) return [];

  const parity = weekParity(termStart, date);
  const weekday = isoWeekday(date);

  return entries
    .filter((e) => e.weekday === weekday)
    .filter((e) => e.weekCycle === "all" || e.weekCycle === parity)
    .sort((a, b) => a.startMinute - b.startMinute);
}

export function minutesToHm(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function hmToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

/** A time range for display. The caller passes the app locale, never the browser's. */
export function formatTimeRange(startMinute: number, endMinute: number, locale: string): string {
  const fmt = (m: number): string => {
    const { hours, minutes } = minutesToHm(m);
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(2000, 0, 1, hours, minutes));
  };
  return `${fmt(startMinute)} – ${fmt(endMinute)}`;
}

/**
 * Whether two entries collide.
 *
 * Surfaced as a warning, never a refusal: a teacher may legitimately record
 * two things at once, and this app does not know their week better than they
 * do. Touching edges — one ending exactly as the next begins — is the normal
 * shape of a timetable and is not a clash.
 */
export function overlaps(a: ScheduleEntryLike, b: ScheduleEntryLike): boolean {
  if (a.weekday !== b.weekday) return false;
  const cyclesMeet = a.weekCycle === "all" || b.weekCycle === "all" || a.weekCycle === b.weekCycle;
  if (!cyclesMeet) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}
