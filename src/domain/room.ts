import { MAX_STUDENTS_PER_CLASS } from "./class-size";

/**
 * The room, as geometry.
 *
 * Everything here is in **half-tiles**, and every coordinate is an integer. A
 * continuous unit was rejected for the reason `.carreaux` and `weekParity` were
 * both rewritten: a geometry that drifts still looks plausible, so nobody
 * catches it. Integers make `canPlace` exact and make the unique
 * `[layoutId+x+y]` index able to mean what it says.
 */

/** A table is two units square. */
export const TABLE = 2;

/** Table plus one unit of air. Anything rectilinear steps by this. */
export const PITCH = TABLE + 1;

/**
 * The step along and between curved rows.
 *
 * Larger than PITCH, and the difference is load-bearing. `canPlace` is
 * per-axis, and on a diagonal `max(|dx|,|dy|)` is only `distance / sqrt(2)`;
 * rounding then costs up to a further unit per axis. Post-rounding we need 2,
 * so pre-rounding 3, so a centre distance of `3 * sqrt(2) ~= 4.25`, so — a
 * chord being about 0.93 of its arc at the widest step in range — an arc step
 * of 4.57. Five is that, rounded up.
 */
export const ARC_SPACING = 5;

/** The largest room in either direction. */
export const ROOM_MAX = 120;

/** A room may never be stamped larger than a class may be. */
export const MAX_POSITIONS = MAX_STUDENTS_PER_CLASS;

/** The top-left corner of a table, in half-tiles. */
export interface Position {
  x: number;
  y: number;
}

/** A room: its extent, and the tables in it. */
export interface RoomShape {
  width: number;
  height: number;
  positions: Position[];
}

/**
 * Do two tables collide?
 *
 * Per-axis, never Euclidean: a table is an axis-aligned square, so two of them
 * clear each other as soon as they are two units apart on EITHER axis.
 */
export function overlaps(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) < TABLE && Math.abs(a.y - b.y) < TABLE;
}

/** Is the table's whole footprint inside the room? */
export function fitsRoom(at: Position, room: { width: number; height: number }): boolean {
  if (at.x < 0 || at.y < 0) return false;
  return at.x + TABLE <= room.width && at.y + TABLE <= room.height;
}

/** The single rule for whether a table may go somewhere. */
export function canPlace(
  taken: Position[],
  at: Position,
  room: { width: number; height: number },
): boolean {
  if (!fitsRoom(at, room)) return false;
  return !taken.some((position) => overlaps(position, at));
}

/**
 * Front of the room to the back, then left to right.
 *
 * This is the order a teacher reads a room in, and it is the order the DOM
 * carries so that Tab moves through the room the same way.
 */
export function compareReadingOrder(a: Position, b: Position): number {
  return a.y - b.y || a.x - b.x;
}

/** A room with nothing in it still has to be a room. */
const MIN_EXTENT = TABLE + 2;

/**
 * Shift a bag of positions to the origin with a one-unit margin, and size the
 * room around them.
 *
 * Generators work in whatever coordinates their maths is natural in — an arc
 * is centred on its circle and runs negative — and hand the result here rather
 * than each keeping its own bookkeeping.
 */
export function frame(positions: Position[]): RoomShape {
  if (positions.length === 0) {
    return { width: MIN_EXTENT, height: MIN_EXTENT, positions: [] };
  }
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const shifted = positions.map((p) => ({ x: p.x - minX + 1, y: p.y - minY + 1 }));
  const width = Math.min(ROOM_MAX, Math.max(...shifted.map((p) => p.x)) + TABLE + 1);
  const height = Math.min(ROOM_MAX, Math.max(...shifted.map((p) => p.y)) + TABLE + 1);
  return { width, height, positions: shifted };
}
