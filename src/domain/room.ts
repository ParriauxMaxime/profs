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
 *
 * The invariant is exact and unconditional: every position `frame` returns
 * fits inside the width and height it returns. `frame` does not clamp to
 * `ROOM_MAX` — doing so here would either clip a position outside the room it
 * just reported (orphaning a table silently) or drop it (losing it silently),
 * and both are worse than reporting the true extent. `ROOM_MAX` is enforced
 * one layer up, by the template clamps: free placement can only ever grow a
 * room by adding a position already checked against the stored layout's
 * dimensions, so a template stamp is the only thing that can ever exceed it.
 */
export function frame(positions: Position[]): RoomShape {
  if (positions.length === 0) {
    return { width: MIN_EXTENT, height: MIN_EXTENT, positions: [] };
  }
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const shifted = positions.map((p) => ({ x: p.x - minX + 1, y: p.y - minY + 1 }));
  const width = Math.max(...shifted.map((p) => p.x)) + TABLE + 1;
  const height = Math.max(...shifted.map((p) => p.y)) + TABLE + 1;
  return { width, height, positions: shifted };
}

/**
 * The shape of a table as the domain needs to see it.
 *
 * Structural, not the `Seat` row itself, so `src/domain/` keeps importing
 * nothing from `src/db/`.
 */
export interface Seated {
  id: string;
  x: number;
  y: number;
  studentId: string | null;
}

/** Who is sitting where, read front-to-back. Empty tables contribute nothing. */
export function occupantsInReadingOrder(seats: Seated[]): string[] {
  return [...seats]
    .sort(compareReadingOrder)
    .map((seat) => seat.studentId)
    .filter((studentId): studentId is string => studentId !== null);
}

/**
 * Pupils holding no table, in the order they were given.
 *
 * With two seat states rather than three, this is the whole of "who is in the
 * rail": a pupil is unseated when no table names them — including because
 * their table was removed, which is why `removeTable` needs no companion
 * write to put them back.
 */
export function unseatedStudentIds(students: { id: string }[], seats: Seated[]): string[] {
  const seated = new Set(seats.map((s) => s.studentId).filter((id): id is string => id !== null));
  return students.filter((s) => !seated.has(s.id)).map((s) => s.id);
}

/**
 * Pour pupils into a freshly stamped room.
 *
 * A template stamp destroys the tables, and this is what stops it destroying
 * the *arrangement*: pupils go back in reading order, so a grid restamped as
 * an arc keeps the front row in front. Whoever no longer fits comes back as
 * `overflow` for the caller to warn about — never silently dropped.
 */
export function reseat(
  occupants: string[],
  positions: Position[],
): { seats: { x: number; y: number; studentId: string | null }[]; overflow: string[] } {
  const ordered = [...positions].sort(compareReadingOrder);
  const seats = ordered.map((position, i) => ({
    x: position.x,
    y: position.y,
    studentId: occupants[i] ?? null,
  }));
  return { seats, overflow: occupants.slice(ordered.length) };
}

/**
 * Who is in the teacher's hand.
 *
 * Anchored to an id in every case. Phase 5 anchored a held seat to its
 * coordinates, which is why `swapSeats` needed an `expectedStudentId` to
 * survive another tab moving that pupil away; an id needs no such guard.
 */
export type Held =
  | { kind: "pool"; studentId: string }
  | { kind: "seat"; seatId: string }
  | { kind: "table"; seatId: string };

/** What a drop resolves to. The caller turns it into exactly one write. */
export type DropAction =
  | { kind: "none" }
  | { kind: "seat"; studentId: string; seatId: string }
  | { kind: "swap"; fromSeatId: string; toSeatId: string }
  | { kind: "moveTable"; seatId: string; to: Position };

/**
 * Dropping on a TABLE.
 *
 * A pupil from the rail seats and displaces; a pupil from a table swaps, which
 * degrades to a move when the target is empty; furniture is never dropped onto
 * furniture.
 */
export function resolveDrop(held: Held, target: Seated | undefined): DropAction {
  if (target === undefined) return { kind: "none" };
  switch (held.kind) {
    case "pool":
      return { kind: "seat", studentId: held.studentId, seatId: target.id };
    case "seat":
      if (held.seatId === target.id) return { kind: "none" };
      return { kind: "swap", fromSeatId: held.seatId, toSeatId: target.id };
    case "table":
      return { kind: "none" };
  }
}

/** Dropping on bare FLOOR. Only furniture goes there. */
export function resolveFloorDrop(held: Held, at: Position): DropAction {
  if (held.kind !== "table") return { kind: "none" };
  return { kind: "moveTable", seatId: held.seatId, to: at };
}
