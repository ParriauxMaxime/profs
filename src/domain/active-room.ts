/**
 * Which salle a class is currently being looked at in.
 *
 * A class taught in two rooms has a plan in each, and the one on screen has to
 * survive leaving the tab and coming back. It lives in `localStorage` rather
 * than in a table for the same reason the term anchor and the theme do: it
 * describes this device's view, has no relations, and losing it costs a
 * teacher one tap.
 *
 * Deliberately NOT a field on `SchoolClass`. A selection is not a property of
 * the class — two devices looking at the same school would fight over it, and
 * a backup would carry one device's view onto another.
 *
 * The stored id is never trusted on read: a salle deleted on this device, or
 * absent from a workspace restored from a backup, must fall back rather than
 * leave the room blank. `resolveActiveRoom` is the only way callers should
 * turn a stored id into one to render.
 */

const KEY = "profs-active-room";

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

/** The salle last selected for this class, if any was. */
export function readActiveRoom(classId: string): string | null {
  return read()[classId] ?? null;
}

export function writeActiveRoom(classId: string, roomId: string): void {
  write({ ...read(), [classId]: roomId });
}

/** Forget a class's selection — called when the selected salle is deleted. */
export function clearActiveRoom(classId: string): void {
  const selections = read();
  if (!(classId in selections)) return;
  delete selections[classId];
  write(selections);
}

/**
 * The salle to render, given what is stored and what actually exists.
 *
 * Anchored to the salle's identity, never to its position in the list: a
 * stored index would retarget onto whichever room slid into that slot when one
 * was deleted, which is the bug this codebase has produced in several
 * disguises. A stored id matching nothing falls back to the first salle, and
 * an empty list resolves to null so the caller can offer to create one.
 */
export function resolveActiveRoom(
  rooms: readonly { id: string }[],
  storedId: string | null,
): string | null {
  if (rooms.length === 0) return null;
  if (storedId !== null && rooms.some((room) => room.id === storedId)) return storedId;
  return rooms[0].id;
}
