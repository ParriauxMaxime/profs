/**
 * Which of a class's rooms the teacher was last looking at.
 *
 * A class may now hold several layouts — the ordinary arrangement, one for
 * assessments, one for group work — and the one on screen has to survive
 * leaving the tab and coming back. It lives in `localStorage` rather than in a
 * table for the same reason the term anchor and the theme do: it describes
 * this device's view, has no relations, and losing it costs a teacher one tap.
 *
 * Deliberately NOT a field on `SchoolClass`. A selection is not a property of
 * the class — two devices looking at the same school would fight over it, and
 * a backup would carry one device's view onto another.
 *
 * The stored id is never trusted on read: a layout deleted on this device, or
 * absent from a workspace restored from a backup, must fall back rather than
 * leave the room blank. `resolveActiveLayout` is the only way callers should
 * turn a stored id into one to render.
 */

const KEY = "profs-active-layout";

type Selections = Record<string, string>;

function read(): Selections {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Selections) : {};
  } catch {
    return {};
  }
}

function write(selections: Selections): void {
  localStorage.setItem(KEY, JSON.stringify(selections));
}

/** The layout id last selected for this class, if any was. */
export function readActiveLayout(classId: string): string | null {
  return read()[classId] ?? null;
}

export function writeActiveLayout(classId: string, layoutId: string): void {
  write({ ...read(), [classId]: layoutId });
}

/** Forget a class's selection — called when the selected layout is deleted. */
export function clearActiveLayout(classId: string): void {
  const selections = read();
  if (!(classId in selections)) return;
  delete selections[classId];
  write(selections);
}

/**
 * The layout to render, given what is stored and what actually exists.
 *
 * Anchored to the layout's identity, never to its position in the list: a
 * stored index would retarget onto whichever room slid into that slot when one
 * was deleted, which is the bug this codebase has produced in three other
 * disguises. A stored id that matches nothing falls back to the first layout,
 * and an empty list resolves to null so the caller can create one.
 */
export function resolveActiveLayout(
  layouts: readonly { id: string }[],
  storedId: string | null,
): string | null {
  if (layouts.length === 0) return null;
  if (storedId !== null && layouts.some((layout) => layout.id === storedId)) return storedId;
  return layouts[0].id;
}
