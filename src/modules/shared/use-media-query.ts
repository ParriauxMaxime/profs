import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * `useSyncExternalStore` rather than `useState` plus an effect, the same shape
 * `DbProvider` uses for the active workspace: the first render already reads
 * the real value, so a layout that branches on width does not paint the wrong
 * branch and then correct itself.
 *
 * This exists because one branch must render at a time. The CSS alternative —
 * rendering both and hiding one with `hidden lg:block` — mounts both, and for
 * a surface like the pupil card that means two sets of live queries, two notes
 * drafts racing each other's blur write, and a hidden `Modal` running its
 * focus-trap effects.
 *
 * The server snapshot is `false`. There is no server here, but React asks for
 * one, and `false` means the narrow layout — the safe default, since it is the
 * branch that works at any width.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
