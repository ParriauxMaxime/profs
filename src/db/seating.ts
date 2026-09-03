import {
  canPlace,
  occupantsInReadingOrder,
  type Position,
  type RoomShape,
  reseat,
} from "@domain/room";
import { buildRoom, DEFAULT_TEMPLATE } from "@domain/room-templates";
import type { AppDatabase, Seat, SeatingLayout } from ".";

/**
 * The room's writes.
 *
 * Every one of these re-reads inside its transaction rather than trusting the
 * grid the caller last rendered. Phase 5 learned that the hard way — a stale
 * render could resurrect a carved aisle or move a pupil another tab had
 * already moved.
 *
 * Phase 5's `expectedStudentId` guard on `swapSeats` is gone, and nothing
 * replaces it: a table now has an id, so the id IS the guard. A table that has
 * been removed or replaced simply fails the read.
 */

/** A class gets its room, stamped from the default template, on first look. */
export async function getOrCreateLayout(db: AppDatabase, classId: string): Promise<SeatingLayout> {
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const existing = await db.seatingLayouts.where("classId").equals(classId).first();
    if (existing) return existing;
    const shape = buildRoom(DEFAULT_TEMPLATE);
    const layout: SeatingLayout = {
      id: crypto.randomUUID(),
      classId,
      width: shape.width,
      height: shape.height,
      updatedAt: Date.now(),
    };
    await db.seatingLayouts.add(layout);
    await db.seats.bulkAdd(
      shape.positions.map((position) => ({
        id: crypto.randomUUID(),
        layoutId: layout.id,
        x: position.x,
        y: position.y,
        studentId: null,
      })),
    );
    return layout;
  });
}

/**
 * Seat a pupil, clearing whatever table they held before.
 *
 * Both writes are in one transaction: a pupil briefly occupying two tables is
 * a state the room renders, and a crash between the writes would make it
 * permanent.
 */
export async function seatStudent(
  db: AppDatabase,
  seatId: string,
  studentId: string,
): Promise<void> {
  await db.transaction("rw", db.seats, async () => {
    const target = await db.seats.get(seatId);
    if (!target) return;
    const previous = await db.seats
      .where("layoutId")
      .equals(target.layoutId)
      .filter((seat) => seat.studentId === studentId)
      .first();
    if (previous && previous.id !== seatId) {
      await db.seats.put({ ...previous, studentId: null });
    }
    await db.seats.put({ ...target, studentId });
  });
}

/**
 * Exchange the occupants of two tables.
 *
 * Degrades to a move when the target is empty — the source becomes an empty
 * table, never a removed one. The chair is still there; nobody is on it.
 */
export async function swapSeats(db: AppDatabase, aSeatId: string, bSeatId: string): Promise<void> {
  if (aSeatId === bSeatId) return;
  await db.transaction("rw", db.seats, async () => {
    const source = await db.seats.get(aSeatId);
    const target = await db.seats.get(bSeatId);
    if (!source || !target || source.studentId === null) return;
    await db.seats.put({ ...source, studentId: target.studentId });
    await db.seats.put({ ...target, studentId: source.studentId });
  });
}

/** Empty a table without removing it. */
export async function clearSeat(db: AppDatabase, seatId: string): Promise<void> {
  await db.transaction("rw", db.seats, async () => {
    const seat = await db.seats.get(seatId);
    if (!seat) return;
    await db.seats.put({ ...seat, studentId: null });
  });
}

/**
 * Put a new table down, or refuse.
 *
 * Returns `null` rather than throwing: a refused placement is an ordinary
 * outcome of a tap near another table, not an error worth a console entry.
 */
export async function addTable(
  db: AppDatabase,
  layoutId: string,
  at: Position,
): Promise<Seat | null> {
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const layout = await db.seatingLayouts.get(layoutId);
    if (!layout) return null;
    const existing = await db.seats.where("layoutId").equals(layoutId).toArray();
    if (!canPlace(existing, at, layout)) return null;
    const seat: Seat = {
      id: crypto.randomUUID(),
      layoutId,
      x: at.x,
      y: at.y,
      studentId: null,
    };
    await db.seats.add(seat);
    return seat;
  });
}

/**
 * Move a table, keeping its id and its occupant.
 *
 * The id survives, which is what lets the teacher keep holding the same table
 * across the move and what keeps a pupil attached to their chair rather than
 * to a coordinate.
 */
export async function moveTable(db: AppDatabase, seatId: string, to: Position): Promise<boolean> {
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const seat = await db.seats.get(seatId);
    if (!seat) return false;
    const layout = await db.seatingLayouts.get(seat.layoutId);
    if (!layout) return false;
    const others = (await db.seats.where("layoutId").equals(seat.layoutId).toArray()).filter(
      (other) => other.id !== seatId,
    );
    if (!canPlace(others, to, layout)) return false;
    await db.seats.put({ ...seat, x: to.x, y: to.y });
    return true;
  });
}

/**
 * Take a table out of the room entirely — an aisle, a doorway, a pillar.
 *
 * Its occupant is unseated by the removal itself: with no row there is no
 * seat, and `unseatedStudentIds` puts them back in the rail on the next
 * render. There is no separate "clear then remove" to get half-done.
 */
export async function removeTable(db: AppDatabase, seatId: string): Promise<void> {
  await db.seats.delete(seatId);
}

/**
 * Stamp a template over the room.
 *
 * Destructive to the TABLES and deliberately not to the ARRANGEMENT: the
 * pupils who were seated are poured back in reading order, so a grid restamped
 * as an arc keeps the front row in front. Whoever no longer fits is returned
 * as `overflow` for the caller to warn about before it commits.
 */
export async function applyTemplate(
  db: AppDatabase,
  layoutId: string,
  shape: RoomShape,
): Promise<{ overflow: string[] }> {
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const existing = await db.seats.where("layoutId").equals(layoutId).toArray();
    const occupants = occupantsInReadingOrder(existing);
    const { seats, overflow } = reseat(occupants, shape.positions);
    await db.seats.where("layoutId").equals(layoutId).delete();
    await db.seats.bulkAdd(
      seats.map((seat) => ({
        id: crypto.randomUUID(),
        layoutId,
        x: seat.x,
        y: seat.y,
        studentId: seat.studentId,
      })),
    );
    await db.seatingLayouts.update(layoutId, {
      width: shape.width,
      height: shape.height,
      updatedAt: Date.now(),
    });
    return { overflow };
  });
}

/** Every table of a room, for a caller that needs them outside a live query. */
export async function seatsForLayout(db: AppDatabase, layoutId: string): Promise<Seat[]> {
  return await db.seats.where("layoutId").equals(layoutId).toArray();
}
