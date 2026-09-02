import { buildSeats, DEFAULT_COLS, DEFAULT_ROWS, resizeSeats } from "@domain/seating";
import type { AppDatabase, Seat, SeatingLayout } from ".";
import { seatKey } from ".";

/**
 * The seating plan's writes.
 *
 * Every one of these was inline in a component until now, which is why the
 * bugs they carry are the ones a browser had to find: a pupil in two chairs, a
 * whole row growing back after being carved into an aisle. As functions they
 * are ordinary `fake-indexeddb` tests.
 *
 * The three seat states are load-bearing throughout: no row is a gap, a row
 * with `studentId: null` is an empty seat, a row with a `studentId` is
 * occupied. Nothing here may collapse the first two.
 */

/**
 * The class's room, created on first look.
 *
 * The re-check inside the transaction is what makes this idempotent under
 * React StrictMode's double-invoked effects — two layouts for one class would
 * silently split a teacher's seating in half.
 */
export async function getOrCreateLayout(db: AppDatabase, classId: string): Promise<SeatingLayout> {
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const existing = await db.seatingLayouts.where("classId").equals(classId).first();
    if (existing) return existing;
    const layout: SeatingLayout = {
      id: crypto.randomUUID(),
      classId,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      updatedAt: Date.now(),
    };
    await db.seatingLayouts.add(layout);
    await db.seats.bulkPut(buildSeats(layout.id, DEFAULT_ROWS, DEFAULT_COLS));
    return layout;
  });
}

/**
 * Seat a pupil, clearing whatever chair they held before.
 *
 * Both writes are in one transaction: a pupil briefly occupying two seats is
 * a state the grid renders, and a crash between the writes would make it
 * permanent.
 */
export async function seatStudent(
  db: AppDatabase,
  layoutId: string,
  row: number,
  col: number,
  studentId: string,
): Promise<void> {
  await db.transaction("rw", db.seats, async () => {
    const layoutSeats = await db.seats.where("layoutId").equals(layoutId).toArray();
    const previous = layoutSeats.find((seat) => seat.studentId === studentId);
    if (previous && (previous.row !== row || previous.col !== col)) {
      await db.seats.put({ ...previous, studentId: null });
    }
    await db.seats.put({ layoutId, row, col, studentId });
  });
}

/**
 * Move a seated pupil into another seat.
 *
 * The source becomes an empty seat, never a gap — the chair is still there,
 * nobody is on it. Passing the same coordinates twice is a no-op rather than
 * a way to erase a pupil.
 */
export async function moveSeat(
  db: AppDatabase,
  layoutId: string,
  from: { row: number; col: number },
  to: { row: number; col: number },
): Promise<void> {
  if (from.row === to.row && from.col === to.col) return;
  await db.transaction("rw", db.seats, async () => {
    const source = await db.seats.get(seatKey(layoutId, from.row, from.col));
    if (!source || source.studentId === null) return;
    await db.seats.put({ layoutId, row: to.row, col: to.col, studentId: source.studentId });
    await db.seats.put({ layoutId, row: from.row, col: from.col, studentId: null });
  });
}

/** Empty a seat without removing it. */
export async function clearSeat(
  db: AppDatabase,
  layoutId: string,
  row: number,
  col: number,
): Promise<void> {
  await db.seats.put({ layoutId, row, col, studentId: null });
}

/** Turn a gap back into an empty seat. */
export async function makeSeat(
  db: AppDatabase,
  layoutId: string,
  row: number,
  col: number,
): Promise<void> {
  await db.seats.put({ layoutId, row, col, studentId: null });
}

/** Carve a cell out of the room entirely — an aisle, a doorway, a pillar. */
export async function makeGap(
  db: AppDatabase,
  layoutId: string,
  row: number,
  col: number,
): Promise<void> {
  await db.seats.delete(seatKey(layoutId, row, col));
}

/**
 * Resize the room, returning the pupils whose chair fell outside it.
 *
 * The old extent comes from the STORED layout, never from the seats that
 * happen to exist: inferring it meant a carved-away edge row lowered the
 * inferred extent, so the next resize saw that row as new growth and refilled
 * the aisle.
 */
export async function resizeLayout(
  db: AppDatabase,
  layout: SeatingLayout,
  rows: number,
  cols: number,
): Promise<{ unseated: string[] }> {
  // Read the seats inside the transaction, not from what the caller last
  // rendered: a resize submitted from a stale grid would otherwise write back
  // seats that another tab has already moved.
  return await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    const existing = await db.seats.where("layoutId").equals(layout.id).toArray();
    const { seats: nextSeats, unseated } = resizeSeats(
      existing,
      layout.id,
      rows,
      cols,
      layout.rows,
      layout.cols,
    );
    const keep = new Set(nextSeats.map((seat) => `${seat.row}:${seat.col}`));
    const toDelete = existing
      .filter((seat) => !keep.has(`${seat.row}:${seat.col}`))
      .map((seat): [string, number, number] => [seat.layoutId, seat.row, seat.col]);

    await db.seatingLayouts.update(layout.id, { rows, cols, updatedAt: Date.now() });
    if (toDelete.length > 0) await db.seats.bulkDelete(toDelete);
    await db.seats.bulkPut(nextSeats);
    return { unseated };
  });
}

/** Every seat of a room, for a caller that needs them outside a live query. */
export async function seatsForLayout(db: AppDatabase, layoutId: string): Promise<Seat[]> {
  return await db.seats.where("layoutId").equals(layoutId).toArray();
}
