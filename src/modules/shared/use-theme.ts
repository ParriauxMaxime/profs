import { readThemeChoice, resolveTheme, type ThemeChoice, writeThemeChoice } from "@domain/theme";
import { useCallback, useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Reads the teacher's theme choice, applies it, and keeps it applied.
 *
 * The attribute is written to the document element rather than passed down as
 * context: the themes are token sets, so nothing below needs to know which is
 * active. When the choice is `system` the device preference is watched live,
 * so a phone switching to dark at sunset takes effect without a reload.
 */
export function useTheme(): { choice: ThemeChoice; setChoice: (next: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => readThemeChoice());

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const apply = (): void => {
      document.documentElement.setAttribute("data-theme", resolveTheme(choice, media.matches));
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
