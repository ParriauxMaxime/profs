import {
  AISLE,
  frame,
  MAX_POSITIONS,
  PITCH,
  type Position,
  ROW_GAP,
  type RoomShape,
  TABLE,
} from "./room";

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
  | { id: "rows"; rows: number; tables: number; perTable: number }
  | { id: "arc"; perRow: number; rows: number; curve: number }
  | { id: "islands"; islands: number; perIsland: number }
  | { id: "u"; cols: number; rows: number };

/**
 * Every parameter's floor and ceiling, beside the generators that read them.
 *
 * Exported so a form's `min`/`max` are the same numbers `clampTemplate`
 * enforces for that parameter ON ITS OWN.
 *
 * They are not the whole clamp, and a form must not read them as if they were.
 * `clampTemplate` also brings the SEAT TOTAL under `MAX_POSITIONS`, and it does
 * that by lowering whichever parameter multiplies fastest — so with ten tables
 * of four, any `rows` above 2 is silently reduced, well short of the 20 this table
 * allows. The effective ceiling on one parameter depends on the others and is
 * not expressible here; only `clampTemplate` knows it. The silent correction is
 * the right outcome — the class ceiling is a hard rule — but it does mean a
 * spinner bounded by these numbers can still hand `clampTemplate` a value it
 * lowers. The form shows the resulting seat count, which is where a teacher
 * sees it happen.
 */
export const TEMPLATE_LIMITS = {
  rows: { rows: [1, 20], tables: [1, 10], perTable: [1, 4] },
  arc: { perRow: [1, 20], rows: [1, 4], curve: [1, 5] },
  islands: { islands: [1, 12], perIsland: [2, 8] },
  u: { cols: [2, 20], rows: [1, 10] },
} as const;

/** The grid phase 5 shipped, kept as the default a new room is stamped from. */
export const DEFAULT_TEMPLATE: RoomTemplate = { id: "rows", rows: 4, tables: 3, perTable: 2 };

/**
 * Ready-made salles, offered when a teacher creates one.
 *
 * The parametric form exists and is fine, but it asks for numbers before it
 * shows anything, and a teacher creating their first salle has no idea what
 * "3 tables par rang, 2 places par table" will look like. These are the five
 * arrangements a French classroom is actually furnished in, each already a
 * whole room.
 *
 * Deliberately NOT stored anywhere: a preset is a starting shape, and the room
 * it stamps ceases to remember it — same ruling as the templates themselves,
 * for the same reason. Nothing records that a salle "is an arc".
 *
 * Four of the five come out at 24 places, which is a French classroom; the
 * horseshoe is smaller because a horseshoe is.
 */
export const ROOM_PRESET_IDS = ["pairs", "single", "islands", "arc", "u"] as const;
export type RoomPresetId = (typeof ROOM_PRESET_IDS)[number];

export const ROOM_PRESETS: Record<RoomPresetId, RoomTemplate> = {
  /** Tables de deux, the ordinary French classroom. */
  pairs: { id: "rows", rows: 4, tables: 3, perTable: 2 },
  /** The same room, un-merged: one desk per pupil. */
  single: { id: "rows", rows: 4, tables: 6, perTable: 1 },
  /** Six blocks of four, for group work. */
  islands: { id: "islands", islands: 6, perIsland: 4 },
  /** Three bowed rows facing the board. */
  arc: { id: "arc", perRow: 8, rows: 3, curve: 3 },
  /** One continuous horseshoe, open toward the board. */
  u: { id: "u", cols: 10, rows: 4 },
};

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
      return template.rows * template.tables * template.perTable;
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
        rows: clampValue(template.rows, TEMPLATE_LIMITS.rows.rows),
        tables: clampValue(template.tables, TEMPLATE_LIMITS.rows.tables),
        perTable: clampValue(template.perTable, TEMPLATE_LIMITS.rows.perTable),
      };
      while (seatCount(clamped) > MAX_POSITIONS && clamped.id === "rows" && clamped.rows > 1) {
        clamped = { ...clamped, rows: clamped.rows - 1 };
      }
      return clamped;
    case "arc":
      return {
        id: "arc",
        perRow: clampValue(template.perRow, TEMPLATE_LIMITS.arc.perRow),
        rows: clampValue(template.rows, TEMPLATE_LIMITS.arc.rows),
        curve: clampValue(template.curve, TEMPLATE_LIMITS.arc.curve),
      };
    case "islands":
      clamped = {
        id: "islands",
        islands: clampValue(template.islands, TEMPLATE_LIMITS.islands.islands),
        perIsland: clampValue(template.perIsland, TEMPLATE_LIMITS.islands.perIsland),
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
        cols: clampValue(template.cols, TEMPLATE_LIMITS.u.cols),
        rows: clampValue(template.rows, TEMPLATE_LIMITS.u.rows),
      };
  }
}

/**
 * Rows of TABLES, each seating `perTable`.
 *
 * The places of one table sit edge to edge, so they draw as a single surface —
 * a table de deux by default, which is what a French classroom is furnished
 * with. Air goes between tables (`AISLE`) and between rows (`ROW_GAP`), never
 * between the places of one table, which is what phase 5's `PITCH` grid did
 * and why no two desks could ever touch.
 */
function buildRows(rows: number, tables: number, perTable: number): Position[] {
  const positions: Position[] = [];
  const tableStep = perTable * TABLE + AISLE;
  for (let row = 0; row < rows; row += 1) {
    for (let table = 0; table < tables; table += 1) {
      for (let place = 0; place < perTable; place += 1) {
        positions.push({
          x: table * tableStep + place * TABLE,
          y: row * (TABLE + ROW_GAP),
        });
      }
    }
  }
  return positions;
}

/**
 * How deep the bow is, per unit of `curve`.
 *
 * `curve` is what a teacher means by it — how far the middle of the row sits
 * back from its ends — rather than an angle. It was an ANGULAR SPAN, and that
 * is what made the arc unusable: seats were spaced along the arc, so holding
 * ten of them inside a small angle demanded an enormous radius, and the room
 * came out ~1580px wide and barely two units deep at EVERY setting. Width
 * hardly moved with the curve, which is the tell that the parameter was
 * controlling the wrong thing.
 */
const BOW_PER_CURVE = 2;

/**
 * A row bowed away from the board, seats spaced along the X axis.
 *
 * A parabola rather than a circle: at classroom scale the two are
 * indistinguishable, and this one is bounded in width by construction —
 * `(perRow - 1) * PITCH + TABLE`, exactly what a straight row of the same
 * length would need.
 *
 * It also needs no arc spacing at all. Neighbours differ by `PITCH` on X, and
 * `overlaps` is per-axis, so a pair clears on X alone whatever the bow does to
 * Y. That is what let `ARC_SPACING` and its sqrt(2) derivation go: the
 * clearance problem only existed because seats were placed along the arc,
 * where two neighbours can be diagonal to one another.
 */
function buildArc(perRow: number, rows: number, curve: number): Position[] {
  const bow = curve * BOW_PER_CURVE;
  const positions: Position[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < perRow; i += 1) {
      // -1 at the left end, +1 at the right, 0 in the middle.
      const t = perRow > 1 ? (2 * i) / (perRow - 1) - 1 : 0;
      positions.push({
        x: i * PITCH,
        // The ENDS come forward toward the board; the middle sits back.
        y: row * PITCH + Math.round(bow * (1 - t * t)),
      });
    }
  }
  return positions;
}

/** Islands sit in a grid of their own, this many across before wrapping. */
const ISLANDS_PER_BAND = 3;

/**
 * Clusters of tables, two wide — and now actually clusters.
 *
 * The places WITHIN an island sit edge to edge, so an island draws as one
 * block. Until this changed, `îlots` stepped by `PITCH` inside the island too,
 * which made 2×N desks with aisles between them: a grid with odd spacing, not
 * an island. The gap between islands still has to read as clearly bigger than
 * anything inside one.
 */
function buildIslands(islands: number, perIsland: number): Position[] {
  const islandCols = 2;
  const islandRows = Math.ceil(perIsland / islandCols);
  const bandStep = {
    x: islandCols * TABLE + AISLE * 2,
    y: islandRows * TABLE + AISLE,
  };
  const positions: Position[] = [];
  for (let island = 0; island < islands; island += 1) {
    const originX = (island % ISLANDS_PER_BAND) * bandStep.x;
    const originY = Math.floor(island / ISLANDS_PER_BAND) * bandStep.y;
    for (let i = 0; i < perIsland; i += 1) {
      positions.push({
        x: originX + (i % islandCols) * TABLE,
        y: originY + Math.floor(i / islandCols) * TABLE,
      });
    }
  }
  return positions;
}

/**
 * A horseshoe, open toward the board.
 *
 * The board is at the top, so the closed side is the BACK row and the two arms
 * run up the left and right edges toward it. Every pupil faces up. With one
 * row it degrades to a plain row rather than to two overlapping arm ends.
 */
function buildU(cols: number, rows: number): Position[] {
  const positions: Position[] = [];
  // Edge to edge along both arms and the base, so the horseshoe is ONE
  // continuous surface rather than a ring of separate desks.
  const backY = (rows - 1) * TABLE;
  for (let arm = 0; arm < rows - 1; arm += 1) {
    const y = arm * TABLE;
    positions.push({ x: 0, y });
    positions.push({ x: (cols - 1) * TABLE, y });
  }
  for (let col = 0; col < cols; col += 1) {
    positions.push({ x: col * TABLE, y: backY });
  }
  return positions;
}

export function buildRoom(template: RoomTemplate): RoomShape {
  const t = clampTemplate(template);
  switch (t.id) {
    case "rows":
      return frame(buildRows(t.rows, t.tables, t.perTable));
    case "arc":
      return frame(buildArc(t.perRow, t.rows, t.curve));
    case "islands":
      return frame(buildIslands(t.islands, t.perIsland));
    case "u":
      return frame(buildU(t.cols, t.rows));
  }
}
