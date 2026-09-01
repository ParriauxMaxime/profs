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
 * The same number written with the active language's separator but with every
 * decimal it actually holds — 13.456 stays 13,456 in French.
 *
 * This is what seeds an inline editor: `formatDecimal` rounds to two decimals,
 * so opening a cell holding an imported 13.456 and committing it unchanged
 * would silently rewrite the stored value as 13.46. Display keeps the rounding;
 * editing must not. Built from `String(value)` — JavaScript's shortest
 * round-trip form, so no trailing zeros and no rounding — with only the
 * separator swapped. Intended for grade-scale numbers; a magnitude that
 * `String` renders in exponent form is passed through as-is.
 */
export function formatDecimalExact(value: number, locale: string): string {
  return String(value).replace(".", decimalSeparator(locale));
}

/** The character this locale puts between the integer and fraction parts. */
function decimalSeparator(locale: string): string {
  const locales = locale ? [locale, FALLBACK_LOCALE] : [FALLBACK_LOCALE];
  const parts = new Intl.NumberFormat(locales, { useGrouping: false }).formatToParts(1.1);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
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
