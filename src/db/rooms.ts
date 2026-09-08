import {
  canPlace,
  clampRoomSize,
  compareReadingOrder,
  occupantsInReadingOrder,
  type Position,
  type RoomShape,
} from "@domain/room";
import type { AppDatabase, Desk, Room } from ".";
import { assignmentsForPlan, plansForRoom } from "./plans";

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

export async function renameRoom(db: AppDatabase, roomId: string, name: string): Promise<void> {
  await db.rooms.update(roomId, { name, updatedAt: Date.now() });
}

/**
 * Resize the salle's floor, without moving a single table.
 *
 * The clamp reads the room's OWN desks inside the transaction, so shrinking can
 * never leave one outside the walls: a desk beyond the edge fails `fitsRoom`,
 * which means `moveDesk` would refuse every attempt to bring it back and the
 * teacher would have furniture they could see and not touch.
 *
 * Growing is always legal up to `ROOM_MAX`. Returns the size actually written,
 * which is what the caller should render — a spinner that keeps showing a
 * refused number is lying about the room.
 */
export async function resizeRoom(
  db: AppDatabase,
  roomId: string,
  requested: { width: number; height: number },
): Promise<{ width: number; height: number } | null> {
  return db.transaction("rw", [db.rooms, db.desks], async () => {
    const room = await db.rooms.get(roomId);
    if (!room) return null;
    const desks = await db.desks.where("roomId").equals(roomId).toArray();
    const size = clampRoomSize(requested, desks);
    await db.rooms.update(roomId, { ...size, updatedAt: Date.now() });
    return size;
  });
}

/**
 * Put a desk down, or refuse.
 *
 * Returns whether it was placed. A refusal — too close to a neighbour, or off
 * the edge — is an ordinary outcome of a gesture, not an error: the teacher
 * dropped somewhere the furniture does not fit, and the room simply does not
 * change.
 *
 * The collision check reads the room's desks fresh INSIDE the transaction
 * rather than trusting a snapshot the caller captured, so two drops racing
 * cannot both pass a check made against the same stale set.
 */
export async function addDesk(db: AppDatabase, roomId: string, at: Position): Promise<boolean> {
  return db.transaction("rw", [db.rooms, db.desks], async () => {
    const room = await db.rooms.get(roomId);
    if (!room) return false;
    const taken = await db.desks.where("roomId").equals(roomId).toArray();
    if (!canPlace(taken, at, room)) return false;
    await db.desks.add({ id: crypto.randomUUID(), roomId, x: at.x, y: at.y });
    await db.rooms.update(roomId, { updatedAt: Date.now() });
    return true;
  });
}

/** Move a desk to an absolute position, or refuse. */
export async function moveDesk(db: AppDatabase, deskId: string, to: Position): Promise<boolean> {
  return db.transaction("rw", [db.rooms, db.desks], async () => {
    const desk = await db.desks.get(deskId);
    if (!desk) return false;
    const room = await db.rooms.get(desk.roomId);
    if (!room) return false;
    // A moving desk excludes ITSELF from the collision set, or the square it
    // already occupies is the one place it could never move to.
    const others = (await db.desks.where("roomId").equals(desk.roomId).toArray()).filter(
      (d) => d.id !== deskId,
    );
    if (!canPlace(others, to, room)) return false;
    await db.desks.update(deskId, { x: to.x, y: to.y });
    await db.rooms.update(room.id, { updatedAt: Date.now() });
    return true;
  });
}

/**
 * Nudge a desk by one unit, for the arrow keys.
 *
 * Reads the desk's position fresh inside its own transaction rather than
 * trusting a snapshot the caller captured: a key held down fires several
 * `keydown`s before any one write's live-query tick lands, and against a stale
 * snapshot every one of them would rewrite the same square instead of walking
 * the desk across the room.
 */
export async function nudgeDesk(db: AppDatabase, deskId: string, by: Position): Promise<boolean> {
  return db.transaction("rw", [db.rooms, db.desks], async () => {
    const desk = await db.desks.get(deskId);
    if (!desk) return false;
    const room = await db.rooms.get(desk.roomId);
    if (!room) return false;
    const to = { x: desk.x + by.x, y: desk.y + by.y };
    const others = (await db.desks.where("roomId").equals(desk.roomId).toArray()).filter(
      (d) => d.id !== deskId,
    );
    if (!canPlace(others, to, room)) return false;
    await db.desks.update(deskId, to);
    await db.rooms.update(room.id, { updatedAt: Date.now() });
    return true;
  });
}

/**
 * Take a desk out of the salle.
 *
 * Every assignment naming it goes too, across EVERY class taught here — the
 * place no longer exists, so no plan can seat anyone at it. Whoever sat there
 * simply returns to their class's rail, which is what "no assignment" means.
 */
export async function removeDesk(db: AppDatabase, deskId: string): Promise<void> {
  await db.transaction("rw", [db.rooms, db.desks, db.assignments], async () => {
    const desk = await db.desks.get(deskId);
    if (!desk) return;
    await db.assignments.where("deskId").equals(deskId).delete();
    await db.desks.delete(deskId);
    await db.rooms.update(desk.roomId, { updatedAt: Date.now() });
  });
}

/**
 * Whoever a stamp would leave without a place, per plan.
 *
 * Computed BEFORE the write so the confirm can name the count, exactly as the
 * old template form did — except a salle is shared, so a stamp reseats every
 * class taught in it and the answer is a count per plan rather than one
 * number.
 */
export async function stampOverflow(
  db: AppDatabase,
  roomId: string,
  shape: RoomShape,
): Promise<Record<string, string[]>> {
  const plans = await plansForRoom(db, roomId);
  const desks = await desksForRoom(db, roomId);
  const overflow: Record<string, string[]> = {};
  for (const plan of plans) {
    const seated = await seatedInReadingOrder(db, plan.id, desks);
    if (seated.length > shape.positions.length) {
      overflow[plan.id] = seated.slice(shape.positions.length);
    }
  }
  return overflow;
}

/** Who is seated in this plan, in the order a teacher reads the room. */
async function seatedInReadingOrder(
  db: AppDatabase,
  planId: string,
  desks: Desk[],
): Promise<string[]> {
  const assignments = await assignmentsForPlan(db, planId);
  const byDesk = new Map(assignments.map((a) => [a.deskId, a.studentId]));
  return occupantsInReadingOrder(
    desks.map((desk) => ({ ...desk, studentId: byDesk.get(desk.id) ?? null })),
  );
}

/**
 * Replace every desk in a salle with a new shape, keeping the arrangement.
 *
 * A stamp destroys the TABLES and deliberately spares the ARRANGEMENT: each
 * plan's seated pupils are poured into the new positions in reading order, so
 * a grid restamped as an arc keeps its front row in front. That is what makes
 * a destructive stamp survivable for a teacher who spent a term arranging 28
 * pupils — they lose the exact chairs, not the arrangement.
 *
 * Whoever no longer fits comes back as `overflow`, per plan, never silently
 * dropped. Callers warn with `stampOverflow` BEFORE calling this.
 */
export async function applyShape(
  db: AppDatabase,
  roomId: string,
  shape: RoomShape,
): Promise<{ overflow: Record<string, string[]> }> {
  return db.transaction("rw", [db.rooms, db.desks, db.seatingPlans, db.assignments], async () => {
    const plans = await plansForRoom(db, roomId);
    const oldDesks = await desksForRoom(db, roomId);
    // Read every plan's occupants BEFORE the desks go, or there is nothing
    // left to read them against.
    const occupants = new Map<string, string[]>();
    for (const plan of plans) {
      occupants.set(plan.id, await seatedInReadingOrder(db, plan.id, oldDesks));
    }

    for (const desk of oldDesks) {
      await db.assignments.where("deskId").equals(desk.id).delete();
    }
    await db.desks.where("roomId").equals(roomId).delete();

    const ordered = [...shape.positions].sort(compareReadingOrder);
    const newDesks: Desk[] = ordered.map((position) => ({
      id: crypto.randomUUID(),
      roomId,
      x: position.x,
      y: position.y,
    }));
    await db.desks.bulkAdd(newDesks);
    await db.rooms.update(roomId, {
      width: shape.width,
      height: shape.height,
      updatedAt: Date.now(),
    });

    const overflow: Record<string, string[]> = {};
    for (const plan of plans) {
      const seated = occupants.get(plan.id) ?? [];
      const fits = seated.slice(0, newDesks.length);
      const rest = seated.slice(newDesks.length);
      if (rest.length > 0) overflow[plan.id] = rest;
      await db.assignments.bulkAdd(
        fits.map((studentId, i) => ({
          planId: plan.id,
          deskId: newDesks[i].id,
          studentId,
        })),
      );
    }
    return { overflow };
  });
}
