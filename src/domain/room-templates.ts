import { frame, MAX_POSITIONS, PITCH, type Position, type RoomShape } from "./room";

/**
 * The four room templates.
 *
 * A template STAMPS and then ceases to exist. Nothing stored anywhere records
 * that a room "is an arc", because a live template has to answer a question it
 * cannot: once the teacher moves one table out of the arc, does changing the
 * curvature move that table or leave it? Both answers are wrong half the time.
 *
 * Every parameter is a count of TABLES, never of pupils. A seat total plus a
 * row count is not a shape until something decides how they split, and each
 * generator would have had to invent that rule for itself. The form shows the
 * resulting seat count instead — `seatCount` is the one that computes it.
 */

export const TEMPLATE_IDS = ["rows", "arc", "islands", "u"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type RoomTemplate =
  | { id: "rows"; rows: number; cols: number }
  | { id: "arc"; perRow: number; rows: number; curve: number }
  | { id: "islands"; islands: number; perIsland: number }
  | { id: "u"; cols: number; rows: number };

/** Every parameter's floor and ceiling, beside the generators that read them. */
const LIMITS = {
  rows: { rows: [1, 20], cols: [1, 20] },
  arc: { perRow: [1, 20], rows: [1, 4], curve: [1, 5] },
  islands: { islands: [1, 12], perIsland: [2, 8] },
  u: { cols: [2, 20], rows: [1, 10] },
} as const;

/** The grid phase 5 shipped, kept as the default a new room is stamped from. */
export const DEFAULT_TEMPLATE: RoomTemplate = { id: "rows", rows: 5, cols: 6 };

export function defaultTemplate(id: TemplateId): RoomTemplate {
  switch (id) {
    case "rows":
      return DEFAULT_TEMPLATE;
    case "arc":
      return { id: "arc", perRow: 10, rows: 2, curve: 3 };
    case "islands":
      return { id: "islands", islands: 6, perIsland: 4 };
    case "u":
      return { id: "u", cols: 10, rows: 4 };
  }
}

function clampValue(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, Math.round(value) || min));
}

export function seatCount(template: RoomTemplate): number {
  switch (template.id) {
    case "rows":
      return template.rows * template.cols;
    case "arc":
      return template.perRow * template.rows;
    case "islands":
      return template.islands * template.perIsland;
    case "u":
      return template.cols + 2 * (template.rows - 1);
  }
}

/**
 * Bring every parameter inside its own range, then bring the seat total inside
 * a class's ceiling by lowering whichever parameter multiplies fastest.
 *
 * Idempotent, because the form calls it on every keystroke.
 */
export function clampTemplate(template: RoomTemplate): RoomTemplate {
  let clamped: RoomTemplate;
  switch (template.id) {
    case "rows":
      clamped = {
        id: "rows",
        rows: clampValue(template.rows, LIMITS.rows.rows),
        cols: clampValue(template.cols, LIMITS.rows.cols),
      };
      while (seatCount(clamped) > MAX_POSITIONS && clamped.id === "rows" && clamped.rows > 1) {
        clamped = { ...clamped, rows: clamped.rows - 1 };
      }
      return clamped;
    case "arc":
      return {
        id: "arc",
        perRow: clampValue(template.perRow, LIMITS.arc.perRow),
        rows: clampValue(template.rows, LIMITS.arc.rows),
        curve: clampValue(template.curve, LIMITS.arc.curve),
      };
    case "islands":
      clamped = {
        id: "islands",
        islands: clampValue(template.islands, LIMITS.islands.islands),
        perIsland: clampValue(template.perIsland, LIMITS.islands.perIsland),
      };
      while (
        seatCount(clamped) > MAX_POSITIONS &&
        clamped.id === "islands" &&
        clamped.islands > 1
      ) {
        clamped = { ...clamped, islands: clamped.islands - 1 };
      }
      return clamped;
    case "u":
      return {
        id: "u",
        cols: clampValue(template.cols, LIMITS.u.cols),
        rows: clampValue(template.rows, LIMITS.u.rows),
      };
  }
}

/** Rectilinear rows: phase 5's grid, at pitch. */
function buildRows(rows: number, cols: number): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      positions.push({ x: col * PITCH, y: row * PITCH });
    }
  }
  return positions;
}

export function buildRoom(template: RoomTemplate): RoomShape {
  const t = clampTemplate(template);
  switch (t.id) {
    case "rows":
      return frame(buildRows(t.rows, t.cols));
    case "arc":
    case "islands":
    case "u":
      throw new Error(`room template not implemented: ${t.id}`);
  }
}
