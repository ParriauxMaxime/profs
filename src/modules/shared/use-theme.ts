import {
  type ResolvedTheme,
  readThemeChoice,
  resolveTheme,
  THEME_CHROME_COLORS,
  type ThemeChoice,
  writeThemeChoice,
} from "@domain/theme";
import { useCallback, useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Tell the browser chrome which theme won — the status bar of an installed
 * app, and the address bar of a tab.
 *
 * It REPLACES every `theme-color` tag rather than adding one, and that is the
 * whole fix. A user agent uses the FIRST such tag in tree order whose `media`
 * matches, so the pair `index.html` declares for the pre-script paint beats
 * anything appended after them: a teacher on `ardoise` with a light phone got
 * a white status bar over a dark app, because `(prefers-color-scheme: light)`
 * matched and came first. Appending a third tag with no media query does not
 * win; removing the other two is what wins.
 *
 * The theme is the teacher's CHOICE and the device preference is only its
 * fallback, so once the choice is resolved no media-conditional tag can be
 * right — there is exactly one correct colour and it is this one.
 */
function applyChromeColor(theme: ResolvedTheme): void {
  for (const existing of document.querySelectorAll('meta[name="theme-color"]')) {
    existing.remove();
  }
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = THEME_CHROME_COLORS[theme];
  document.head.appendChild(meta);
}

/**
 * Reads the teacher's theme choice, applies it, and keeps it applied.
 *
 * The attribute is written to the document element rather than passed down as
 * context: the themes are token sets, so nothing below needs to know which is
 * active. When the choice is `system` the device preference is watched live,
 * so a phone switching to dark at sunset takes effect without a reload.
 *
 * It also repaints the browser chrome, which it did not before: switching
 * theme in Réglages restyled the page and left the status bar the colour it
 * was until the next reload.
 */
export function useTheme(): { choice: ThemeChoice; setChoice: (next: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readThemeChoice());

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = (): void => {
      const resolved = resolveTheme(choice, media.matches);
      document.documentElement.setAttribute("data-theme", resolved);
      applyChromeColor(resolved);
    };
    apply();
    // Only `system` cares what the device does.
    if (choice !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    writeThemeChoice(next);
    setChoiceState(next);
  }, []);

  return { choice, setChoice };
}
