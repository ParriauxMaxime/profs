# Salles et plans de table — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the seating plan into a shared **salle** (furniture, no pupils) and a per-class **plan** (pupils, no furniture), so each screen has one mode and a tap has one meaning.

**Architecture:** Four Dexie stores replace two — `Room` / `Desk` / `SeatingPlan` / `Assignment` — with the assignment keyed `[planId+deskId]` exactly as `Grade` is. `Held` collapses to one rule with a null in it. Furniture editing moves to `/salles/:roomId`, drag-first with a retained tap path. Adjacent desks render as one table; the merge is a rendering, never a datum.

**Tech Stack:** React 19, Dexie 4 + `dexie-react-hooks`, Chicane router, Tailwind 4 via rspack, Jest + `fake-indexeddb`, Biome, i18next.

**Spec:** `docs/superpowers/specs/2026-09-08-profs-salles-and-plans-design.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN, no external font or image. This is a documented promise in `README.md` and `PRIVACY.md`.
- **Validation gate — all four green before a task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- **Node is not on `PATH` in non-interactive shells.** Prefix every command with `export PATH="/Users/zoidberg/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"` or run `fnm exec --using=v24.20.0 -- <cmd>`.
- **Never `window.confirm`, `alert`, or any blocking dialog.** Destructive actions use `ConfirmButton` (two-step, in place).
- **Schema doctrine:** add a table, bump the version, write no upgrade function. A store whose **shape** changed must be dropped to `null` in its own version before the new shape is declared in the next.
- **i18n parity:** every key must exist in BOTH `src/i18n/locales/fr.json` and `en.json`, or the parity test fails. Plurals use `_one` / `_other`. Never pass an interpolation variable named `count` unless plural resolution is wanted.
- **Identifiers are English; only translation values are French.**
- **Pupil names render only through `PupilName`.** Capitals are CSS, never `toUpperCase()`.
- **IDs from `crypto.randomUUID()`; timestamps from `Date.now()`.**
- **State bound to a record is anchored to that record's id, never to its position in a list.**
- **There are deliberately no component tests.** Domain and `src/db` are TDD; UI is verified by driving a real browser against `yarn dev` on port 3000. UI tasks below say what to check in the browser instead of asserting a test.

## File Structure

**Domain (pure — no React, no Dexie):**
- `src/domain/room.ts` — MODIFY. Keeps `TABLE`, `PITCH`, `ARC_SPACING`, `overlaps`, `fitsRoom`, `canPlace`, `compareReadingOrder`, `frame`, `reseat`, `occupantsInReadingOrder`, `unseatedStudentIds`. Gains `AISLE`, `ROW_GAP`, `TableGroup`, `tableGroups`, `HeldPupil`, `Placement`, `resolvePlacement`. Loses `Held`, `DropAction`, `resolveDrop`, `resolveFloorDrop`.
- `src/domain/room-templates.ts` — MODIFY. Generators space between *groups*, not between desks.
- `src/domain/active-room.ts` — CREATE, from `active-layout.ts`. Keyed class → salle.
- `src/domain/active-layout.ts` — DELETE (Task 7).

**Database:**
- `src/db/types.ts` — MODIFY. `Room` re-shaped; `Desk`, `SeatingPlan`, `Assignment` added; `SeatingLayout`, `Seat` removed (Task 7).
- `src/db/index.ts` — MODIFY. `version(10)` drops `rooms`; `version(11)` declares the four; `version(12)` drops `seats` and `seatingLayouts`.
- `src/db/rooms.ts` — REWRITE. Rooms and their desks.
- `src/db/plans.ts` — CREATE. Plans and assignments.
- `src/db/cascade.ts` — MODIFY. `deleteRoom` added; `deleteClass` and `deleteStudent` updated.
- `src/db/backup.ts` — MODIFY. Four tables in and two out of the export literal.
- `src/db/seed.ts` — MODIFY. Seeds one salle with desks, and a plan per class.
- `src/db/seating.ts` — DELETE (Task 7).

**Screens:**
- `src/modules/rooms/page.tsx` — CREATE. `/salles`, the list.
- `src/modules/rooms/editor.tsx` — CREATE. `/salles/:roomId`, the furniture editor.
- `src/modules/rooms/components/room-canvas.tsx` — CREATE. The floor, the scale, the board, the merged tables. Shared by the editor and the plan tab; owns no gesture.
- `src/modules/plan/page.tsx` — REWRITE. Pupils only.
- `src/modules/plan/components/student-card.tsx` — MODIFY. *Déplacer* primary, *Retirer de sa place* added.
- `src/modules/plan/components/room-view.tsx` — DELETE, replaced by `room-canvas` plus a thin pupil layer.
- `src/modules/plan/components/{layout-bar,saved-rooms-bar,room-template-form}.tsx` — DELETE.
- `src/modules/settings/components/room-section.tsx` — DELETE (Task 3).
- `src/router.ts`, `src/modules/shared/components/app-drawer.tsx` — MODIFY.
- `src/styles/global.css` — MODIFY. Room material tokens, both themes.

---

### Task 1: The one placement rule

**Files:**
- Modify: `src/domain/room.ts`
- Test: `src/domain/room.test.ts`

**Interfaces:**
- Consumes: `Seated` (already in `room.ts`).
- Produces:
  - `interface HeldPupil { studentId: string; fromDeskId: string | null }`
  - `type Placement = { kind: "none" } | { kind: "place"; studentId: string; deskId: string; displaced: { studentId: string; deskId: string | null } | null }`
  - `function resolvePlacement(held: HeldPupil, target: Seated | undefined): Placement`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/room.test.ts`:

```ts
describe("resolvePlacement", () => {
  const held = (studentId: string, fromDeskId: string | null): HeldPupil => ({
    studentId,
    fromDeskId,
  });
  const desk = (id: string, studentId: string | null): Seated => ({ id, x: 0, y: 0, studentId });

  it("refuses a drop on nothing", () => {
    expect(resolvePlacement(held("s1", null), undefined)).toEqual({ kind: "none" });
  });

  it("refuses a drop on the desk the pupil was lifted from", () => {
    expect(resolvePlacement(held("s1", "d1"), desk("d1", "s1"))).toEqual({ kind: "none" });
  });

  it("seats a pupil from the rail on an empty desk", () => {
    expect(resolvePlacement(held("s1", null), desk("d1", null))).toEqual({
      kind: "place",
      studentId: "s1",
      deskId: "d1",
      displaced: null,
    });
  });

  it("displaces an occupant to the rail when the pupil came from the rail", () => {
    expect(resolvePlacement(held("s1", null), desk("d1", "s2"))).toEqual({
      kind: "place",
      studentId: "s1",
      deskId: "d1",
      displaced: { studentId: "s2", deskId: null },
    });
  });

  it("swaps when the pupil came from a desk", () => {
    expect(resolvePlacement(held("s1", "d0"), desk("d1", "s2"))).toEqual({
      kind: "place",
      studentId: "s1",
      deskId: "d1",
      displaced: { studentId: "s2", deskId: "d0" },
    });
  });

  it("degrades a swap to a move when the target is empty", () => {
    expect(resolvePlacement(held("s1", "d0"), desk("d1", null))).toEqual({
      kind: "place",
      studentId: "s1",
      deskId: "d1",
      displaced: null,
    });
  });
});
```

Add `HeldPupil`, `Placement` and `resolvePlacement` to the file's import list at the top of the test.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="/Users/zoidberg/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/domain/room.test.ts -t "resolvePlacement"
```

Expected: FAIL — `resolvePlacement is not a function`.

- [ ] **Step 3: Implement**

In `src/domain/room.ts`, replace `Held`, `DropAction`, `resolveDrop` and `resolveFloorDrop` with:

```ts
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
 * general one with an empty origin.
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
```

Delete the now-unused `Held`, `DropAction`, `resolveDrop` and `resolveFloorDrop`, and their tests in `room.test.ts`.

- [ ] **Step 4: Run the whole domain suite**

```bash
yarn test src/domain/room.test.ts
```

Expected: PASS. `yarn typecheck` will still fail because `plan/page.tsx` imports `resolveDrop` — that is expected and fixed in Task 6. To keep this task's gate green, temporarily leave `Held`/`resolveDrop`/`resolveFloorDrop` in place *as well* and delete them in Task 7.

- [ ] **Step 5: Full gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/room.ts src/domain/room.test.ts
git commit -m "feat(room): one placement rule, with the rail as its null case"
```

---

### Task 2: Adjacent desks are one table

**Files:**
- Modify: `src/domain/room.ts`
- Test: `src/domain/room.test.ts`

**Interfaces:**
- Produces:
  - `interface TableGroup { desks: Seated[]; x: number; y: number; width: number; height: number }`
  - `function tableGroups(desks: Seated[]): TableGroup[]`

Two desks belong to the same table when they share a full edge: `(|dx| === TABLE && dy === 0) || (|dy| === TABLE && dx === 0)`. Groups come back in reading order, and each group's `desks` are in reading order within it.

- [ ] **Step 1: Write the failing tests**

```ts
describe("tableGroups", () => {
  const at = (id: string, x: number, y: number): Seated => ({ id, x, y, studentId: null });

  it("returns nothing for an empty room", () => {
    expect(tableGroups([])).toEqual([]);
  });

  it("leaves a lone desk as a group of one", () => {
    const groups = tableGroups([at("a", 0, 0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ x: 0, y: 0, width: TABLE, height: TABLE });
  });

  it("joins two desks that share a vertical edge", () => {
    const groups = tableGroups([at("a", 0, 0), at("b", TABLE, 0)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].desks.map((d) => d.id)).toEqual(["a", "b"]);
    expect(groups[0]).toMatchObject({ width: TABLE * 2, height: TABLE });
  });

  it("joins two desks that share a horizontal edge", () => {
    const groups = tableGroups([at("a", 0, 0), at("b", 0, TABLE)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ width: TABLE, height: TABLE * 2 });
  });

  it("keeps desks one unit apart separate — an aisle is not a table", () => {
    expect(tableGroups([at("a", 0, 0), at("b", TABLE + 1, 0)])).toHaveLength(2);
  });

  it("does not join desks that touch only at a corner", () => {
    expect(tableGroups([at("a", 0, 0), at("b", TABLE, TABLE)])).toHaveLength(2);
  });

  it("joins a block of four into one island", () => {
    const groups = tableGroups([
      at("a", 0, 0),
      at("b", TABLE, 0),
      at("c", 0, TABLE),
      at("d", TABLE, TABLE),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].desks).toHaveLength(4);
    expect(groups[0]).toMatchObject({ width: TABLE * 2, height: TABLE * 2 });
  });

  it("joins an L into one table, and reports its bounding box", () => {
    const groups = tableGroups([
      at("a", 0, 0),
      at("b", 0, TABLE),
      at("c", TABLE, TABLE),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ x: 0, y: 0, width: TABLE * 2, height: TABLE * 2 });
  });

  it("returns groups in reading order", () => {
    const groups = tableGroups([at("back", 0, TABLE * 3), at("front", 0, 0)]);
    expect(groups.map((g) => g.desks[0].id)).toEqual(["front", "back"]);
  });

  it("puts three tables of two in one row into three groups", () => {
    const desks = [];
    for (let t = 0; t < 3; t += 1) {
      for (let p = 0; p < 2; p += 1) {
        desks.push(at(`t${t}p${p}`, t * (TABLE * 2 + 2) + p * TABLE, 0));
      }
    }
    expect(tableGroups(desks)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
yarn test src/domain/room.test.ts -t "tableGroups"
```

Expected: FAIL — `tableGroups is not a function`.

- [ ] **Step 3: Implement**

```ts
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
export interface TableGroup {
  /** The group's desks, in reading order. */
  desks: Seated[];
  /** The group's bounding box, in half-tiles. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Do two desks share a full edge? Corners do not count — a diagonal is not a table. */
function sharesEdge(a: Seated, b: Seated): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx === TABLE && dy === 0) || (dy === TABLE && dx === 0);
}

/**
 * Group desks into the tables they visually form.
 *
 * Connected components over edge-sharing, walked breadth-first from each
 * unvisited desk in reading order — so both the groups and the desks inside
 * them come back front-to-back, left-to-right, and the DOM carries the order
 * a teacher reads the room in.
 */
export function tableGroups(desks: Seated[]): TableGroup[] {
  const ordered = [...desks].sort(compareReadingOrder);
  const seen = new Set<string>();
  const groups: TableGroup[] = [];

  for (const start of ordered) {
    if (seen.has(start.id)) continue;
    seen.add(start.id);
    const members = [start];
    // Breadth-first: `members` doubles as the queue, and every desk is added
    // to `seen` as it is enqueued, so none is visited twice.
    for (let i = 0; i < members.length; i += 1) {
      for (const candidate of ordered) {
        if (seen.has(candidate.id)) continue;
        if (!sharesEdge(members[i], candidate)) continue;
        seen.add(candidate.id);
        members.push(candidate);
      }
    }
    members.sort(compareReadingOrder);
    const minX = Math.min(...members.map((d) => d.x));
    const minY = Math.min(...members.map((d) => d.y));
    const maxX = Math.max(...members.map((d) => d.x));
    const maxY = Math.max(...members.map((d) => d.y));
    groups.push({
      desks: members,
      x: minX,
      y: minY,
      width: maxX - minX + TABLE,
      height: maxY - minY + TABLE,
    });
  }
  return groups;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
yarn test src/domain/room.test.ts
```

Expected: PASS.

- [ ] **Step 5: Full gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/room.ts src/domain/room.test.ts
git commit -m "feat(room): adjacent desks are one table, as a rendering"
```

---

### Task 3: Templates think in groups, and the room keeps a margin

**Files:**
- Modify: `src/domain/room.ts` (the `frame` margin), `src/domain/room-templates.ts`
- Test: `src/domain/room.test.ts`, `src/domain/room-templates.test.ts`

**Interfaces:**
- Produces:
  - `export const AISLE = 2` and `export const ROW_GAP = 1` in `room.ts`
  - `RoomTemplate` variant `rows` becomes `{ id: "rows"; rows: number; tables: number; perTable: number }` — the field named `cols` is **renamed to `tables`**, because it now counts tables per row rather than desks per row, and leaving it `cols` would make `cols * perTable` read as a nonsense. Rename it in `TEMPLATE_LIMITS.rows`, `DEFAULT_TEMPLATE`, `defaultTemplate`, `clampTemplate`, `seatCount`, and the template form's `paramCols` field (its label key becomes `plan.paramTables`).
  - `TEMPLATE_LIMITS.rows = { rows: [1, 10], tables: [1, 8], perTable: [1, 4] }`
  - `buildRows(rows: number, tables: number, perTable: number): Position[]`
  - The `u` variant keeps `cols`, which still counts desks along the base.

Existing behaviour that must not change: `buildRoom` still returns `frame(...)`, `seatCount` still counts places, `clampTemplate` is still the only place a range is known.

- [ ] **Step 1: Write the failing tests**

In `src/domain/room.test.ts`:

```ts
it("frames with two units of margin, so a stamped room still has floor", () => {
  const shape = frame([{ x: 0, y: 0 }]);
  expect(shape.positions).toEqual([{ x: 2, y: 2 }]);
  expect(shape.width).toBe(2 + TABLE + 2);
  expect(shape.height).toBe(2 + TABLE + 2);
});

it("leaves at least one placeable square around a full stamp", () => {
  const shape = frame([{ x: 0, y: 0 }, { x: PITCH, y: 0 }]);
  const free: Position[] = [];
  for (let y = 0; y + TABLE <= shape.height; y += TABLE) {
    for (let x = 0; x + TABLE <= shape.width; x += TABLE) {
      if (canPlace(shape.positions, { x, y }, shape)) free.push({ x, y });
    }
  }
  expect(free.length).toBeGreaterThan(0);
});
```

In `src/domain/room-templates.test.ts`:

```ts
describe("rows, in tables rather than desks", () => {
  it("puts the places of one table edge to edge", () => {
    const shape = buildRoom({ id: "rows", rows: 1, tables: 1, perTable: 2 });
    expect(tableGroups(shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null }))))
      .toHaveLength(1);
  });

  it("leaves an aisle between tables in the same row", () => {
    const shape = buildRoom({ id: "rows", rows: 1, tables: 3, perTable: 2 });
    const groups = tableGroups(
      shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null })),
    );
    expect(groups).toHaveLength(3);
    expect(shape.positions).toHaveLength(6);
  });

  it("keeps rows apart", () => {
    const shape = buildRoom({ id: "rows", rows: 2, tables: 1, perTable: 2 });
    const groups = tableGroups(
      shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null })),
    );
    expect(groups).toHaveLength(2);
  });

  it("counts places, not tables", () => {
    expect(seatCount({ id: "rows", rows: 4, tables: 3, perTable: 2 })).toBe(24);
  });
});

describe("islands are actually islands", () => {
  it("makes one block per island", () => {
    const shape = buildRoom({ id: "islands", islands: 2, perIsland: 4 });
    const groups = tableGroups(
      shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null })),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].desks).toHaveLength(4);
  });
});

describe("the horseshoe is continuous", () => {
  it("is one table", () => {
    const shape = buildRoom({ id: "u", cols: 4, rows: 3 });
    const groups = tableGroups(
      shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null })),
    );
    expect(groups).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
yarn test src/domain/room.test.ts src/domain/room-templates.test.ts
```

Expected: FAIL — `frame` still uses a one-unit margin, `rows` has no `perTable`, and every generator still steps by `PITCH`.

- [ ] **Step 3: Implement**

In `src/domain/room.ts`, add beside `PITCH`:

```ts
/**
 * Air between two tables in the same row, and between rows.
 *
 * `PITCH` used to be planted between every DESK, which is why no two desks
 * could ever touch and why the îlots template made 2×N spaced desks rather
 * than a block. Air belongs between GROUPS.
 */
export const AISLE = 2;
export const ROW_GAP = 1;
```

Change `frame`'s margin from 1 to 2 — the shift becomes `p.x - minX + 2` and the extent `max + TABLE + 2` — and update its doc comment to say why: with one unit, a fully stamped room has zero placeable squares, so "Ajouter une table" has nowhere to go.

In `src/domain/room-templates.ts`:

```ts
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
```

`buildU` steps by `TABLE` instead of `PITCH` along both arms and the base, so the horseshoe is one continuous surface. `buildArc` is unchanged: `ARC_SPACING` and sub-cell positions stay, because a curve is the one shape the grid cannot express.

Add `perTable` to the `rows` variant of `RoomTemplate`, to `DEFAULT_TEMPLATE` (value `2`), to `defaultTemplate("rows")`, to `TEMPLATE_LIMITS.rows` as `perTable: [1, 4]`, to `clampTemplate`, and to `seatCount` (`rows * cols * perTable`).

- [ ] **Step 4: Run to verify they pass**

```bash
yarn test src/domain
```

Expected: PASS. Existing template tests asserting `PITCH` spacing between desks will fail — update them to assert group counts instead, which is what the templates now mean.

- [ ] **Step 5: Full gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/room.ts src/domain/room.test.ts src/domain/room-templates.ts src/domain/room-templates.test.ts
git commit -m "feat(room): air between tables, not between desks"
```

---

### Task 4: Remove the saved-room feature

The `Room` shipped at v9 is a user-defined *template* that stamps and ceases to exist. The shared salle needs the same name for the opposite meaning, so the old one goes first, on its own, where it can be reviewed as the removal it is.

**Files:**
- Delete: `src/db/rooms.ts`, `src/db/rooms.test.ts`, `src/modules/plan/components/saved-rooms-bar.tsx`, `src/modules/settings/components/room-section.tsx`
- Modify: `src/db/index.ts`, `src/db/types.ts`, `src/db/backup.ts`, `src/db/backup.test.ts`, `src/db/workspace.test.ts`, `src/db/index.test.ts`, `src/modules/plan/page.tsx`, `src/modules/settings/page.tsx`, `src/i18n/locales/{fr,en}.json`

- [ ] **Step 1: Drop the store**

In `src/db/index.ts`, after `version(9)`:

```ts
// v10 drops the saved room. It was a user-defined TEMPLATE — positions
// embedded, stamped through `applyTemplate`, no back-reference. A shared
// salle is the opposite: editing 204 must change what 3°B and 5°A both see,
// which a stamp cannot do. The name is reused at v11 for the new meaning, so
// the old shape must go rather than be carried forward.
db.version(10).stores({
  rooms: null,
});
```

- [ ] **Step 2: Remove the code that used it**

Delete the four files listed above. Remove `Room` from `src/db/types.ts`, the `rooms` entries from `backup.ts` (the `WorkspaceBackup` type, the schema check, the export literal and the import list), `RoomSection` from `src/modules/settings/page.tsx`, and `SavedRoomsBar` plus its `listRooms`/`saveRoom` imports and handlers from `src/modules/plan/page.tsx`. Remove the `rooms.*` and `settings.rooms.*` keys from both locale files.

- [ ] **Step 3: Fix the tests that seeded a room**

`src/db/backup.test.ts`, `src/db/workspace.test.ts` and `src/db/index.test.ts` each seed a row per table. Remove the `rooms` rows and the `"rooms"` entry from the expected table list.

- [ ] **Step 4: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green. The wipe test and the schema table-list test are the guard here — they fail until `rooms` is out of both.

- [ ] **Step 5: Verify in the browser**

`yarn dev`, open a class's Plan de table: the saved-rooms bar is gone, the rest of the screen unchanged. Open Réglages: no Salles section.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(room): drop the saved room, whose name the salle needs"
```

---

### Task 5: The four stores

**Files:**
- Modify: `src/db/types.ts`, `src/db/index.ts`, `src/db/backup.ts`, `src/db/seed.ts`, `src/db/cascade.ts`
- Create: `src/db/rooms.ts`, `src/db/rooms.test.ts`, `src/db/plans.ts`, `src/db/plans.test.ts`
- Test: `src/db/index.test.ts`, `src/db/backup.test.ts`, `src/db/workspace.test.ts`, `src/db/cascade.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export interface Room { id: string; name: string; width: number; height: number; createdAt: number; updatedAt: number }
export interface Desk { id: string; roomId: string; x: number; y: number }
export interface SeatingPlan { id: string; classId: string; roomId: string; updatedAt: number }
export interface Assignment { planId: string; deskId: string; studentId: string }

// rooms.ts
export function listRooms(db: AppDatabase): Promise<Room[]>
export function createRoom(db: AppDatabase, name: string, shape: RoomShape): Promise<Room>
export function renameRoom(db: AppDatabase, roomId: string, name: string): Promise<void>
export function desksForRoom(db: AppDatabase, roomId: string): Promise<Desk[]>
export function addDesk(db: AppDatabase, roomId: string, at: Position): Promise<boolean>
export function moveDesk(db: AppDatabase, deskId: string, to: Position): Promise<boolean>
export function nudgeDesk(db: AppDatabase, deskId: string, by: Position): Promise<boolean>
export function removeDesk(db: AppDatabase, deskId: string): Promise<void>
export function applyShape(db: AppDatabase, roomId: string, shape: RoomShape): Promise<{ overflow: Record<string, string[]> }>

// plans.ts
export function getOrCreatePlan(db: AppDatabase, classId: string, roomId: string): Promise<SeatingPlan>
export function plansForRoom(db: AppDatabase, roomId: string): Promise<SeatingPlan[]>
export function assignmentsForPlan(db: AppDatabase, planId: string): Promise<Assignment[]>
export function applyPlacement(db: AppDatabase, planId: string, placement: Placement): Promise<void>
export function unassign(db: AppDatabase, planId: string, studentId: string): Promise<void>
```

- [ ] **Step 1: Declare the stores**

`src/db/index.ts`:

```ts
// v11 lays down the salle: furniture that belongs to no class, and the
// assignation as its own row.
//
// `&[roomId+x+y]` keeps v8's guarantee that no two desks share a point, so a
// `canPlace` bug surfaces as a rejected write rather than as a pupil nobody
// can tap. `&[planId+studentId]` is new and is the database refusing to seat
// one pupil in two chairs — an invariant that used to live only in careful
// code. Its consequence: seating an already-seated pupil THROWS unless the
// write clears their old row first, so every seat and swap is one transaction
// that deletes then puts.
//
// `[planId+deskId]` as the primary key copies `grades` exactly: one-row put
// to seat, one-row delete to unseat, never a read-modify-write of a
// collection.
db.version(11).stores({
  rooms: "id, name",
  desks: "id, roomId, &[roomId+x+y]",
  seatingPlans: "id, classId, roomId, &[classId+roomId]",
  assignments: "[planId+deskId], planId, deskId, studentId, &[planId+studentId]",
});
```

Add the four `Table<...>` fields to the `AppDatabase` interface and the four interfaces to `types.ts`.

- [ ] **Step 2: Write the failing db tests**

`src/db/plans.test.ts`:

```ts
import "fake-indexeddb/auto";
import type { Placement } from "@domain/room";
import { type AppDatabase, openWorkspaceDb } from ".";
import { applyPlacement, assignmentsForPlan, getOrCreatePlan, unassign } from "./plans";

let db: AppDatabase;
const PLAN = "p1";

beforeEach(async () => {
  db = openWorkspaceDb(crypto.randomUUID());
  await db.open();
});
afterEach(() => db.close());

/** Who sits where, as a plain map, so assertions read like the room does. */
async function seating(): Promise<Record<string, string>> {
  const rows = await assignmentsForPlan(db, PLAN);
  return Object.fromEntries(rows.map((a) => [a.deskId, a.studentId]));
}

const place = (
  studentId: string,
  deskId: string,
  displaced: { studentId: string; deskId: string | null } | null,
): Placement => ({ kind: "place", studentId, deskId, displaced });

it("seats a pupil from the rail on an empty desk", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  expect(await seating()).toEqual({ d0: "s1" });
});

it("swaps two seated pupils in one transaction", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  await applyPlacement(db, PLAN, place("s2", "d1", null));
  await applyPlacement(db, PLAN, place("s1", "d1", { studentId: "s2", deskId: "d0" }));
  expect(await seating()).toEqual({ d0: "s2", d1: "s1" });
});

it("displaces an occupant to the rail, leaving them no assignment at all", async () => {
  await applyPlacement(db, PLAN, place("s2", "d0", null));
  await applyPlacement(db, PLAN, place("s1", "d0", { studentId: "s2", deskId: null }));
  expect(await seating()).toEqual({ d0: "s1" });
  expect(await db.assignments.where({ planId: PLAN, studentId: "s2" }).count()).toBe(0);
});

it("never lets one pupil hold two places", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  await applyPlacement(db, PLAN, place("s1", "d1", null));
  expect(await db.assignments.where({ planId: PLAN, studentId: "s1" }).count()).toBe(1);
  expect(await seating()).toEqual({ d1: "s1" });
});

it("keeps one pupil per desk", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  await applyPlacement(db, PLAN, place("s2", "d0", { studentId: "s1", deskId: null }));
  expect(await seating()).toEqual({ d0: "s2" });
});

it("writes nothing for a refused placement", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  await applyPlacement(db, PLAN, { kind: "none" });
  expect(await seating()).toEqual({ d0: "s1" });
});

it("unassigns a pupil without touching anyone else", async () => {
  await applyPlacement(db, PLAN, place("s1", "d0", null));
  await applyPlacement(db, PLAN, place("s2", "d1", null));
  await unassign(db, PLAN, "s1");
  expect(await seating()).toEqual({ d1: "s2" });
});

it("gives a class the same plan twice for one salle", async () => {
  const a = await getOrCreatePlan(db, "c1", "r1");
  const b = await getOrCreatePlan(db, "c1", "r1");
  expect(b.id).toBe(a.id);
  expect(await db.seatingPlans.count()).toBe(1);
});

it("gives a class a different plan per salle", async () => {
  const a = await getOrCreatePlan(db, "c1", "r1");
  const b = await getOrCreatePlan(db, "c1", "r2");
  expect(b.id).not.toBe(a.id);
});

it("gives two classes different plans in the same salle", async () => {
  const a = await getOrCreatePlan(db, "c1", "r1");
  const b = await getOrCreatePlan(db, "c2", "r1");
  expect(b.id).not.toBe(a.id);
});
```

The swap test is the one that would catch a put-before-delete: with `&[planId+studentId]` in place, writing `s1` into `d1` before clearing `d0` throws, and the transaction rolls back to the state before the swap.

`src/db/rooms.test.ts`: `addDesk` refuses an overlapping position and returns `false`; `moveDesk` refuses a move that would overlap or leave the room; `nudgeDesk` reads the desk's position fresh inside its own transaction; `applyShape` replaces every desk and reports overflow **per plan**, keyed by plan id.

- [ ] **Step 3: Implement `rooms.ts` and `plans.ts`**

`applyPlacement` is the one that must be exactly right:

```ts
/**
 * Write one placement.
 *
 * Deletes before it puts, and that ordering is required rather than tidy:
 * `&[planId+studentId]` refuses a pupil in two chairs, so putting the held
 * pupil into the target before clearing their old row throws.
 */
export async function applyPlacement(
  db: AppDatabase,
  planId: string,
  placement: Placement,
): Promise<void> {
  if (placement.kind === "none") return;
  const { studentId, deskId, displaced } = placement;
  await db.transaction("rw", db.assignments, async () => {
    await db.assignments.delete([planId, deskId]);
    if (displaced?.deskId != null) await db.assignments.delete([planId, displaced.deskId]);
    await db.assignments.where({ planId, studentId }).delete();
    if (displaced) await db.assignments.where({ planId, studentId: displaced.studentId }).delete();
    await db.assignments.put({ planId, deskId, studentId });
    if (displaced?.deskId != null) {
      await db.assignments.put({ planId, deskId: displaced.deskId, studentId: displaced.studentId });
    }
  });
}
```

- [ ] **Step 4: Cascades**

In `src/db/cascade.ts`:

```ts
/**
 * Delete a salle, its furniture, and every arrangement made in it.
 *
 * Cascades rather than refusing, unlike `deleteSubject`: destroying gradebooks
 * as a side effect of removing a subject is too much to do implicitly, but an
 * arrangement is rebuilt in a minute — and refusing would strand a salle
 * behind classes a teacher no longer teaches. The ConfirmButton names the
 * classes that lose one.
 */
export async function deleteRoom(db: AppDatabase, roomId: string): Promise<void> {
  await db.transaction("rw", [db.rooms, db.desks, db.seatingPlans, db.assignments], async () => {
    const plans = await db.seatingPlans.where("roomId").equals(roomId).toArray();
    for (const plan of plans) await db.assignments.where("planId").equals(plan.id).delete();
    await db.seatingPlans.where("roomId").equals(roomId).delete();
    await db.desks.where("roomId").equals(roomId).delete();
    await db.rooms.delete(roomId);
  });
}
```

`deleteClass` adds its plans and their assignments. `deleteStudent` replaces the `db.seats.where("studentId").modify({studentId: null})` line with `await db.assignments.where("studentId").equals(studentId).delete()` — an assignment has no meaning without its pupil, so it goes rather than being emptied.

- [ ] **Step 5: Backup and seed**

Add `rooms`, `desks`, `seatingPlans`, `assignments` to `WorkspaceBackup`, the schema check, the export literal, and the import list in `backup.ts` — the export builds a literal, so this is by hand. Seed one salle ("204") with desks from `buildRoom(DEFAULT_TEMPLATE)` and a plan per class in `seed.ts`.

- [ ] **Step 6: The regression test**

In `src/db/index.test.ts`, add a `v9 → v11` case: build a real v9 database with `fake-indexeddb` carrying a `rooms` row of the OLD shape (with `positions`), close it, open with current code, and assert the store is empty rather than carrying a zombie row.

- [ ] **Step 7: Gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(db): the salle, its desks, and the assignation as its own row"
```

---

### Task 6: The salle screens

**Files:**
- Create: `src/modules/rooms/page.tsx`, `src/modules/rooms/editor.tsx`, `src/modules/rooms/components/room-canvas.tsx`, `src/modules/rooms/components/template-form.tsx`
- Modify: `src/router.ts`, `src/modules/app.tsx`, `src/modules/shared/components/app-drawer.tsx`, `src/styles/global.css`, `src/i18n/locales/{fr,en}.json`

**Interfaces:**
- Produces: `RoomCanvas`, consumed by Task 7.

```tsx
export function RoomCanvas({ room, desks, children, onFloorDrop }: {
  room: { width: number; height: number };
  desks: Desk[];
  /** One node per DESK, keyed by desk id — the caller decides what sits on a place. */
  children: (desk: Desk, group: TableGroup, indexInGroup: number) => React.ReactNode;
  /** Cell coordinates of a drop on bare floor, or undefined when the surface takes none. */
  onFloorDrop?: (at: Position) => void;
}): JSX.Element
```

`RoomCanvas` owns: the tiled floor whose 36px seams are the grid, the fit-to-width scale with its `MIN_SCALE` floor, the *tableau*, and one absolutely-positioned surface per `TableGroup` with a chair on the near edge of each place. It owns **no gesture** beyond reporting a floor drop.

- [ ] **Step 1: Room material tokens**

In `src/styles/global.css`, add to `:root` and to `:root[data-theme="ardoise"]`: `--floor`, `--floor-alt`, `--floor-seam`, `--wall`, `--wall-in`, `--wood`, `--wood-hi`, `--wood-edge`, `--wood-ink`, `--chair`, `--board`, `--board-frame`, `--room-shadow`. Light values are in the mockup; **ardoise values must be authored and contrast-checked** — the spec flags this as outstanding. Measure `--wood-ink` on `--wood` in both themes and record the ratio in the comment, as the behaviour palette does.

- [ ] **Step 2: Routes and drawer**

`src/router.ts`: `Rooms: "/salles"`, `Room: "/salles/:roomId"`. `app.tsx` gains both cases. `app-drawer.tsx` gains `{ key: "rooms", to: Router.Rooms(), label: t("nav.rooms") }` between `diary` and `settings`.

- [ ] **Step 3: The list**

`/salles` renders one row per room: name, place count, and the classes using it (from `plansForRoom`). *Nouvelle salle* creates one with `buildRoom(DEFAULT_TEMPLATE)` and navigates into it. Delete goes through `ConfirmButton` whose confirm label names the classes that lose an arrangement.

- [ ] **Step 4: The editor**

`/salles/:roomId`. One mode, no pupils. State: `heldDeskId: string | null` and `selectedDeskId: string | null`.

- Drag: HTML5 `dragstart` on a desk sets `heldDeskId`; `dragover` on the floor computes the cell under the pointer and previews it; `drop` calls `moveDesk`. Dragging the palette tile sets `heldDeskId = null` with a `newDesk` flag and drops through `addDesk`.
- Tap: tapping a desk sets `heldDeskId`; tapping floor calls `moveDesk`. Same state, second input path — this is what keeps the screen driveable by the browser automation and gives the keyboard equivalent.
- Keyboard: Tab reaches a desk, Space picks it up, arrows call `nudgeDesk` (one unit per press, reading the position fresh inside the transaction), Escape releases.
- `×` appears on the **selected** desk only.
- The template form sits in a side panel, always visible, stamping through `applyShape` with a `ConfirmButton` whose label names the total overflow across every plan in the salle.

- [ ] **Step 5: Verify in the browser**

`yarn dev`. Create a salle, stamp *Rangées 4 × 3 × 2*, confirm it draws as three tables of two per row with aisles. Drag a table from the palette against an existing one and confirm they merge into one surface. Drag a table out and confirm it separates. Remove one with `×`. Nudge one with the arrows. Reload and confirm it persisted.

- [ ] **Step 6: Gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(rooms): a salle is a screen with no pupils on it"
```

---

### Task 7: The plan tab, and the old room's removal

**Files:**
- Rewrite: `src/modules/plan/page.tsx`
- Modify: `src/modules/plan/components/student-card.tsx`, `src/modules/plan/components/student-rail.tsx`, `src/db/index.ts`, `src/db/types.ts`, `src/db/backup.ts`, `src/domain/room.ts`, `CLAUDE.md`
- Create: `src/domain/active-room.ts`, `src/domain/active-room.test.ts`
- Delete: `src/domain/active-layout.ts`, `src/domain/active-layout.test.ts`, `src/db/seating.ts`, `src/db/seating.test.ts`, `src/modules/plan/components/room-view.tsx`, `src/modules/plan/components/layout-bar.tsx`, `src/modules/plan/components/room-template-form.tsx`

- [ ] **Step 1: `active-room.ts`**

Copy `active-layout.ts`, rename the key to `profs-active-room`, and rename `readActiveLayout`/`writeActiveLayout`/`clearActiveLayout`/`resolveActiveLayout` to `...ActiveRoom`. The selection is class → salle. Keep the test that a stored id matching nothing falls back to the first, and that an empty list resolves to `null`.

- [ ] **Step 2: Rewrite the plan tab**

State: `held: HeldPupil | null`, `selectedStudentId`, plus the shell's existing session and group selections. No `resizing`, no furniture.

- A salle selector across the top, with *Gérer les salles →* linking to `Router.Rooms()`. Empty state when the workspace has no salle.
- `RoomCanvas` from Task 6, with a pupil layer as its child: an occupied place renders `PupilDisc` + `PupilName format="surname"`; a free place renders `plan.emptySeat`.
- Tap a rail chip → `setHeld({ studentId, fromDeskId: null })`. Tap a seated pupil with nothing held → open their card. Tap any place with something held → `resolvePlacement` then `applyPlacement`. Escape → release.
- Keep the `dropping` ref: one drop per hold. `setHeld(null)` only lands after the await, so a second tap runs a closure that already captured the old `held`.
- Every `useLiveQuery` takes `db` in its dependency array, or a workspace switch keeps rendering the previous school's pupils.

- [ ] **Step 3: The card**

*Déplacer* becomes the primary action, full width, above the register — it lifts the pupil and closes the card. *Retirer de sa place* is added beneath it and calls `unassign`. Keep `key={student.id}`.

The rail's three hints collapse to one: `plan.hintPlace` — *« Posez-le sur une place. Les deux élèves permutent. »*

- [ ] **Step 4: Drop the old stores**

```ts
// v12 drops the per-class layout. Both stores changed shape rather than key —
// a Seat carried a studentId and a SeatingLayout carried a classId, and
// neither means anything now that furniture belongs to a salle. Carried
// forward, a v11 seat would feed a layoutId into code reading planId.
db.version(12).stores({
  seats: null,
  seatingLayouts: null,
});
```

Remove `Seat` and `SeatingLayout` from `types.ts` and from `backup.ts`; delete `seating.ts` and its test; delete `Held`, `DropAction`, `resolveDrop` and `resolveFloorDrop` from `room.ts` and their tests. Add a `v11 → v12` case to `src/db/index.test.ts`.

- [ ] **Step 5: Update CLAUDE.md**

Rewrite **The room** section: the salle/plan split, the one placement rule, the merge as a rendering, drag-with-a-retained-tap-path and why it departs from the no-drag ruling, `Salles` as a seventh drawer destination, and `deleteRoom` cascading rather than refusing. Remove the paragraph explaining that a bare tap means different things in different modes. Update **Known gaps**: one plan per (class, salle) replaces BACKLOG #4.

- [ ] **Step 6: Verify in the browser**

`yarn dev`. Open 3°B → Plan de table. Seat a pupil from the rail onto an occupied place and confirm the occupant returns to the rail. Open a pupil's card, *Déplacer*, drop them on another pupil, confirm they swap. *Retirer de sa place* returns one to the rail. Confirm no `×`, no `↩`, no floor slot and no mode toggle exists on this screen. Switch the salle and confirm the arrangement changes with it. Switch workspace and confirm the room re-reads.

- [ ] **Step 7: Gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(plan): pupils only, and one rule for placing them"
```

---

## Out of scope, deliberately

`ScheduleEntry.room` is a free-text string ("B12", "A03", "Labo") and is **not** wired to `Room.id` here. Doing so would let Today open a lesson straight onto the right salle, which is worth having — but it is a second migration with its own question (what happens to a timetable naming a room that was never created), and it does not need answering to make the split work. Raise it separately.
