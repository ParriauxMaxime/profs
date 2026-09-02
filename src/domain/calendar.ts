import { startOfIsoWeek } from "./schedule";
import { startOfDay } from "./term";

/**
 * The calendar the journal is read through.
 *
 * Everything here works in local midnights. A day is an instant at 00:00 local
 * time, never a UTC one and never a raw offset from another day: adding
 * 86_400_000 to a timestamp is wrong twice a year, and the error is a whole
 * day rather than an hour once it crosses a boundary.
 *
 * `monthGrid` is the dangerous function of this phase, in the way `weekParity`
 * was of the last: a grid that is wrong by one day still looks exactly like a
 * calendar, and nobody checks a calendar against another calendar.
 */

export { startOfIsoWeek };

/** The next local midnight after `ms`'s day. Never `+ 86_400_000`. */
export function nextDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** The previous local midnight before `ms`'s day. */
export function previousDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** The seven local midnights of the ISO week containing `ms`, Monday first. */
export function weekDays(ms: number): number[] {
  const days: number[] = [];
  let day = startOfIsoWeek(ms);
  for (let i = 0; i < 7; i += 1) {
    days.push(day);
    day = nextDay(day);
  }
  return days;
}

export interface GridDay {
  /** Local midnight. */
  date: number;
  /** False for the days spilling in from the previous or next month. */
  inMonth: boolean;
}

/**
 * A month as six Monday-first weeks of seven days.
 *
 * Always 42 days, never a ragged five or six: a grid that changes height
 * between months makes the whole page jump when a teacher pages through the
 * year, and the empty trailing week costs one row.
 *
 * `month` is 0-indexed, as `Date` has it.
 */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = startOfDay(new Date(year, month, 1).getTime());
  const weeks: GridDay[][] = [];
  let day = startOfIsoWeek(first);

  for (let week = 0; week < 6; week += 1) {
    const row: GridDay[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(day);
      row.push({ date: day, inMonth: d.getFullYear() === year && d.getMonth() === month });
      day = nextDay(day);
    }
    weeks.push(row);
  }
  return weeks;
}

/** Every local midnight from `from` to `to`, both ends included. */
export function daysInRange(from: number, to: number): number[] {
  const days: number[] = [];
  const last = startOfDay(to);
  for (let day = startOfDay(from); day <= last; day = nextDay(day)) {
    days.push(day);
  }
  return days;
}

export interface AgendaDay<TLesson, TEntry> {
  date: number;
  lessons: TLesson[];
  entries: TEntry[];
}

/**
 * The days worth showing in an agenda: those carrying a lesson or an entry.
 *
 * Empty days are omitted rather than rendered blank. A school year is 365 days
 * of which perhaps 140 have a lesson, and scrolling past the weekends and the
 * holidays to find last Tuesday is the whole reason an agenda beats a month
 * grid on a phone.
 *
 * Generic over the lesson and entry types so this stays pure: it never learns
 * what a `ScheduleEntry`, a `Session` or a `DiaryEntry` is, only how to ask
 * which day each one falls on.
 */
export function agendaDays<TLesson, TEntry>(
  from: number,
  to: number,
  lessons: TLesson[],
  lessonDate: (lesson: TLesson) => number,
  entries: TEntry[],
  entryDate: (entry: TEntry) => number,
): AgendaDay<TLesson, TEntry>[] {
  const byDay = new Map<number, AgendaDay<TLesson, TEntry>>();
  const start = startOfDay(from);
  const end = startOfDay(to);

  const bucket = (date: number): AgendaDay<TLesson, TEntry> | null => {
    const day = startOfDay(date);
    if (day < start || day > end) return null;
    let found = byDay.get(day);
    if (!found) {
      found = { date: day, lessons: [], entries: [] };
      byDay.set(day, found);
    }
    return found;
  };

  for (const lesson of lessons) bucket(lessonDate(lesson))?.lessons.push(lesson);
  for (const entry of entries) bucket(entryDate(entry))?.entries.push(entry);

  return [...byDay.values()].sort((a, b) => a.date - b.date);
}
