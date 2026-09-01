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
