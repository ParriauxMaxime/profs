import { canPlace, compareReadingOrder, type RoomShape } from "@domain/room";
import type { RoomDraft } from "@domain/room-draft";
import type { AppDatabase, Desk, Room } from ".";

/**
 * Salles, and the furniture in them.
 *
 * A salle belongs to the établissement and to no class. Everything here writes
 * furniture only — who sits where lives in `./plans`, because it is a property
 * of a class in this salle rather than of the salle itself.
 */

/** Every salle, alphabetically — this is a list a teacher picks from. */
export async function listRooms(db: AppDatabase): Promise<Room[]> {
  const rooms = await db.rooms.toArray();
  return rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The desks of a salle, front to back then left to right. */
export async function desksForRoom(db: AppDatabase, roomId: string): Promise<Desk[]> {
  const desks = await db.desks.where("roomId").equals(roomId).toArray();
  return desks.sort(compareReadingOrder);
}

/** Create a salle and stamp a shape into it. */
export async function createRoom(db: AppDatabase, name: string, shape: RoomShape): Promise<Room> {
  const now = Date.now();
  const room: Room = {
    id: crypto.randomUUID(),
    name,
    width: shape.width,
    height: shape.height,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction("rw", [db.rooms, db.desks], async () => {
    await db.rooms.add(room);
    await db.desks.bulkAdd(
      shape.positions.map((position) => ({
        id: crypto.randomUUID(),
        roomId: room.id,
        x: position.x,
        y: position.y,
      })),
    );
  });
  return room;
}

/**
 * Write a draft back: the salle's name, its floor, and every table on it.
 *
 * A DIFF, never a replacement, and that is the whole reason this function
 * exists rather than a delete-and-recreate. `Assignment` is keyed
 * `[planId+deskId]`, so a desk that survives the edit must survive it with the
 * SAME id — otherwise rearranging 204 would silently empty the seating plan of
 * every class taught in it. Only a desk the teacher actually removed loses its
 * occupants, and it loses them here rather than leaving an assignment pointing
 * at furniture that no longer exists.
 *
 * The draft is revalidated against the floor before anything is written. The
 * editor already refuses an illegal placement gesture by gesture, but the rule
 * has to hold at the write too: `&[roomId+x+y]` only catches two desks on the
 * exact same square, and two desks one half-tile apart overlap without sharing
 * a point. A draft that fails is refused WHOLE — a half-written room is worse
 * than a rejected one.
 */
export async function saveRoomDraft(
  db: AppDatabase,
  roomId: string,
  draft: RoomDraft,
): Promise<boolean> {
  const name = draft.name.trim();
  if (name === "") return false;
  if (!isPlaceable(draft)) return false;

  return db.transaction("rw", [db.rooms, db.desks, db.assignments], async () => {
    const room = await db.rooms.get(roomId);
    if (!room) return false;

    const saved = await db.desks.where("roomId").equals(roomId).toArray();
    const wanted = new Map(draft.desks.map((desk) => [desk.id, desk]));

    // Every row that is not staying exactly where it is goes FIRST, and the
    // survivors come back afterwards. Updating them in place instead would
    // walk through states the database refuses: `&[roomId+x+y]` admits no two
    // desks on one square, so two tables swapping — a move the teacher makes
    // constantly — would abort the transaction on whichever went first.
    //
    // Deleting the desk ROW is not deleting the place: an `Assignment` is its
    // own row naming the desk id, and nothing here touches those except the
    // removal branch. A moved table keeps its id and therefore its occupant.
    const moved: Desk[] = [];
    for (const desk of saved) {
      const kept = wanted.get(desk.id);
      if (kept === undefined) {
        await db.assignments.where("deskId").equals(desk.id).delete();
        await db.desks.delete(desk.id);
      } else if (kept.x !== desk.x || kept.y !== desk.y) {
        await db.desks.delete(desk.id);
        moved.push({ id: desk.id, roomId, x: kept.x, y: kept.y });
      }
    }

    const existing = new Set(saved.map((desk) => desk.id));
    const added = draft.desks
      .filter((desk) => !existing.has(desk.id))
      .map((desk) => ({ id: desk.id, roomId, x: desk.x, y: desk.y }));
    await db.desks.bulkAdd([...moved, ...added]);

    await db.rooms.update(roomId, {
      name,
      width: draft.width,
      height: draft.height,
      updatedAt: Date.now(),
    });
    return true;
  });
}

/** Does every table in the draft sit inside the floor, clear of its neighbours? */
function isPlaceable(draft: RoomDraft): boolean {
  return draft.desks.every((desk, i) =>
    canPlace(
      draft.desks.filter((_, other) => other !== i),
      desk,
      draft,
    ),
  );
}
