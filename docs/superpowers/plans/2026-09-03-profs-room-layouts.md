# Room Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seating plan's fixed rectangular grid with a room of freely positioned tables, stamped out by one of four templates (rows, arc, islands, U) and then adjusted by hand.

**Architecture:** Tables gain their own integer coordinates in half-tile units and their own stable ids, so a `Seat` is addressed by id rather than by `[layoutId+row+col]`. Four pure generator functions in `src/domain/room-templates.ts` emit positions and then cease to exist — nothing records that a room "is an arc". The React layer positions tables absolutely inside a scaled canvas and keeps phase 5's pick-up-then-place gesture unchanged, extending it with a third held kind for the furniture itself.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Jest + `fake-indexeddb`, i18next, Tailwind, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-03-profs-room-layouts-design.md`

## Global Constraints

Copied from the spec and from `CLAUDE.md`. Every task's requirements implicitly include this section.

- **No network request of any kind.** No `fetch`, no CDN, no external font or image. This is a written promise in `README.md` and `PRIVACY.md`, not a preference.
- **Validation gate — all four must be green before any task is considered done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- **Never `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use `ConfirmButton` (two-step, in place).
- **i18n:** every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json` — a parity test fails the build otherwise. `fr` is the default and the fallback. Plurals use i18next v4 suffixes (`_one` / `_other`). Never pass a variable named `count` unless plural resolution is wanted.
- **Naming:** identifiers are English; only translation values are French. The column row type stays `GradeColumn`, never `Column`.
- **Pupil names** are composed only by `PupilName` in `src/modules/design-system/components/`. Capitals are CSS, never `toUpperCase()`.
- **State bound to a record is anchored to that record's identity, never to its position.** This is the invariant this whole phase turns on.
- **Domain layer** (`src/domain/`) is pure: no React, no Dexie, no I/O. **Every multi-table delete** lives in `src/db/cascade.ts`. Components read through `useLiveQuery` and hold UI state only.
- **Every `useLiveQuery` takes `db` in its dependency array**, or a workspace switch keeps rendering the previous school's data.
- **IDs** come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.
- **Live-entry tap targets are at least 44px.**
- **Schema changes are disposable:** bump the Dexie version, never write an upgrade callback.
- Units: **1 unit = half a table**. `TABLE = 2`, `PITCH = 3`, `ARC_SPACING = 5`, `ROOM_MAX = 120`, `MAX_POSITIONS = MAX_STUDENTS_PER_CLASS = 100`. All coordinates are integers.

---

### Task 1: Room geometry primitives

The pure vocabulary every later task speaks: units, a position, the overlap rule, and the framing that turns a bag of positions into a sized room.

**Files:**
- Create: `src/domain/room.ts`
- Test: `src/domain/room.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TABLE = 2`, `PITCH = 3`, `ARC_SPACING = 5`, `ROOM_MAX = 120`, `MAX_POSITIONS = 100`
  - `interface Position { x: number; y: number }`
  - `interface RoomShape { width: number; height: number; positions: Position[] }`
  - `overlaps(a: Position, b: Position): boolean`
  - `fitsRoom(at: Position, room: { width: number; height: number }): boolean`
  - `canPlace(taken: Position[], at: Position, room: { width: number; height: number }): boolean`
  - `compareReadingOrder(a: Position, b: Position): number`
  - `frame(positions: Position[]): RoomShape`

- [ ] **Step 1: Write the failing test**

Create `src/domain/room.test.ts`:

```ts
import {
  ARC_SPACING,
  canPlace,
  compareReadingOrder,
  fitsRoom,
  frame,
  MAX_POSITIONS,
  overlaps,
  PITCH,
  ROOM_MAX,
  TABLE,
} from "./room";

describe("constants", () => {
  it("gives a table one unit of air at pitch", () => {
    expect(TABLE).toBe(2);
    expect(PITCH).toBe(TABLE + 1);
  });

  it("spaces a curved row wide enough to survive the diagonal and rounding", () => {
    // max(|dx|,|dy|) must be >= 2 AFTER rounding, so >= 3 before it, so the
    // centre distance must be >= 3 * sqrt(2), and a chord is ~0.93 of its arc.
    expect(ARC_SPACING).toBeGreaterThanOrEqual((3 * Math.SQRT2) / 0.93);
  });

  it("bounds a room and a roster", () => {
    expect(ROOM_MAX).toBe(120);
    expect(MAX_POSITIONS).toBe(100);
  });
});

describe("overlaps", () => {
  it("is per-axis, because a table is an axis-aligned square", () => {
    expect(overlaps({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(overlaps({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(overlaps({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });

  it("clears a pair that is far on one axis and touching on the other", () => {
    expect(overlaps({ x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
  });

  it("is symmetric", () => {
    expect(overlaps({ x: 3, y: 1 }, { x: 2, y: 2 })).toBe(
      overlaps({ x: 2, y: 2 }, { x: 3, y: 1 }),
    );
  });
});

describe("fitsRoom", () => {
  const room = { width: 10, height: 10 };

  it("accepts a table whose whole footprint is inside", () => {
    expect(fitsRoom({ x: 8, y: 8 }, room)).toBe(true);
  });

  it("refuses a table hanging off an edge", () => {
    expect(fitsRoom({ x: 9, y: 0 }, room)).toBe(false);
    expect(fitsRoom({ x: 0, y: 9 }, room)).toBe(false);
  });

  it("refuses a negative coordinate", () => {
    expect(fitsRoom({ x: -1, y: 0 }, room)).toBe(false);
  });
});

describe("canPlace", () => {
  const room = { width: 20, height: 20 };

  it("accepts an empty room", () => {
    expect(canPlace([], { x: 4, y: 4 }, room)).toBe(true);
  });

  it("refuses a spot that overlaps an existing table", () => {
    expect(canPlace([{ x: 4, y: 4 }], { x: 5, y: 4 }, room)).toBe(false);
  });

  it("accepts the very next unit once it clears", () => {
    expect(canPlace([{ x: 4, y: 4 }], { x: 6, y: 4 }, room)).toBe(true);
  });

  it("refuses a spot outside the room even when nothing is there", () => {
    expect(canPlace([], { x: 19, y: 0 }, room)).toBe(false);
  });
});

describe("compareReadingOrder", () => {
  it("sorts front to back, then left to right", () => {
    const sorted = [
      { x: 5, y: 3 },
      { x: 0, y: 3 },
      { x: 9, y: 0 },
    ].sort(compareReadingOrder);
    expect(sorted).toEqual([
      { x: 9, y: 0 },
      { x: 0, y: 3 },
      { x: 5, y: 3 },
    ]);
  });
});

describe("frame", () => {
  it("shifts positions to a one-unit margin and sizes the room around them", () => {
    const shape = frame([
      { x: -4, y: 2 },
      { x: 2, y: 8 },
    ]);
    expect(shape.positions).toEqual([
      { x: 1, y: 1 },
      { x: 7, y: 7 },
    ]);
    expect(shape.width).toBe(7 + TABLE + 1);
    expect(shape.height).toBe(7 + TABLE + 1);
  });

  it("gives an empty room a minimum size rather than a zero one", () => {
    const shape = frame([]);
    expect(shape.positions).toEqual([]);
    expect(shape.width).toBeGreaterThanOrEqual(TABLE + 2);
    expect(shape.height).toBeGreaterThanOrEqual(TABLE + 2);
  });

  it("never exceeds ROOM_MAX", () => {
    const shape = frame([
      { x: 0, y: 0 },
      { x: 500, y: 500 },
    ]);
    expect(shape.width).toBeLessThanOrEqual(ROOM_MAX);
    expect(shape.height).toBeLessThanOrEqual(ROOM_MAX);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/room.test.ts`
Expected: FAIL — `Cannot find module './room'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/room.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/room.ts src/domain/room.test.ts
git commit -m "feat(room): geometry primitives for freely positioned tables"
```

---

### Task 2: The template union, its clamps, and the `rows` generator

The registry every generator plugs into, plus the simplest of the four — phase 5's grid, now one template among others.

**Files:**
- Create: `src/domain/room-templates.ts`
- Test: `src/domain/room-templates.test.ts`

**Interfaces:**
- Consumes: `Position`, `RoomShape`, `frame`, `overlaps`, `fitsRoom`, `PITCH`, `TABLE`, `MAX_POSITIONS`, `ROOM_MAX` from `src/domain/room.ts` (Task 1).
- Produces:
  - `TEMPLATE_IDS = ["rows", "arc", "islands", "u"] as const`
  - `type TemplateId = (typeof TEMPLATE_IDS)[number]`
  - `type RoomTemplate = { id: "rows"; rows: number; cols: number } | { id: "arc"; perRow: number; rows: number; curve: number } | { id: "islands"; islands: number; perIsland: number } | { id: "u"; cols: number; rows: number }`
  - `DEFAULT_TEMPLATE: RoomTemplate` (the `rows` 5 × 6 phase 5 shipped)
  - `defaultTemplate(id: TemplateId): RoomTemplate`
  - `clampTemplate(template: RoomTemplate): RoomTemplate`
  - `seatCount(template: RoomTemplate): number`
  - `buildRoom(template: RoomTemplate): RoomShape`

- [ ] **Step 1: Write the failing test**

Create `src/domain/room-templates.test.ts`:

```ts
import { MAX_POSITIONS, overlaps, PITCH, ROOM_MAX, TABLE } from "./room";
import {
  buildRoom,
  clampTemplate,
  DEFAULT_TEMPLATE,
  defaultTemplate,
  type RoomTemplate,
  seatCount,
  TEMPLATE_IDS,
} from "./room-templates";

/** Shared by every generator's test: the shape must be a room, not a pile. */
export function expectWellFormed(template: RoomTemplate): void {
  const shape = buildRoom(template);
  expect(shape.positions).toHaveLength(seatCount(template));
  expect(shape.width).toBeLessThanOrEqual(ROOM_MAX);
  expect(shape.height).toBeLessThanOrEqual(ROOM_MAX);
  for (const p of shape.positions) {
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + TABLE).toBeLessThanOrEqual(shape.width);
    expect(p.y + TABLE).toBeLessThanOrEqual(shape.height);
  }
  for (let i = 0; i < shape.positions.length; i += 1) {
    for (let j = i + 1; j < shape.positions.length; j += 1) {
      expect(overlaps(shape.positions[i], shape.positions[j])).toBe(false);
    }
  }
}

describe("the registry", () => {
  it("names four templates and gives each a default", () => {
    expect(TEMPLATE_IDS).toEqual(["rows", "arc", "islands", "u"]);
    for (const id of TEMPLATE_IDS) {
      expect(defaultTemplate(id).id).toBe(id);
    }
  });

  it("defaults to the grid phase 5 shipped", () => {
    expect(DEFAULT_TEMPLATE).toEqual({ id: "rows", rows: 5, cols: 6 });
  });

  it("builds a well-formed room from every default", () => {
    for (const id of TEMPLATE_IDS) expectWellFormed(defaultTemplate(id));
  });
});

describe("clampTemplate", () => {
  it("raises a parameter below its floor", () => {
    expect(clampTemplate({ id: "rows", rows: 0, cols: 0 })).toEqual({
      id: "rows",
      rows: 1,
      cols: 1,
    });
  });

  it("lowers a parameter above its ceiling", () => {
    expect(clampTemplate({ id: "rows", rows: 99, cols: 99 })).toMatchObject({
      rows: expect.any(Number),
      cols: 20,
    });
  });

  it("rounds a fractional parameter to an integer", () => {
    expect(clampTemplate({ id: "rows", rows: 3.7, cols: 2.2 })).toEqual({
      id: "rows",
      rows: 4,
      cols: 2,
    });
  });

  it("keeps the seat total within a class's ceiling", () => {
    for (const id of TEMPLATE_IDS) {
      const clamped = clampTemplate(defaultTemplate(id));
      expect(seatCount(clamped)).toBeLessThanOrEqual(MAX_POSITIONS);
    }
    const huge = clampTemplate({ id: "rows", rows: 20, cols: 20 });
    expect(seatCount(huge)).toBeLessThanOrEqual(MAX_POSITIONS);
  });

  it("is idempotent", () => {
    const once = clampTemplate({ id: "rows", rows: 40, cols: 40 });
    expect(clampTemplate(once)).toEqual(once);
  });
});

describe("rows", () => {
  it("lays a grid out at pitch", () => {
    const shape = buildRoom({ id: "rows", rows: 2, cols: 3 });
    expect(shape.positions).toEqual([
      { x: 1, y: 1 },
      { x: 1 + PITCH, y: 1 },
      { x: 1 + 2 * PITCH, y: 1 },
      { x: 1, y: 1 + PITCH },
      { x: 1 + PITCH, y: 1 + PITCH },
      { x: 1 + 2 * PITCH, y: 1 + PITCH },
    ]);
  });

  it("is well formed across its whole parameter range", () => {
    for (let rows = 1; rows <= 20; rows += 1) {
      for (let cols = 1; cols <= 20; cols += 1) {
        expectWellFormed(clampTemplate({ id: "rows", rows, cols }));
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/room-templates.test.ts`
Expected: FAIL — `Cannot find module './room-templates'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/room-templates.ts`. Only `rows` is implemented here; `arc`, `islands` and `u` are stubbed to throw so a missing branch is loud rather than silently empty — Tasks 3 and 4 fill them in.

```ts
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
```

- [ ] **Step 4: Narrow the test to what this task delivers**

The registry test builds a room from every default, and three of them throw until Tasks 3 and 4 land. Change that one test to cover only `rows` for now:

```ts
  it("builds a well-formed room from every default", () => {
    // Widened to every id in Task 4, once all four generators exist.
    expectWellFormed(defaultTemplate("rows"));
  });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/domain/room-templates.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/room-templates.ts src/domain/room-templates.test.ts
git commit -m "feat(room): the template union, its clamps, and the rows generator"
```

---

### Task 3: The arc generator

The template this whole phase exists for. Its spacing is derived, not guessed, and the test enumerates the entire parameter range rather than sampling it.

**Files:**
- Modify: `src/domain/room-templates.ts` (add `buildArc`, wire the `arc` branch)
- Test: `src/domain/room-templates.test.ts` (add an `arc` describe block)

**Interfaces:**
- Consumes: `ARC_SPACING`, `frame`, `Position` from `src/domain/room.ts`; `clampTemplate`, `seatCount`, `expectWellFormed` from Task 2.
- Produces: `buildRoom({ id: "arc", perRow, rows, curve })` returns a `RoomShape`.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/room-templates.test.ts`:

```ts
describe("arc", () => {
  it("curves: the ends of a row sit closer to the board than its middle", () => {
    const shape = buildRoom({ id: "arc", perRow: 9, rows: 1, curve: 5 });
    const ys = shape.positions.map((p) => p.y);
    const middle = ys[Math.floor(ys.length / 2)];
    expect(ys[0]).toBeLessThan(middle);
    expect(ys[ys.length - 1]).toBeLessThan(middle);
  });

  it("is symmetric about the middle of the row", () => {
    const shape = buildRoom({ id: "arc", perRow: 9, rows: 1, curve: 4 });
    const ys = shape.positions.map((p) => p.y);
    for (let i = 0; i < ys.length; i += 1) {
      expect(ys[i]).toBe(ys[ys.length - 1 - i]);
    }
  });

  it("puts the back row further from the board than the front", () => {
    const shape = buildRoom({ id: "arc", perRow: 6, rows: 3, curve: 3 });
    const rowStarts = [0, 6, 12].map((i) => shape.positions[i].y);
    expect(rowStarts[0]).toBeLessThan(rowStarts[1]);
    expect(rowStarts[1]).toBeLessThan(rowStarts[2]);
  });

  it("emits positions in reading order", () => {
    const shape = buildRoom({ id: "arc", perRow: 5, rows: 2, curve: 3 });
    const front = shape.positions.slice(0, 5);
    expect([...front].sort((a, b) => a.x - b.x)).toEqual(front);
  });

  it("is well formed across its ENTIRE parameter range, not a sample", () => {
    for (let perRow = 1; perRow <= 20; perRow += 1) {
      for (let rows = 1; rows <= 4; rows += 1) {
        for (let curve = 1; curve <= 5; curve += 1) {
          expectWellFormed(clampTemplate({ id: "arc", perRow, rows, curve }));
        }
      }
    }
  });

  it("is wider when the curve is shallow — which is why ROOM_MAX is 120", () => {
    const shallow = buildRoom({ id: "arc", perRow: 20, rows: 1, curve: 1 });
    const deep = buildRoom({ id: "arc", perRow: 20, rows: 1, curve: 5 });
    expect(shallow.width).toBeGreaterThan(deep.width);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/room-templates.test.ts -t arc`
Expected: FAIL — `room template not implemented: arc`.

- [ ] **Step 3: Write the implementation**

In `src/domain/room-templates.ts`, import `ARC_SPACING` alongside the existing imports from `./room`, add the generator, and replace the `arc` branch of `buildRoom` with `return frame(buildArc(t.perRow, t.rows, t.curve));`.

```ts
/**
 * The angular span of the arc, from the curve parameter: 15° at 1, 75° at 5.
 *
 * A shallow arc needs a huge radius to hold the same tables, so it comes out
 * WIDER than a deep one. That is not a bug and it is the reason ROOM_MAX is
 * 120 rather than the 60 a straight row of twenty would need.
 */
function arcSpan(curve: number): number {
  return (curve * Math.PI) / 12;
}

/**
 * Rows on concentric circles centred on the board.
 *
 * The radius comes OUT of the spacing rather than the other way round: fixing
 * the arc step at ARC_SPACING and solving `R = ARC_SPACING * (n - 1) / theta`
 * is what makes non-overlap arithmetic rather than a repair pass. A repair
 * pass that nudges colliding seats apart terminates on most inputs and
 * produces a visibly lumpy arc on the rest — the failure that ships, because
 * it still looks like an arc.
 *
 * Rows step by ARC_SPACING too, not by PITCH: at the ends of the arc the
 * radial direction is diagonal, so a radial gap of 3 lands as barely 2.4 on
 * its widest axis and rounding then eats it.
 */
function buildArc(perRow: number, rows: number, curve: number): Position[] {
  const theta = arcSpan(curve);
  // A single-seat row has no gap to hold open; give it any radius that keeps
  // the rows apart.
  const baseRadius = perRow > 1 ? (ARC_SPACING * (perRow - 1)) / theta : ARC_SPACING * rows;
  const positions: Position[] = [];
  for (let row = 0; row < rows; row += 1) {
    const radius = baseRadius + row * ARC_SPACING;
    for (let i = 0; i < perRow; i += 1) {
      // Angles run left to right so a row comes out in reading order.
      const angle = perRow > 1 ? -theta / 2 + (theta * i) / (perRow - 1) : 0;
      positions.push({
        x: Math.round(radius * Math.sin(angle)),
        y: Math.round(radius * Math.cos(angle)),
      });
    }
  }
  return positions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/room-templates.test.ts`
Expected: PASS. If the enumeration test reports an overlap, raise `ARC_SPACING` in `src/domain/room.ts` by one and re-run — that constant is the documented knob, and patching an individual case instead is the mistake this test exists to prevent.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/room-templates.ts src/domain/room-templates.test.ts
git commit -m "feat(room): the arc generator, spaced by derivation not by guess"
```

---

### Task 4: The islands and U generators

The last two shapes, and the point at which the registry test can cover all four.

**Files:**
- Modify: `src/domain/room-templates.ts` (add `buildIslands` and `buildU`, wire both branches)
- Test: `src/domain/room-templates.test.ts` (add two describe blocks, widen the registry test)

**Interfaces:**
- Consumes: `PITCH`, `frame`, `Position` from `src/domain/room.ts`; `clampTemplate`, `seatCount`, `expectWellFormed` from Task 2.
- Produces: `buildRoom` handles all four `TemplateId`s; the `throw` in `buildRoom` is gone.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/room-templates.test.ts`:

```ts
describe("islands", () => {
  it("clusters tables two wide", () => {
    const shape = buildRoom({ id: "islands", islands: 1, perIsland: 4 });
    const xs = new Set(shape.positions.map((p) => p.x));
    expect(xs.size).toBe(2);
  });

  it("puts an odd table alone on the last row of its island", () => {
    const shape = buildRoom({ id: "islands", islands: 1, perIsland: 5 });
    expect(shape.positions).toHaveLength(5);
    const lastRowY = Math.max(...shape.positions.map((p) => p.y));
    expect(shape.positions.filter((p) => p.y === lastRowY)).toHaveLength(1);
  });

  it("separates two islands by more than it separates tables inside one", () => {
    const shape = buildRoom({ id: "islands", islands: 2, perIsland: 2 });
    const xs = [...new Set(shape.positions.map((p) => p.x))].sort((a, b) => a - b);
    expect(xs).toHaveLength(4);
    expect(xs[2] - xs[1]).toBeGreaterThan(xs[1] - xs[0]);
  });

  it("is well formed across its entire parameter range", () => {
    for (let islands = 1; islands <= 12; islands += 1) {
      for (let perIsland = 2; perIsland <= 8; perIsland += 1) {
        expectWellFormed(clampTemplate({ id: "islands", islands, perIsland }));
      }
    }
  });
});

describe("u", () => {
  it("opens toward the board: the arms run up, the closed side is at the bottom", () => {
    const shape = buildRoom({ id: "u", cols: 5, rows: 3 });
    const maxY = Math.max(...shape.positions.map((p) => p.y));
    // The back row is full width.
    expect(shape.positions.filter((p) => p.y === maxY)).toHaveLength(5);
    // The row nearest the board holds only the two arm ends.
    const minY = Math.min(...shape.positions.map((p) => p.y));
    expect(shape.positions.filter((p) => p.y === minY)).toHaveLength(2);
  });

  it("counts cols + 2 * (rows - 1) seats", () => {
    expect(buildRoom({ id: "u", cols: 8, rows: 4 }).positions).toHaveLength(
      seatCount({ id: "u", cols: 8, rows: 4 }),
    );
  });

  it("degrades to a single row when there is only one row", () => {
    const shape = buildRoom({ id: "u", cols: 6, rows: 1 });
    expect(shape.positions).toHaveLength(6);
    expect(new Set(shape.positions.map((p) => p.y)).size).toBe(1);
  });

  it("is well formed across its entire parameter range", () => {
    for (let cols = 2; cols <= 20; cols += 1) {
      for (let rows = 1; rows <= 10; rows += 1) {
        expectWellFormed(clampTemplate({ id: "u", cols, rows }));
      }
    }
  });
});
```

Then widen the registry test back to all four:

```ts
  it("builds a well-formed room from every default", () => {
    for (const id of TEMPLATE_IDS) expectWellFormed(defaultTemplate(id));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/room-templates.test.ts`
Expected: FAIL — `room template not implemented: islands`.

- [ ] **Step 3: Write the implementation**

In `src/domain/room-templates.ts`, add both generators and replace the two remaining `buildRoom` branches with `return frame(buildIslands(t.islands, t.perIsland));` and `return frame(buildU(t.cols, t.rows));`. The `throw` disappears, and with it the `default` case — the switch is exhaustive over `TemplateId`, which is what makes adding a fifth template a type error rather than a silent empty room.

```ts
/** Islands sit in a grid of their own, this many across before wrapping. */
const ISLANDS_PER_BAND = 3;

/**
 * Clusters of tables, two wide.
 *
 * The gap BETWEEN islands has to read as bigger than the gap inside one, or
 * the room is just a grid with odd spacing — so islands step by twice pitch.
 */
function buildIslands(islands: number, perIsland: number): Position[] {
  const islandCols = 2;
  const islandRows = Math.ceil(perIsland / islandCols);
  const bandStep = { x: (islandCols + 2) * PITCH, y: (islandRows + 1) * PITCH };
  const positions: Position[] = [];
  for (let island = 0; island < islands; island += 1) {
    const originX = (island % ISLANDS_PER_BAND) * bandStep.x;
    const originY = Math.floor(island / ISLANDS_PER_BAND) * bandStep.y;
    for (let i = 0; i < perIsland; i += 1) {
      positions.push({
        x: originX + (i % islandCols) * PITCH,
        y: originY + Math.floor(i / islandCols) * PITCH,
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
  const backY = (rows - 1) * PITCH;
  for (let arm = 0; arm < rows - 1; arm += 1) {
    const y = arm * PITCH;
    positions.push({ x: 0, y });
    positions.push({ x: (cols - 1) * PITCH, y });
  }
  for (let col = 0; col < cols; col += 1) {
    positions.push({ x: col * PITCH, y: backY });
  }
  return positions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/room-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/room-templates.ts src/domain/room-templates.test.ts
git commit -m "feat(room): the islands and horseshoe generators"
```

---

### Task 5: `reseat`, the held union, and `resolveDrop` on seat ids

The interaction rules, still pure and still in the domain. Phase 5's `resolveDrop` is rewritten to address a table by id instead of by coordinates, and gains the branch that moves the furniture.

**Files:**
- Modify: `src/domain/room.ts`
- Test: `src/domain/room.test.ts`

**Interfaces:**
- Consumes: `Position`, `compareReadingOrder` from Task 1.
- Produces:
  - `interface Seated { id: string; x: number; y: number; studentId: string | null }` — the minimum a `Seat` row must look like for the domain to reason about it, so `src/domain/` never imports from `src/db/`
  - `occupantsInReadingOrder(seats: Seated[]): string[]`
  - `reseat(occupants: string[], positions: Position[]): { seats: { x: number; y: number; studentId: string | null }[]; overflow: string[] }`
  - `type Held = { kind: "pool"; studentId: string } | { kind: "seat"; seatId: string } | { kind: "table"; seatId: string }`
  - `type DropAction = { kind: "none" } | { kind: "seat"; studentId: string; seatId: string } | { kind: "swap"; fromSeatId: string; toSeatId: string } | { kind: "moveTable"; seatId: string; to: Position }`
  - `resolveDrop(held: Held, target: Seated | undefined): DropAction`
  - `resolveFloorDrop(held: Held, at: Position): DropAction`

- [ ] **Step 1: Write the failing test**

Append to `src/domain/room.test.ts`:

```ts
import {
  type Held,
  occupantsInReadingOrder,
  reseat,
  resolveDrop,
  resolveFloorDrop,
  type Seated,
} from "./room";

const seat = (id: string, x: number, y: number, studentId: string | null = null): Seated => ({
  id,
  x,
  y,
  studentId,
});

describe("occupantsInReadingOrder", () => {
  it("reads the room front to back, then left to right, skipping empty tables", () => {
    expect(
      occupantsInReadingOrder([
        seat("c", 6, 3, "p3"),
        seat("a", 0, 0, "p1"),
        seat("b", 3, 0, "p2"),
        seat("d", 0, 3, null),
      ]),
    ).toEqual(["p1", "p2", "p3"]);
  });
});

describe("reseat", () => {
  it("pours pupils into the new positions in order, so the front row stays in front", () => {
    const { seats, overflow } = reseat(
      ["p1", "p2"],
      [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 7, y: 1 },
      ],
    );
    expect(seats).toEqual([
      { x: 1, y: 1, studentId: "p1" },
      { x: 4, y: 1, studentId: "p2" },
      { x: 7, y: 1, studentId: null },
    ]);
    expect(overflow).toEqual([]);
  });

  it("returns the pupils who no longer fit rather than dropping them", () => {
    const { seats, overflow } = reseat(["p1", "p2", "p3"], [{ x: 1, y: 1 }]);
    expect(seats).toEqual([{ x: 1, y: 1, studentId: "p1" }]);
    expect(overflow).toEqual(["p2", "p3"]);
  });

  it("leaves an empty room empty", () => {
    expect(reseat([], [])).toEqual({ seats: [], overflow: [] });
  });
});

describe("resolveDrop", () => {
  const held: Record<string, Held> = {
    pool: { kind: "pool", studentId: "p1" },
    seat: { kind: "seat", seatId: "s1" },
    table: { kind: "table", seatId: "s1" },
  };

  it("does nothing when the target table is gone", () => {
    expect(resolveDrop(held.pool, undefined)).toEqual({ kind: "none" });
    expect(resolveDrop(held.seat, undefined)).toEqual({ kind: "none" });
  });

  it("seats a pupil held from the rail, displacing whoever is there", () => {
    expect(resolveDrop(held.pool, seat("s2", 4, 1, "p9"))).toEqual({
      kind: "seat",
      studentId: "p1",
      seatId: "s2",
    });
  });

  it("swaps a pupil held from a table", () => {
    expect(resolveDrop(held.seat, seat("s2", 4, 1, "p9"))).toEqual({
      kind: "swap",
      fromSeatId: "s1",
      toSeatId: "s2",
    });
  });

  it("degrades a swap onto an empty table to a move", () => {
    expect(resolveDrop(held.seat, seat("s2", 4, 1, null))).toEqual({
      kind: "swap",
      fromSeatId: "s1",
      toSeatId: "s2",
    });
  });

  it("does nothing when a held pupil is dropped back on their own table", () => {
    expect(resolveDrop(held.seat, seat("s1", 0, 0, "p1"))).toEqual({ kind: "none" });
  });

  it("does nothing when a held TABLE is dropped on another table", () => {
    // Furniture is moved onto floor, never onto furniture.
    expect(resolveDrop(held.table, seat("s2", 4, 1, null))).toEqual({ kind: "none" });
  });
});

describe("resolveFloorDrop", () => {
  it("moves a held table to the floor tapped", () => {
    expect(resolveFloorDrop({ kind: "table", seatId: "s1" }, { x: 6, y: 6 })).toEqual({
      kind: "moveTable",
      seatId: "s1",
      to: { x: 6, y: 6 },
    });
  });

  it("does nothing when a pupil is dropped on bare floor", () => {
    expect(resolveFloorDrop({ kind: "pool", studentId: "p1" }, { x: 6, y: 6 })).toEqual({
      kind: "none",
    });
    expect(resolveFloorDrop({ kind: "seat", seatId: "s1" }, { x: 6, y: 6 })).toEqual({
      kind: "none",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/room.test.ts`
Expected: FAIL — `reseat is not a function` and friends.

- [ ] **Step 3: Write the implementation**

Append to `src/domain/room.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/room.ts src/domain/room.test.ts
git commit -m "feat(room): reseat, the three-kind held union, and drops by seat id"
```

---

### Task 6: The data cutover

Schema v7, the new `Seat` and `SeatingLayout`, every write rewritten, the seed and the backup brought along, and the two plan components ported to the new shape so the build stays green. This task is large because it is atomic: the type change ripples through `src/db/` and the UI in one step, and a reviewer cannot approve half of it.

**Files:**
- Modify: `src/db/types.ts` (`Seat`, `SeatingLayout`)
- Modify: `src/db/index.ts` (`version(7)`, table typing, delete `seatKey`)
- Rewrite: `src/db/seating.ts`
- Rewrite: `src/db/seating.test.ts`
- Modify: `src/db/seed.ts:7` (import), `src/db/seed.ts:344-355` (layout and seats)
- Modify: `src/db/backup.ts` (`version: 7`, the `seats` zod shape, the rejection comment)
- Modify: `src/db/backup.test.ts` (every `seats:` fixture and the two seat `put`/`get` calls)
- Modify: `src/db/index.test.ts:43` (the compound-key round-trip test)
- Modify: `src/modules/plan/page.tsx`
- Modify: `src/modules/plan/components/seat-grid.tsx` → rename to `room-view.tsx`
- Modify: `src/modules/plan/components/layout-size-form.tsx` → rename to `room-template-form.tsx`
- Delete: `src/domain/seating.ts`, `src/domain/seating.test.ts`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  - `interface Seat { id: string; layoutId: string; x: number; y: number; studentId: string | null }`
  - `interface SeatingLayout { id: string; classId: string; width: number; height: number; updatedAt: number }`
  - `getOrCreateLayout(db, classId): Promise<SeatingLayout>`
  - `seatStudent(db, seatId, studentId): Promise<void>`
  - `swapSeats(db, aSeatId, bSeatId): Promise<void>`
  - `clearSeat(db, seatId): Promise<void>`
  - `addTable(db, layoutId, at: Position): Promise<Seat | null>`
  - `moveTable(db, seatId, to: Position): Promise<boolean>`
  - `removeTable(db, seatId): Promise<void>`
  - `applyTemplate(db, layoutId, shape: RoomShape): Promise<{ overflow: string[] }>`
  - `seatsForLayout(db, layoutId): Promise<Seat[]>`

- [ ] **Step 1: Write the failing test**

Replace `src/db/seating.test.ts` entirely:

```ts
import "fake-indexeddb/auto";
import { buildRoom } from "@domain/room-templates";
import { openWorkspaceDb } from ".";
import {
  addTable,
  applyTemplate,
  clearSeat,
  getOrCreateLayout,
  moveTable,
  removeTable,
  seatStudent,
  seatsForLayout,
  swapSeats,
} from "./seating";

function freshDb(name: string) {
  return openWorkspaceDb(`${name}-${crypto.randomUUID()}`);
}

describe("getOrCreateLayout", () => {
  it("stamps the default room the first time a class is looked at", async () => {
    const db = freshDb("layout");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    expect(seats).toHaveLength(30);
    expect(seats.every((s) => s.studentId === null)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    db.close();
  });

  it("is idempotent, so StrictMode cannot give one class two rooms", async () => {
    const db = freshDb("layout-once");
    const [a, b] = await Promise.all([
      getOrCreateLayout(db, "c1"),
      getOrCreateLayout(db, "c1"),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.seatingLayouts.where("classId").equals("c1").count()).toBe(1);
    db.close();
  });
});

describe("seatStudent", () => {
  it("seats a pupil and clears the table they held before", async () => {
    const db = freshDb("seat");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[5].id, "p1");
    expect((await db.seats.get(seats[0].id))?.studentId).toBeNull();
    expect((await db.seats.get(seats[5].id))?.studentId).toBe("p1");
    db.close();
  });

  it("writes nothing when the table has been removed by another tab", async () => {
    const db = freshDb("seat-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[0].id);
    await seatStudent(db, seats[0].id, "p1");
    expect(await db.seats.get(seats[0].id)).toBeUndefined();
    db.close();
  });
});

describe("swapSeats", () => {
  it("exchanges two occupants", async () => {
    const db = freshDb("swap");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await seatStudent(db, b.id, "p2");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBe("p2");
    expect((await db.seats.get(b.id))?.studentId).toBe("p1");
    db.close();
  });

  it("degrades to a move when the target is empty", async () => {
    const db = freshDb("swap-empty");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBeNull();
    expect((await db.seats.get(b.id))?.studentId).toBe("p1");
    db.close();
  });

  it("writes nothing when the source table is gone", async () => {
    const db = freshDb("swap-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, b.id, "p2");
    await removeTable(db, a.id);
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(b.id))?.studentId).toBe("p2");
    db.close();
  });
});

describe("addTable", () => {
  it("refuses a spot that overlaps an existing table", async () => {
    const db = freshDb("add-overlap");
    const layout = await getOrCreateLayout(db, "c1");
    const [first] = await seatsForLayout(db, layout.id);
    const before = (await seatsForLayout(db, layout.id)).length;
    expect(await addTable(db, layout.id, { x: first.x + 1, y: first.y })).toBeNull();
    expect(await seatsForLayout(db, layout.id)).toHaveLength(before);
    db.close();
  });

  it("refuses a spot outside the room", async () => {
    const db = freshDb("add-outside");
    const layout = await getOrCreateLayout(db, "c1");
    expect(await addTable(db, layout.id, { x: layout.width, y: 0 })).toBeNull();
    db.close();
  });

  it("adds an empty table where there is room", async () => {
    const db = freshDb("add-ok");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[0].id);
    const added = await addTable(db, layout.id, { x: seats[0].x, y: seats[0].y });
    expect(added).not.toBeNull();
    expect(added?.studentId).toBeNull();
    db.close();
  });
});

describe("moveTable", () => {
  it("keeps the table's id, so anything holding it keeps holding it", async () => {
    const db = freshDb("move");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[1].id);
    expect(await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y })).toBe(true);
    const moved = await db.seats.get(seats[0].id);
    expect(moved).toMatchObject({ x: seats[1].x, y: seats[1].y });
    db.close();
  });

  it("carries its occupant along", async () => {
    const db = freshDb("move-occupied");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await removeTable(db, seats[1].id);
    await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y });
    expect((await db.seats.get(seats[0].id))?.studentId).toBe("p1");
    db.close();
  });

  it("refuses a move onto another table and leaves the original where it was", async () => {
    const db = freshDb("move-overlap");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    expect(await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y })).toBe(false);
    expect(await db.seats.get(seats[0].id)).toMatchObject({ x: seats[0].x, y: seats[0].y });
    db.close();
  });
});

describe("removeTable", () => {
  it("removes the table, and its occupant is unseated by that alone", async () => {
    const db = freshDb("remove");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await removeTable(db, seats[0].id);
    expect(await db.seats.get(seats[0].id)).toBeUndefined();
    const remaining = await seatsForLayout(db, layout.id);
    expect(remaining.some((s) => s.studentId === "p1")).toBe(false);
    db.close();
  });
});

describe("applyTemplate", () => {
  it("replaces the room and keeps seated pupils in reading order", async () => {
    const db = freshDb("stamp");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = (await seatsForLayout(db, layout.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[1].id, "p2");

    const { overflow } = await applyTemplate(
      db,
      layout.id,
      buildRoom({ id: "arc", perRow: 8, rows: 1, curve: 3 }),
    );

    expect(overflow).toEqual([]);
    const after = (await seatsForLayout(db, layout.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    expect(after).toHaveLength(8);
    expect(after[0].studentId).toBe("p1");
    expect(after[1].studentId).toBe("p2");
    db.close();
  });

  it("reports the pupils who no longer fit", async () => {
    const db = freshDb("stamp-overflow");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[1].id, "p2");
    const { overflow } = await applyTemplate(
      db,
      layout.id,
      buildRoom({ id: "rows", rows: 1, cols: 1 }),
    );
    expect(overflow).toHaveLength(1);
    db.close();
  });

  it("resizes the room to the stamp", async () => {
    const db = freshDb("stamp-size");
    const layout = await getOrCreateLayout(db, "c1");
    const shape = buildRoom({ id: "u", cols: 6, rows: 3 });
    await applyTemplate(db, layout.id, shape);
    expect(await db.seatingLayouts.get(layout.id)).toMatchObject({
      width: shape.width,
      height: shape.height,
    });
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/db/seating.test.ts`
Expected: FAIL — `addTable is not exported` / type errors on the new `Seat` shape.

- [ ] **Step 3: Change the row types**

In `src/db/types.ts`, replace the `SeatingLayout` and `Seat` interfaces:

```ts
/** The room. One per class. Sized in half-tiles. */
export interface SeatingLayout {
  id: string;
  classId: string;
  width: number;
  height: number;
  updatedAt: number;
}

/**
 * One table, at a free position in half-tiles.
 *
 * Two states, not phase 5's three: a row with `studentId: null` is an empty
 * table and a row with a `studentId` is an occupied one. There is no third
 * "gap" state any more — an aisle is simply the absence of a table, which is
 * the absence of a row.
 *
 * `id` is what everything addresses a table by. Coordinates identified a cell
 * in phase 5 and that is exactly why `swapSeats` needed a guard against
 * another tab: a coordinate is a position, and this codebase's standing rule
 * is that state bound to a record is anchored to the record's identity.
 */
export interface Seat {
  id: string;
  layoutId: string;
  x: number;
  y: number;
  studentId: string | null;
}
```

- [ ] **Step 4: Bump the schema**

In `src/db/index.ts`: change the table typing on line 58 from `Table<Seat, [string, number, number]>` to `EntityTable<Seat, "id">`, delete the `seatKey` helper (lines 82–85), and append a new version block after the `version(6)` block:

```ts
  // v7 turns the room from a grid into free positions. Existing data is
  // disposable — there is no upgrade callback, so a v6 seat keyed [layoutId+
  // row+col] is garbage the wipe in Réglages clears. `&[layoutId+x+y]` is
  // unique: it is the database's own guarantee that two tables never share a
  // point, so a bug in `canPlace` surfaces as a rejected write rather than as
  // a pupil nobody can tap.
  db.version(7).stores({
    seats: "id, layoutId, studentId, &[layoutId+x+y]",
  });
```

Then fix the one compound-key test in `src/db/index.test.ts` (line 43 onward) to the new shape:

```ts
  it("refuses two tables at one point", async () => {
    const db = openWorkspaceDb("schema-v7-seat");
    await db.seats.put({ id: "s1", layoutId: "l1", x: 0, y: 0, studentId: null });
    await expect(
      db.seats.put({ id: "s2", layoutId: "l1", x: 0, y: 0, studentId: null }),
    ).rejects.toThrow();
    expect(await db.seats.where("layoutId").equals("l1").count()).toBe(1);
    db.close();
  });
```

- [ ] **Step 5: Rewrite the writes**

Replace `src/db/seating.ts` entirely:

```ts
import { canPlace, type Position, reseat, type RoomShape } from "@domain/room";
import { buildRoom, DEFAULT_TEMPLATE } from "@domain/room-templates";
import { occupantsInReadingOrder } from "@domain/room";
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
```

- [ ] **Step 6: Run the db test to verify it passes**

Run: `yarn test src/db/seating.test.ts src/db/index.test.ts`
Expected: PASS.

- [ ] **Step 7: Bring the seed along**

In `src/db/seed.ts`, replace the `@domain/seating` import on line 7 with `import { buildRoom, DEFAULT_TEMPLATE } from "@domain/room-templates";`, and replace the layout/seat block (lines 344–355) with:

```ts
    const layoutId = id();
    const shape = buildRoom(DEFAULT_TEMPLATE);
    seatingLayouts.push({
      id: layoutId,
      classId: schoolClass.id,
      width: shape.width,
      height: shape.height,
      updatedAt: now,
    });
    shape.positions.forEach((position, i) => {
      seats.push({
        id: id(),
        layoutId,
        x: position.x,
        y: position.y,
        studentId: classStudents[i]?.id ?? null,
      });
    });
```

Run: `yarn test src/db/seed.test.ts`
Expected: PASS.

- [ ] **Step 8: Bring the backup along**

In `src/db/backup.ts`: change `version: 6` to `version: 7` in the `WorkspaceBackup` interface, change `z.literal(6)` to `z.literal(7)`, extend the rejection comment with `, and version 6 the rectangular seating grid`, and replace the `seats` zod shape:

```ts
  seats: z.array(
    z
      .object({
        id: z.string(),
        layoutId: z.string(),
        x: z.number(),
        y: z.number(),
        studentId: z.string().nullable(),
      })
      .loose(),
  ),
```

Then in `src/db/backup.test.ts`, change every `version: 6` fixture to `version: 7`, and update the three seat rows:

- line ~278: `await db.seats.put({ id: "s1", layoutId: "l1", x: 2, y: 2, studentId: "p1" });`
- line ~287: `expect(await db.seats.get("s1")).toMatchObject({ studentId: "p1" });`
- line ~347: `await db.seats.put({ id: "s1", layoutId: "l1", x: 0, y: 0, studentId: "p1" });`
- line ~441: `corrupted.seats = [{ id: "s1", layoutId: "l1", x: 0 }];`

Run: `yarn test src/db/backup.test.ts`
Expected: PASS, including the two guards that assert the export carries an array for every table in `db.tables` and that a seed → export → wipe → import round trip preserves every count.

- [ ] **Step 9: Port the plan page and its two components**

This step keeps the app compiling and working with the new shape; the template picker, floor placement and scaling arrive in Tasks 7–9.

Delete `src/domain/seating.ts` and `src/domain/seating.test.ts`.

Rename `src/modules/plan/components/seat-grid.tsx` to `room-view.tsx`. Its props become:

```tsx
export function RoomView({
  layout,
  seats,
  studentsById,
  held,
  onHoldSeat,
  onDropSeat,
  onSelectStudent,
  editing,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  studentsById: Map<string, Student>;
  held: Held | null;
  onHoldSeat: (seatId: string) => void;
  onDropSeat: (seatId: string) => void;
  onSelectStudent: (studentId: string) => void;
  editing: boolean;
})
```

Replace the CSS-grid container and the `cells` loop with an absolutely positioned canvas. `UNIT_PX = 36`, so a table renders 72 × 72 and every position multiplies straight through. Tables are sorted with `compareReadingOrder` before rendering, so the DOM order is the reading order and Tab moves front-to-back through the room:

```tsx
const UNIT_PX = 36;

// The board is fixed at the top and is not a control: an arc and a U are
// meaningless without something to face, and this is the whole of the
// orientation model.
<div className="paper overflow-auto rounded-md border border-border p-2">
  <div
    className="relative"
    style={{ width: layout.width * UNIT_PX, height: layout.height * UNIT_PX }}
  >
    <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-center rounded bg-bg-hover font-medium text-text-faint text-xs tracking-wide">
      {t("plan.board")}
    </div>
    {[...seats].sort(compareReadingOrder).map((seat) => (
      <div
        key={seat.id}
        className="absolute"
        style={{
          left: seat.x * UNIT_PX,
          top: seat.y * UNIT_PX,
          width: TABLE * UNIT_PX,
          height: TABLE * UNIT_PX,
        }}
      >
        {/* the existing empty-table / stale-pupil / occupied-table branches,
            with every `onDrop(row, col)` now `onDropSeat(seat.id)`, every
            `onHoldSeat(row, col)` now `onHoldSeat(seat.id)`, `isHeldSeat`
            computed from `held?.seatId === seat.id`, and the `×` calling
            `removeTable` instead of `makeGap`/`clearSeat` */}
      </div>
    ))}
  </div>
</div>
```

The gap branch — the `if (!seat)` block that rendered `plan.makeSeat` — is deleted outright. There are no cells to be absent any more.

Rename `layout-size-form.tsx` to `room-template-form.tsx`, and for now reduce it to the `rows` template so the build is green: two number inputs bound to `{ rows, cols }`, `clampTemplate` on every change, `buildRoom` for the preview, `seatCount(template) < seatedCount` driving the existing `plan.resizeWarning` line, and `applyTemplate` on submit. Keep `key={layout.id}`, keep `useEscape(onDone)`, keep the `autoFocus` on the first field with its existing biome-ignore comment.

In `src/modules/plan/page.tsx`: import `Held`, `resolveDrop`, `resolveFloorDrop`, `unseatedStudentIds` from `@domain/room` (move `unseatedStudentIds` there from the deleted `seating.ts` — it is unchanged apart from reading `seats` that no longer have `row`/`col`), and rewrite `onDrop`:

```tsx
  const onDropSeat = async (seatId: string): Promise<void> => {
    if (held === null) return;
    // One drop per hold. `setHeld(null)` only lands after the await, and a
    // second tap runs a closure that already captured the old `held` — so
    // holding table A and tapping B then C would write both swaps, moving a
    // pupil the teacher never touched. Only a ref read at call time can stop it.
    if (dropping.current) return;
    dropping.current = true;
    try {
      const action = resolveDrop(held, seats.find((s) => s.id === seatId));
      if (action.kind === "seat") {
        await seatStudent(db, action.seatId, action.studentId);
      } else if (action.kind === "swap") {
        await swapSeats(db, action.fromSeatId, action.toSeatId);
      }
    } catch (error) {
      // No blocking dialog — they are banned. A failed write must still end
      // the gesture rather than stranding a pupil in the teacher's hand.
      console.error(error);
    } finally {
      setHeld(null);
      dropping.current = false;
    }
  };
```

`onMove` on the pupil card becomes `setHeld({ kind: "seat", seatId: seat.id })` where `seat` is found by `studentId`.

- [ ] **Step 10: Add and remove the i18n keys**

In both `src/i18n/locales/fr.json` and `en.json`, under `plan`: add `board` (`"Tableau"` / `"Board"`), and delete `makeGap`, `makeSeat` and `rows`/`cols` only once Task 7 replaces them — for now keep `rows` and `cols`, and delete `makeSeat` and `makeGap`, replacing `clearSeat` with `removeTable` (`"Retirer la table"` / `"Remove the table"`).

- [ ] **Step 11: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green. The i18n parity test is part of `yarn test` and will fail if a key exists in one locale only.

- [ ] **Step 12: Verify in a browser**

Run `yarn dev` and open `http://localhost:3000/classes/<a class id>/plan`. Confirm: the room renders as tables at positions with a TABLEAU bar at the top; a pupil can be picked from the rail and seated; two seated pupils swap; a bare tap on a seated pupil still opens their card; `Déplacer` picks them up; the `×` in edit mode removes a table and its occupant returns to the rail.

- [ ] **Step 13: Commit**

```bash
git add -A src/db src/domain src/modules/plan src/i18n
git commit -m "feat(room): tables at free positions, addressed by id"
```

---

### Task 7: The template picker

The form that lets a teacher say "arc" instead of "5 by 6", with the seat count and the overflow warning both live.

**Files:**
- Modify: `src/modules/plan/components/room-template-form.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `TEMPLATE_IDS`, `TemplateId`, `RoomTemplate`, `defaultTemplate`, `clampTemplate`, `seatCount`, `buildRoom` from Task 2–4; `applyTemplate` from Task 6.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add the translation keys**

In both locale files, under `plan`, add:

```json
"template": "Disposition",
"templateRows": "Rangées",
"templateArc": "Arc de cercle",
"templateIslands": "Îlots",
"templateU": "Fer à cheval",
"paramRows": "Rangées",
"paramCols": "Colonnes",
"paramPerRow": "Places par rang",
"paramCurve": "Courbure",
"paramIslands": "Îlots",
"paramPerIsland": "Places par îlot",
"seatCount_one": "{{count}} place",
"seatCount_other": "{{count}} places",
"apply": "Appliquer"
```

with the English values `"Layout"`, `"Rows"`, `"Arc"`, `"Islands"`, `"Horseshoe"`, `"Rows"`, `"Columns"`, `"Seats per row"`, `"Curve"`, `"Islands"`, `"Seats per island"`, `"{{count}} seat"`, `"{{count}} seats"`, `"Apply"`.

Keep the existing `plan.resizeWarning_one` / `_other` — the overflow warning reuses them unchanged.

- [ ] **Step 2: Write the form**

Replace the body of `src/modules/plan/components/room-template-form.tsx`:

```tsx
/**
 * Pick a room shape and stamp it.
 *
 * The template is LOCAL state and is never stored: applying it is a one-way
 * write, and nothing anywhere records that a room "is an arc". Keyed on
 * `layout.id` by the caller, so switching rooms cannot leave a template
 * captured at mount.
 */
export function RoomTemplateForm({
  layout,
  seats,
  onDone,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [template, setTemplate] = useState<RoomTemplate>(DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);

  useEscape(onDone);

  const seated = seats.filter((seat) => seat.studentId !== null).length;
  const total = seatCount(template);
  // Exactly the count `reseat` would hand back — computed here so the warning
  // arrives BEFORE the destructive write, not after it.
  const overflow = Math.max(0, seated - total);

  const set = (patch: Partial<RoomTemplate>): void =>
    setTemplate((current) => clampTemplate({ ...current, ...patch } as RoomTemplate));

  const apply = async (): Promise<void> => {
    setSaving(true);
    try {
      await applyTemplate(db, layout.id, buildRoom(template));
      onDone();
    } finally {
      setSaving(false);
    }
  };
  // …render: a <select> over TEMPLATE_IDS calling
  // setTemplate(defaultTemplate(e.target.value as TemplateId)), then the
  // number inputs for the selected template's own parameters, then the live
  // seat count, the overflow warning, and Apply / Cancel.
}
```

The parameter inputs are per template — render only the ones the current `template.id` carries:

```tsx
{template.id === "rows" && (
  <>
    <NumberField label={t("plan.paramRows")} value={template.rows} onChange={(rows) => set({ rows })} autoFocus />
    <NumberField label={t("plan.paramCols")} value={template.cols} onChange={(cols) => set({ cols })} />
  </>
)}
{template.id === "arc" && (
  <>
    <NumberField label={t("plan.paramPerRow")} value={template.perRow} onChange={(perRow) => set({ perRow })} autoFocus />
    <NumberField label={t("plan.paramRows")} value={template.rows} onChange={(rows) => set({ rows })} />
    <NumberField label={t("plan.paramCurve")} value={template.curve} onChange={(curve) => set({ curve })} />
  </>
)}
{template.id === "islands" && (
  <>
    <NumberField label={t("plan.paramIslands")} value={template.islands} onChange={(islands) => set({ islands })} autoFocus />
    <NumberField label={t("plan.paramPerIsland")} value={template.perIsland} onChange={(perIsland) => set({ perIsland })} />
  </>
)}
{template.id === "u" && (
  <>
    <NumberField label={t("plan.paramCols")} value={template.cols} onChange={(cols) => set({ cols })} autoFocus />
    <NumberField label={t("plan.paramRows")} value={template.rows} onChange={(rows) => set({ rows })} />
  </>
)}
```

`NumberField` is a small local component in the same file — a `<label>` wrapping `<input type="number" className="field w-20">` that calls `onChange(Number(e.target.value))`. It carries no clamping of its own: `clampTemplate` in the domain is the only place a range is known, which is the same reason the subject palette and the period names are not in a component.

The seat count renders as `t("plan.seatCount", { count: total })` and the warning, unchanged from phase 5, as `t("plan.resizeWarning", { count: overflow })` when `overflow > 0`.

- [ ] **Step 3: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 4: Verify in a browser**

Run `yarn dev`, open a class's plan, click `Modifier le plan`. Stamp each of the four templates in turn and confirm: the seat count updates as parameters change; a template with fewer seats than there are seated pupils shows the warning with the right number; applying it keeps the front-row pupils in front; Cancel and Escape both leave without writing.

- [ ] **Step 5: Commit**

```bash
git add src/modules/plan/components/room-template-form.tsx src/i18n/locales
git commit -m "feat(room): a template picker with a live seat count"
```

---

### Task 8: Moving the furniture

Floor placement and the arrow-key nudge — the half of the feature that makes free positioning free.

**Files:**
- Modify: `src/modules/plan/components/room-view.tsx`
- Modify: `src/modules/plan/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `resolveFloorDrop`, `canPlace`, `TABLE` from `@domain/room`; `addTable`, `moveTable` from `@db/seating`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add the translation keys**

In both locale files, under `plan`: `addTable` (`"Ajouter une table"` / `"Add a table"`), `holdTable` (`"Déplacer la table"` / `"Move the table"`), `hintTable` (`"Posez la table, ou ajustez-la aux flèches."` / `"Drop the table, or nudge it with the arrow keys."`).

- [ ] **Step 2: Render the floor**

In `room-view.tsx`, add — rendered only when `editing` — a grid of floor buttons at whole-tile coordinates where a table would fit:

```tsx
/**
 * Where a table could go.
 *
 * Whole-tile coordinates only (even x and y): tapping is a one-tile-precision
 * gesture, and the odd coordinates an arc uses are reached with the arrow keys
 * instead. Computing them from the pointer offset was the obvious alternative
 * and is unreachable without a mouse.
 *
 * Bounded by the room the template actually stamped, never by ROOM_MAX.
 */
function floorSlots(layout: SeatingLayout, seats: Seat[]): Position[] {
  const slots: Position[] = [];
  for (let y = 0; y + TABLE <= layout.height; y += TABLE) {
    for (let x = 0; x + TABLE <= layout.width; x += TABLE) {
      if (canPlace(seats, { x, y }, layout)) slots.push({ x, y });
    }
  }
  return slots;
}
```

Each slot renders as a dashed 44px-minimum button positioned the same way a table is, labelled `t("plan.addTable")` when nothing is held and `t("plan.moveHere")` when a table is. Its click calls a new `onDropFloor(position)` prop.

A held table excludes itself from the collision set, or the slot it currently sits on is the one place it cannot move to: pass `seats.filter((s) => s.id !== heldTableId)` into `floorSlots` when `held?.kind === "table"`.

- [ ] **Step 3: Wire the page**

In `page.tsx`, add the floor handler beside `onDropSeat`, sharing the same `dropping` ref so one hold still produces one write:

```tsx
  const onDropFloor = async (at: Position): Promise<void> => {
    if (held === null || dropping.current) return;
    dropping.current = true;
    try {
      const action = resolveFloorDrop(held, at);
      if (action.kind === "moveTable") await moveTable(db, action.seatId, action.to);
    } catch (error) {
      console.error(error);
    } finally {
      setHeld(null);
      dropping.current = false;
    }
  };
```

Adding a table is a separate control from dropping one, so when nothing is held the same floor button calls `addTable(db, layout.id, at)` directly — a refused placement returns `null` and nothing happens, which is the correct outcome of tapping too close to a neighbour.

Picking a table up: in edit mode, tapping a table already calls `onHoldSeat(seat.id)`. Change the page's handler to set `{ kind: "table", seatId }` when `editing`, and `{ kind: "seat", seatId }` otherwise — a held table moves furniture, a held pupil moves a pupil, and the mode is what distinguishes them.

- [ ] **Step 4: Add the arrow-key nudge**

In `page.tsx`, a keyboard effect active only while a table is held:

```tsx
  // Half-tile precision by keyboard. Tapping the floor is whole-tile only, so
  // without this the odd coordinates an arc uses would be unreachable to
  // anyone not using a pointer — and unreachable to everyone for fine
  // adjustment.
  useEffect(() => {
    if (held?.kind !== "table") return;
    const deltas: Record<string, Position> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    function onKeyDown(event: KeyboardEvent): void {
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const seat = seats.find((s) => s.id === heldSeatId);
      if (!seat) return;
      void moveTable(db, seat.id, { x: seat.x + delta.x, y: seat.y + delta.y });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [db, held, seats]);
```

`moveTable` already refuses a nudge that would overlap or leave the room, so a key held down against the wall writes nothing rather than needing its own bounds check. Enter is not bound: the move has already been written by the time the key is released, so committing is releasing, and `useEscape` already clears the hold.

Extend the rail's hint to name the rule that now applies — `held?.kind === "table"` gives `t("plan.hintTable")`.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Verify in a browser**

Run `yarn dev`, open a plan, enter `Modifier le plan`. Confirm: floor slots appear; tapping one adds a table; tapping a table picks it up and the hint changes; tapping floor moves it; arrow keys nudge it one half-tile at a time; a nudge into a neighbour or off the edge does nothing; Escape releases; leaving edit mode releases.

- [ ] **Step 7: Commit**

```bash
git add src/modules/plan src/i18n/locales
git commit -m "feat(room): place and nudge the furniture"
```

---

### Task 9: Scale to fit, and the empty room

The last of the rendering. Without scaling, the flagship case of this phase — a wide arc — does not fit on the device it is used on.

**Files:**
- Modify: `src/modules/plan/components/room-view.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: everything from Task 6–8.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Add the translation key**

In both locale files, under `plan`: `emptyRoom` (`"Cette salle n'a aucune table. Choisissez une disposition pour la remplir."` / `"This room has no tables. Pick a layout to fill it."`).

- [ ] **Step 2: Scale the canvas**

In `room-view.tsx`, measure the wrapper and scale the canvas down to fit:

```tsx
/**
 * Fit the room to the screen.
 *
 * At ARC_SPACING = 5, an eighteen-seat arc is ninety units across — over
 * 3000px, which no tablet scrolls comfortably mid-lesson. Never scales ABOVE
 * 1: a four-table room stays its natural size rather than ballooning to fill
 * the screen.
 */
function useFitScale(roomWidthPx: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      setScale(available > 0 ? Math.min(1, available / roomWidthPx) : 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [roomWidthPx]);
  return [ref, scale];
}
```

Apply it with `transform: scale(scale)` and `transformOrigin: "top left"` on the canvas, and set the wrapper's height to `layout.height * UNIT_PX * scale` so the scaled canvas does not leave a tall empty gap under itself.

- [ ] **Step 3: Render the empty room**

When `seats.length === 0` and not editing, render the board bar and `t("plan.emptyRoom")` centred in the canvas rather than an empty box. In edit mode the floor slots already fill it, so the message is suppressed.

- [ ] **Step 4: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 5: Verify in a browser**

Run `yarn dev`. Stamp an arc of 20 per row at curve 1 and confirm the whole room is visible without horizontal scrolling; narrow the window and confirm it scales down further; stamp a 2 × 2 grid and confirm it does not scale up. Remove every table and confirm the empty-room line appears.

- [ ] **Step 6: Commit**

```bash
git add src/modules/plan/components/room-view.tsx src/i18n/locales
git commit -m "feat(room): scale the room to fit, and say when it is empty"
```

---

### Task 10: Documentation

`CLAUDE.md` describes a three-state `Seat` and a rectangular grid that no longer exist. A guide that is wrong is worse than no guide, because it is trusted.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Rewrite the seat-states paragraph**

In `CLAUDE.md`, replace the paragraph beginning "A `Seat` row encodes three states" with the two-state version, and state plainly that the third state is gone and why: it existed only because a grid forces every cell to exist.

- [ ] **Step 2: Rewrite the seating-plan paragraph**

Replace the paragraph beginning "The seating plan's gesture is pick-up-then-place" so it describes: `resolveDrop` and `resolveFloorDrop` in `src/domain/room.ts` rather than `src/domain/seating.ts`; the three-kind `Held`; templates that stamp and do not live; `PITCH` versus `ARC_SPACING` and the per-axis rounding argument in one sentence; and that `swapSeats` no longer takes an `expectedStudentId` because a table has an id.

- [ ] **Step 3: Update the schema paragraph**

In the `src/db/` section, change "Nineteen tables across five `db.version(...)` calls" to six calls, and add: `version(7)` reshapes `seats` to free positions keyed by id with a unique `[layoutId+x+y]`.

- [ ] **Step 4: Update the known-gaps list**

In `CLAUDE.md`'s "Known v1 gaps": delete "The seating plan has no drag and drop, and no fill mode with automatic arrangements" — the arrangements now exist — and replace it with a line saying drag and drop is still deliberately absent, and that a room cannot yet be saved as a named layout reusable by another class.

In `docs/BACKLOG.md`, leave #4 (one seating layout per class) standing — it is still true — and add an entry for named reusable rooms.

- [ ] **Step 5: Run the validation gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/BACKLOG.md
git commit -m "docs: the room replaces the grid"
```

---

## Self-Review

**Spec coverage.** Templates stamp rather than live → Tasks 2–4, 7. Two seat states → Task 6 Step 3. Board fixed at top → Task 6 Step 9. Half-tile integers → Task 1. Data model and schema v7 → Task 6 Steps 3–4. Backup v7 → Task 6 Step 8. Table identity replacing `expectedStudentId` → Task 6 Step 5. `PITCH` / `ARC_SPACING` and the enumerating test → Tasks 1, 3. The four templates and their clamps → Tasks 2–4. `reseat` → Task 5, wired in Task 6. Three-kind `Held` and both `resolveDrop`s → Task 5. Floor buttons and the arrow nudge → Task 8. Unit 36px, scale to fit, reading-order DOM, empty room → Tasks 6, 9. Documentation → Task 10.

**Known deviation from the spec.** `frame` clamps to `ROOM_MAX` rather than the generators refusing to exceed it, since every clamped template is well inside 120 and the test asserts it. If a future template can exceed it, the refusal belongs in `clampTemplate`, not in `frame`.

**Type consistency.** `Position`, `RoomShape`, `Seated`, `Held`, `DropAction`, `RoomTemplate`, `TemplateId` are defined once and referenced by those names throughout. `onDropSeat` / `onDropFloor` / `onHoldSeat` are the prop names in both Task 6 and Task 8. `buildRoom`, `clampTemplate`, `seatCount`, `defaultTemplate`, `DEFAULT_TEMPLATE` keep their signatures from Task 2 through Task 7.
