import { useEffect } from "react";

/** Pulled out so it can be unit tested without a DOM: only the Escape key matters. */
export function isEscapeKey(event: Pick<KeyboardEvent, "key">): boolean {
  return event.key === "Escape";
}

/**
 * Calls `onEscape` when the Escape key is pressed anywhere on the page.
 *
 * Meant for forms that open inline (no dialog element to scope to): Escape
 * should cancel the form the same way its Cancel button does. This has no
 * blur-commit interaction to guard against — that concern is specific to
 * `EditableCell`, which implements its own Escape handling and is not
 * shared here.
 */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isEscapeKey(e)) onEscape();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape]);
}
