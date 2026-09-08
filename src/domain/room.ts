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
 * Air between two TABLES in the same row, and between rows.
 *
 * `PITCH` used to be planted between every DESK, which is why no two desks
 * could touch, why the îlots template made 2×N spaced desks rather than a
 * block, and why a French classroom's table de deux could not be expressed at
 * all. Air belongs between groups.
 */
export const AISLE = 2;
export const ROW_GAP = 1;

/**
 * Bare floor left around the furniture when a template is stamped.
 *
 * Two units, not one, and the difference is the whole of whether the room can
 * be edited afterwards. `canPlace` refuses a position within `TABLE` of an
 * existing table ON BOTH AXES, and whole-tile candidates step by `TABLE` — so
 * with a single unit of margin a fully stamped room offers no free square
 * anywhere, and "Ajouter une table" has nowhere to place. Lifting a table then
 * revealed only the two squares a hair either side of where it already sat.
 */
export const FLOOR_MARGIN = 2;

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
const MIN_EXTENT = TABLE + 2 * FLOOR_MARGIN;

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
  const shifted = positions.map((p) => ({
    x: p.x - minX + FLOOR_MARGIN,
    y: p.y - minY + FLOOR_MARGIN,
  }));
  const width = Math.max(...shifted.map((p) => p.x)) + TABLE + FLOOR_MARGIN;
  const height = Math.max(...shifted.map((p) => p.y)) + TABLE + FLOOR_MARGIN;
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
/**
 * A run of desks that share edges, drawn as ONE table.
 *
 * The merge is a RENDERING and never a datum. Two adjacent desks are two
 * places, two assignments and two pupils; they simply draw as one surface,
 * with a chair on the near edge of each place marking where one ends. Had the
 * merge changed capacity, "is this one table or two" would become a question
 * the assignment model has to answer, and it would answer it wrong every time
 * a desk moved.
 */
/**
 * The least a desk has to be for grouping to work: an identity and a place.
 *
 * Generic over that rather than taking `Seated`, because grouping is geometry
 * and has no opinion about who is sitting down. A `Desk` — furniture, which
 * carries no occupant at all — groups exactly as well as a seated one.
 */
export interface Placed {
  id: string;
  x: number;
  y: number;
}

export interface TableGroup<T extends Placed = Seated> {
  /** The group's desks, in reading order. */
  desks: T[];
  /** The group's bounding box, in half-tiles. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Do two desks share a full edge?
 *
 * Corners do not count: two desks meeting diagonally are not a table, and
 * treating them as one would merge an entire staggered arc into a single
 * surface.
 */
function sharesEdge(a: Placed, b: Placed): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === TABLE && dy === 0) || (dy === TABLE && dx === 0);
}

/**
 * Group desks into the tables they visually form.
 *
 * Connected components over edge-sharing, walked breadth-first from each
 * unvisited desk in reading order — so both the groups and the desks inside
 * them come back front-to-back then left-to-right, and the DOM carries the
 * order a teacher reads the room in.
 *
 * Nothing about adjacency needed adding to the geometry: `overlaps` tests
 * `|dx| < TABLE`, so two desks exactly `TABLE` apart have always passed
 * `canPlace`. What kept them apart was the generators planting `PITCH`
 * between every desk.
 */
export function tableGroups<T extends Placed>(desks: T[]): TableGroup<T>[] {
  const ordered = [...desks].sort(compareReadingOrder);
  const seen = new Set<string>();
  const groups: TableGroup<T>[] = [];

  for (const start of ordered) {
    if (seen.has(start.id)) continue;
    seen.add(start.id);
    // `members` doubles as the breadth-first queue. Every desk joins `seen` as
    // it is enqueued rather than as it is visited, so none is queued twice.
    const members = [start];
    for (let i = 0; i < members.length; i += 1) {
      for (const candidate of ordered) {
        if (seen.has(candidate.id)) continue;
        if (!sharesEdge(members[i], candidate)) continue;
        seen.add(candidate.id);
        members.push(candidate);
      }
    }
    members.sort(compareReadingOrder);
    const xs = members.map((d) => d.x);
    const ys = members.map((d) => d.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    groups.push({
      desks: members,
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX + TABLE,
      height: Math.max(...ys) - minY + TABLE,
    });
  }
  return groups;
}

/**
 * A pupil in the teacher's hand.
 *
 * Anchored to ids in both fields, never to a coordinate or a rail index: the
 * rail reorders on every placement, and a desk can be moved out from under a
 * coordinate by another tab.
 */
export interface HeldPupil {
  studentId: string;
  /** The desk they were lifted from, or null when lifted from the rail. */
  fromDeskId: string | null;
}

/** What a drop resolves to. The caller turns it into exactly one transaction. */
export type Placement =
  | { kind: "none" }
  | {
      kind: "place";
      studentId: string;
      deskId: string;
      /** Whoever was sitting there, and where they go. `deskId: null` is the rail. */
      displaced: { studentId: string; deskId: string | null } | null;
    };

/**
 * The whole placement grammar, in one rule.
 *
 * Phase 5 had three: seating from the rail DISPLACED, seating from a desk
 * SWAPPED, and furniture moved. They were never three rules. Whoever occupies
 * the target goes where the held pupil came from — which is the rail when the
 * held pupil came from the rail, so `null` is not a special case but the
 * general one with an empty origin. The rail needed three hint sentences to
 * describe what this sentence describes once.
 */
export function resolvePlacement(held: HeldPupil, target: Seated | undefined): Placement {
  if (target === undefined) return { kind: "none" };
  if (target.id === held.fromDeskId) return { kind: "none" };
  const occupant = target.studentId;
  return {
    kind: "place",
    studentId: held.studentId,
    deskId: target.id,
    displaced: occupant === null ? null : { studentId: occupant, deskId: held.fromDeskId },
  };
}

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
