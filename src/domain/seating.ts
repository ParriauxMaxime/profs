import type { Seat } from "@db/types";

/**
 * The room, as a grid.
 *
 * A seat's three states are encoded by presence, not by a flag: no row for a
 * cell is a gap (an aisle, a doorway), a row with `studentId: null` is an
 * empty seat, and a row with a `studentId` is occupied. Resizing must never
 * silently invent seats where the teacher carved a gap.
 */

export const DEFAULT_ROWS = 5;
export const DEFAULT_COLS = 6;
export const MAX_ROWS = 12;
export const MAX_COLS = 12;

/** Every cell of a fresh grid is an empty seat; gaps are carved afterwards. */
export function buildSeats(layoutId: string, rows: number, cols: number): Seat[] {
  const seats: Seat[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      seats.push({ layoutId, row, col, studentId: null });
    }
  }
  return seats;
}

export interface ResizeResult {
  /** The seats that survive, plus new empty ones for cells the grid gained. */
  seats: Seat[];
  /** Pupils the caller must warn about: their seat falls outside the new grid. */
  unseated: string[];
}

/**
 * Resize a grid, keeping what fits.
 *
 * Cells inside both the old and new bounds keep their occupant. Cells the grid
 * gains become empty seats. Cells it loses are dropped, and any pupil sitting
 * in one is reported so the caller can say who is about to be moved — unseated
 * is not deleted; they return to the pool.
 */
export function resizeSeats(
  existing: Seat[],
  layoutId: string,
  rows: number,
  cols: number,
  oldRows: number,
  oldCols: number,
): ResizeResult {
  const kept: Seat[] = [];
  const unseated: string[] = [];

  for (const seat of existing) {
    if (seat.row < rows && seat.col < cols) {
      kept.push(seat);
    } else if (seat.studentId !== null) {
      unseated.push(seat.studentId);
    }
  }

  // The old extent comes from the STORED layout, never from the surviving
  // seats. Inferring it from the seats meant that carving away a whole edge
  // row lowered the inferred extent, so the next resize saw that row as new
  // growth and silently restored it — the teacher's aisle grew back by
  // opening the size form and saving it unchanged.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (row < oldRows && col < oldCols) continue;
      kept.push({ layoutId, row, col, studentId: null });
    }
  }

  kept.sort((a, b) => a.row - b.row || a.col - b.col);
  return { seats: kept, unseated };
}

/** Pupils holding no seat, in the order they were given. */
export function unseatedStudentIds(students: { id: string }[], seats: Seat[]): string[] {
  const seated = new Set(seats.map((s) => s.studentId).filter((id): id is string => id !== null));
  return students.filter((s) => !seated.has(s.id)).map((s) => s.id);
}

/**
 * Who is currently in the teacher's hand.
 *
 * Anchored to a pupil's id or to a cell's coordinates, never to a position in
 * the rail: the rail reorders every time somebody is seated, and an
 * index-held selection would retarget onto whoever slid into that slot. This
 * codebase has produced that bug three times already.
 */
export type Held = { kind: "pool"; studentId: string } | { kind: "seat"; row: number; col: number };

/** What a drop resolves to. The caller turns it into exactly one write. */
export type DropAction =
  | { kind: "none" }
  | { kind: "seat"; studentId: string; row: number; col: number }
  | { kind: "swap"; from: { row: number; col: number }; to: { row: number; col: number } };

/**
 * Decide what dropping `held` on the cell at `at` means.
 *
 * Pure, and tested, because this is the rule the whole interaction rests on
 * and it is far too easy to read wrong off a click handler: a pupil from the
 * rail always *seats* (displacing whoever was there, which `seatStudent`
 * already does in one transaction), a pupil from a seat always *swaps* (which
 * degrades to a move when the target is empty), and a gap is never a target.
 */
export function resolveDrop(
  held: Held,
  target: Seat | undefined,
  at: { row: number; col: number },
): DropAction {
  if (target === undefined) return { kind: "none" };
  if (held.kind === "pool") {
    return { kind: "seat", studentId: held.studentId, row: at.row, col: at.col };
  }
  if (held.row === at.row && held.col === at.col) return { kind: "none" };
  return { kind: "swap", from: { row: held.row, col: held.col }, to: { row: at.row, col: at.col } };
}
