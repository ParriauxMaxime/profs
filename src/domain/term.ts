/**
 * The term start date, which anchors A/B week parity and nothing else.
 *
 * It lives in localStorage rather than in a table for the same reason the
 * theme does: it describes this device's workspace, it is a single value with
 * no relations, and it must be readable before the database opens so the first
 * paint of Today already knows which week it is.
 *
 * Stored as local midnight of the chosen day. A schedule is reasoned about in
 * whole days, and keeping a stray time-of-day on the anchor would make parity
 * depend on the hour a teacher happened to open Réglages.
 */

export const TERM_START_STORAGE_KEY = "profs-term-start";

/** Local midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** `YYYY-MM-DD` for a date input, in local time — never `toISOString`, which is UTC. */
export function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parse a date input's `YYYY-MM-DD` as a LOCAL day.
 *
 * `new Date("2026-09-01")` is parsed as UTC midnight, which is the previous
 * day west of Greenwich — enough to move the anchor into the week before and
 * invert every A and B for the year.
 */
export function fromDateInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d.getTime());
}

/** The stored term start, or null when the teacher has not set one. */
export function readTermStart(): number | null {
  try {
    const raw = localStorage.getItem(TERM_START_STORAGE_KEY);
    if (raw === null) return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms)) return null;
    return startOfDay(ms);
  } catch {
    // A browser with site data blocked still has to render.
    return null;
  }
}

/** Passing null clears the anchor, which is how a teacher turns A/B weeks off. */
export function writeTermStart(ms: number | null): void {
  try {
    if (ms === null) {
      localStorage.removeItem(TERM_START_STORAGE_KEY);
      return;
    }
    localStorage.setItem(TERM_START_STORAGE_KEY, String(startOfDay(ms)));
  } catch {
    // Losing the preference is survivable; failing to render is not.
  }
}
