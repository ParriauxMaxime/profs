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
): ResizeResult {
  const kept: Seat[] = [];
  const unseated: string[] = [];
  let oldMaxRow = -1;
  let oldMaxCol = -1;

  for (const seat of existing) {
    oldMaxRow = Math.max(oldMaxRow, seat.row);
    oldMaxCol = Math.max(oldMaxCol, seat.col);
    if (seat.row < rows && seat.col < cols) {
      kept.push(seat);
    } else if (seat.studentId !== null) {
      unseated.push(seat.studentId);
    }
  }

  // Only cells beyond the old grid's extent are genuine growth and become
  // seats. A cell inside that extent but absent from `existing` is a gap the
  // teacher carved — an aisle, a doorway — and resizing must never invent a
  // seat back into it. Widening a room must not silently refill its aisles.
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (row <= oldMaxRow && col <= oldMaxCol) continue;
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
