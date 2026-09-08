import type { RoomShape } from "@domain/room";
import type { AppDatabase, Room } from ".";

/**
 * Saved rooms — a named shape a teacher can stamp onto any class.
 *
 * A room holds tables and no pupils. Applying one goes through
 * `applyTemplate` in `./seating`, exactly as the four built-in templates do,
 * so the occupants question answers itself: `reseat` pours the seated pupils
 * into the new positions in reading order and hands back whoever no longer
 * fits, before the write.
 *
 * A saved room STAMPS AND CEASES TO EXIST, like a template. Nothing on a
 * `SeatingLayout` records where its shape came from, so editing a saved room
 * later cannot reach a class already stamped from it. A live link would have
 * to answer what happens to a table dragged out of the arrangement when the
 * saved room changes, and both answers are wrong half the time.
 */

/** Every saved room, alphabetically — this is a list a teacher picks from. */
export async function listRooms(db: AppDatabase): Promise<Room[]> {
  const rooms = await db.rooms.toArray();
  return rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/**
 * Save the shape currently in a layout under a name.
 *
 * Positions only. Who was sitting where is the class's business and would be
 * meaningless in another class, where those pupil ids do not exist.
 */
export async function saveRoom(db: AppDatabase, name: string, shape: RoomShape): Promise<Room> {
  const now = Date.now();
  const room: Room = {
    id: crypto.randomUUID(),
    name,
    width: shape.width,
    height: shape.height,
    positions: shape.positions.map((position) => ({ x: position.x, y: position.y })),
    createdAt: now,
    updatedAt: now,
  };
  await db.rooms.add(room);
  return room;
}

export async function renameRoom(db: AppDatabase, roomId: string, name: string): Promise<void> {
  await db.rooms.update(roomId, { name, updatedAt: Date.now() });
}

/**
 * Delete a saved room.
 *
 * Single-table and cascades nothing, for the same reason `deleteRubricTemplate`
 * does not: a room that has been stamped left a copy of its positions behind,
 * so nothing downstream still points at this row.
 */
export async function deleteRoom(db: AppDatabase, roomId: string): Promise<void> {
  await db.rooms.delete(roomId);
}

/** A saved room as a shape `applyTemplate` can stamp. */
export function roomShape(room: Room): RoomShape {
  return { width: room.width, height: room.height, positions: room.positions };
}
