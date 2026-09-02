/**
 * The visual theme, chosen by the teacher and stored on the device.
 *
 * Two real themes, not a palette toggle. `copie` takes its identity from a
 * French copie double — paper, ink blue, and the red marge left for the
 * teacher's remarks. `ardoise` is dark, which is what a teacher wants when the
 * lights are down for a projector. `system` follows the device, because that
 * is what most people already set once and forget.
 *
 * The preference lives in localStorage rather than IndexedDB: it describes
 * this device, not the workspace, and it must be readable before the database
 * opens so the first paint is already correct.
 */

export const THEME_CHOICES = ["system", "copie", "ardoise"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** What actually gets applied once `system` is resolved. */
export type ResolvedTheme = "copie" | "ardoise";

export const DEFAULT_THEME: ThemeChoice = "system";

export const THEME_STORAGE_KEY = "profs-theme";

export function parseThemeChoice(raw: unknown): ThemeChoice | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return THEME_CHOICES.find((c) => c === text) ?? null;
}

/** `system` resolves against the device preference; the others are literal. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "copie") return "copie";
  if (choice === "ardoise") return "ardoise";
  return prefersDark ? "ardoise" : "copie";
}

export function readThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME;
  } catch {
    // A browser with site data blocked still has to render.
    return DEFAULT_THEME;
  }
}

export function writeThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Losing the preference is survivable; failing to apply it is not.
  }
}
