import { canPlace, clampRoomSize, type Placed, type Position } from "./room";

/**
 * A salle as the teacher is currently arranging it, before it is saved.
 *
 * The editor used to write every gesture straight through: each drag, nudge
 * and removal was its own transaction, and a teacher rearranging twenty-four
 * tables committed twenty-four times with no way back. Holding the whole room
 * here instead makes "Enregistrer" mean something and makes "Annuler" possible
 * at all.
 *
 * A draft desk is a `Placed` and nothing more — an id and a position. It
 * deliberately does NOT carry the `roomId` a stored desk has: every desk in a
 * draft belongs to the same salle, and a field that never varies is a field a
 * comparison can only get wrong.
 *
 * The id is the load-bearing part. A desk that MOVES keeps its id, so the
 * `Assignment` rows keyed `[planId+deskId]` still point at it and rearranging
 * 204 does not cost 3°B its seating. Only a desk actually removed loses its
 * occupants.
 */
export interface RoomDraft {
  name: string;
  width: number;
  height: number;
  desks: Placed[];
}

/** Seed a draft from the salle as saved. */
export function draftFrom(
  room: { name: string; width: number; height: number },
  desks: readonly Placed[],
): RoomDraft {
  return {
    name: room.name,
    width: room.width,
    height: room.height,
    // Rebuilt rather than referenced: a stored desk carries a `roomId` and
    // whatever else the row holds, and comparing those against a draft's own
    // desks would report a change nobody made.
    desks: desks.map((desk) => ({ id: desk.id, x: desk.x, y: desk.y })),
  };
}

/**
 * Is there anything to save?
 *
 * The Save button asks this rather than "has anything been touched": a table
 * picked up and put back leaves nothing to write, and offering to save it
 * invites a transaction that changes nothing.
 *
 * Desks are compared BY ID rather than as a set of coordinates. Two tables
 * swapping places keeps every id and every coordinate in the room — only the
 * pairing changes — so a positional comparison would call that unchanged and
 * the swap could never be saved.
 */
export function draftChanged(saved: RoomDraft, draft: RoomDraft): boolean {
  if (saved.name !== draft.name) return true;
  if (saved.width !== draft.width || saved.height !== draft.height) return true;
  if (saved.desks.length !== draft.desks.length) return true;
  const before = new Map(saved.desks.map((desk) => [desk.id, desk]));
  return draft.desks.some((desk) => {
    const was = before.get(desk.id);
    return was === undefined || was.x !== desk.x || was.y !== desk.y;
  });
}

/**
 * Put a new table down, or refuse.
 *
 * `null` is an ordinary outcome, not an error: the teacher dropped somewhere a
 * table does not fit, and the room simply does not change.
 */
export function addToDraft(draft: RoomDraft, at: Position, id: string): RoomDraft | null {
  if (!canPlace(draft.desks, at, draft)) return null;
  return { ...draft, desks: [...draft.desks, { id, x: at.x, y: at.y }] };
}

/** Move a table to an absolute position, or refuse. */
export function moveInDraft(draft: RoomDraft, deskId: string, to: Position): RoomDraft | null {
  if (!draft.desks.some((desk) => desk.id === deskId)) return null;
  // A moving table excludes ITSELF from the collision set, or the square it
  // already occupies is the one place it could never move to.
  const others = draft.desks.filter((desk) => desk.id !== deskId);
  if (!canPlace(others, to, draft)) return null;
  return {
    ...draft,
    desks: draft.desks.map((desk) => (desk.id === deskId ? { ...desk, x: to.x, y: to.y } : desk)),
  };
}

/** Nudge a table by one unit, for the arrow keys. */
export function nudgeInDraft(draft: RoomDraft, deskId: string, by: Position): RoomDraft | null {
  const desk = draft.desks.find((candidate) => candidate.id === deskId);
  if (!desk) return null;
  return moveInDraft(draft, deskId, { x: desk.x + by.x, y: desk.y + by.y });
}

/** Take a table out of the salle. */
export function removeFromDraft(draft: RoomDraft, deskId: string): RoomDraft {
  return { ...draft, desks: draft.desks.filter((desk) => desk.id !== deskId) };
}

/**
 * Resize the floor, without moving a single table.
 *
 * `clampRoomSize` reads the draft's own desks, so shrinking can never leave
 * one outside the walls: a table beyond the edge fails `canPlace`, which means
 * every attempt to bring it back would be refused and the teacher would have
 * furniture they can see and cannot touch.
 */
export function resizeDraft(
  draft: RoomDraft,
  requested: { width: number; height: number },
): RoomDraft {
  return { ...draft, ...clampRoomSize(requested, draft.desks) };
}

export function renameDraft(draft: RoomDraft, name: string): RoomDraft {
  return { ...draft, name };
}
