/**
 * The one place that knows how a decimal number is written and read.
 *
 * French writes 13,4 and English 13.4. Both must round-trip: a teacher types
 * whichever separator their keyboard offers, and the app renders whichever the
 * active language calls for — never the browser's own locale, and never a
 * hardcoded comma.
 */

const FALLBACK_LOCALE = "fr";

/** At most two decimals, trailing zeros trimmed, never grouped. */
export function formatDecimal(value: number, locale: string): string {
  const locales = locale ? [locale, FALLBACK_LOCALE] : [FALLBACK_LOCALE];
  return new Intl.NumberFormat(locales, {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

/**
 * Read a number written with either separator. Returns null for blank input
 * and for anything that is not a single well-formed number — the caller
 * decides what to do with a refusal.
 */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
