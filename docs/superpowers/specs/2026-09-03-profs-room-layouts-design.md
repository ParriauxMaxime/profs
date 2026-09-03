# profs — Phase 7: the room as a room, not a grid (design)

**Date:** 2026-09-03
**Status:** Approved, ready for implementation planning
**Follows:** phase 6 (`2026-09-02-profs-phase6-class-hub.md`, shipped)

## What This Is

A practising teacher, having used the seating plan:

> Et aussi concernant le plan de classe moi ils sont tous sur une rangée en arc
> de cercle. Ça serait bien de pouvoir changer la dispo de la salle (arc de
> cercle, ilots etc).

The seating plan can only draw a rectangle. His room is a single curved row, so
the feature does not describe his classroom at all — and a seating plan that is
not the shape of the room is a diagram of somewhere else.

This phase replaces the grid with a **room**: tables at free positions, stamped
out by one of four templates and then moved by hand.

The same message asked for a **history of remarks reachable from the current
session**. That is a separate, bounded change to `StudentCard`, deliberately
**not** in this spec, and it is picked up after this ships.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two-step
in-place confirms for destructive actions, and `PupilName` as the only place a
pupil's name is composed.

## The Ruling: Templates Stamp, They Do Not Live

A template generates positions and then ceases to exist. Nothing records that a
room "is an arc". Applying a template is a one-way write, exactly like pasting.

The rejected alternative — a live template with stored parameters — fails on a
question it cannot answer: once the teacher drags one table out of the arc, does
changing the curvature move that table or leave it? Either answer is wrong half
the time, and the app would have to carry an override set to express the
difference. A stamp has one state, and the state is the room.

The cost is real and accepted: re-stamping is destructive, and there is no
"widen the arc by one seat" that preserves the hand-tuning underneath it. The
mitigation is `reseat` (below), which keeps *pupils* in place across a stamp even
though it does not keep *tables*.

## The Ruling: A Gap Is Not a Thing

Today a `Seat` row encodes three states, and CLAUDE.md is emphatic that they stay
distinct: no row for a `[layoutId, row, col]` is a **gap**, a row with
`studentId: null` is an **empty seat**, and a row with a `studentId` is
**occupied**.

That third state exists only because a grid forces every cell to exist. Once
tables carry their own coordinates, an aisle is the absence of a table, which is
the absence of a row — so the distinction collapses on its own:

| Grid (today) | Room (from now on) |
|---|---|
| no row | an aisle — a cell the teacher carved out |
| `studentId: null` | an empty seat |
| `studentId: "…"` | an occupied seat |

becomes

| Room | |
|---|---|
| no row | floor |
| `studentId: null` | an empty table |
| `studentId: "…"` | an occupied table |

Two states, and the gesture the teacher sees is unchanged: the `×` on a table
still removes it, and the floor it leaves behind still takes nothing.

Explicit aisle or obstacle *objects* — a door, windows, the teacher's desk —
were considered and cut. They are a second kind of thing to place, store, back
up and translate, and the board bar below already answers the only question they
were needed for (which way is the room facing).

## The Ruling: The Board Is Fixed at the Top

An arc and a U are meaningless without something to face. The room renders a
non-movable **TABLEAU** bar along its top edge, and that is the whole of the
orientation model: the teacher looks at their room from where they stand.

Nothing about it is configurable, nothing about it is stored. A room whose board
is on the side is drawn by rotating the tables, not by moving the board.

## The Ruling: Half-Tile Integers, Never Floats

Positions are integers in **half-tiles**. A table occupies 2 × 2 units; the snap
grid is 1 unit.

This is the same wall `.carreaux` hit in phase 4b and `weekParity` hit in 4a: a
geometry expressed in a continuous unit accumulates error and then produces
something that still looks plausible. Float coordinates would make `canPlace`'s
distance test an approximate comparison, make the unique index `[layoutId+x+y]`
unable to prevent two tables at one point, and make a round trip through
`JSON.stringify` in `backup.ts` a source of drift.

Half a tile is also exactly the precision an arc needs and no more.

## Data Model

```ts
/** The room, from above. The board is at the top, always. */
interface SeatingLayout {
  id: string;
  classId: string;
  /** Half-tiles. At most ROOM_MAX (40 units = 20 tiles). */
  width: number;
  height: number;
  updatedAt: number;
}

/**
 * One table. Absent means floor — there is no aisle row to store.
 *
 * `id` is the identity the whole interaction hangs off: held tables, held
 * pupils and swaps all address a table by id, never by its coordinates.
 */
interface Seat {
  id: string;
  layoutId: string;
  /** Half-tiles, top-left corner. Integers. */
  x: number;
  y: number;
  studentId: string | null;
}
```

**Schema** — `db.version(7)`:

```
seatingLayouts: "id, classId"
seats:          "id, layoutId, &[layoutId+x+y]"
```

The unique compound index is the database's own guarantee that two tables never
share a point. It does not cover *partial* overlap (two tables one unit apart),
which is `canPlace`'s job in the domain — but it means a bug in `canPlace`
surfaces as a rejected write rather than as a pupil nobody can tap.

`seatKey()` is deleted. Nothing addresses a seat by coordinates any more.

**Existing data is disposable**, per CLAUDE.md's standing rule: no upgrade
callback, so Dexie creates the store empty and phase 5's `row/col` seats are
garbage the wipe in Réglages already handles. Rooms already laid out are laid out
again. Nothing else moves — pupils, notes, attendance, behaviour, gradebooks,
rubrics, groups, the timetable and the journal are all untouched.

`backup.ts` goes to `version: 7` and refuses a v6 file outright. A v6 backup
carries `Seat` rows keyed `row`/`col`; importing it would either drop every
seating plan silently or write rows the new index rejects mid-transaction, and
`parseBackup` refuses whole files before `importWorkspace` clears a table for
exactly this reason.

## What Table Identity Buys Back

`swapSeats` currently takes an `expectedStudentId`, because a held seat is
coordinates only: a hold on (0, 0) survives another tab moving that pupil away
and seating somebody else there, and dropping would then move a pupil the teacher
never touched.

With an id, that guard is the id. `swapSeats(db, aSeatId, bSeatId)` reads both
rows inside its transaction; a table that has been removed or a pupil who has
moved on makes the read fail and the write never happens. The parameter goes
away, and with it the class of bug it was patching.

This is the same invariant CLAUDE.md already lists five times under "state bound
to a record must be anchored to that record's identity, never to its position" —
the seating plan was the one place still anchored to a position, because a grid
cell had no identity to anchor to.

## Geometry

One constant governs everything: **`PITCH = 3`** units. A table is 2 wide, so
there is one unit of air between neighbours.

`canPlace(positions, at)` — two tables clear each other when
`|dx| >= 2 || |dy| >= 2`. Pure, and the only overlap rule in the codebase.

### The arc cannot self-collide, by arithmetic

Seats are spread at equal angles along a circle centred **on the board**, so
every seat is the same distance from it and the ends of the row wrap forward —
which is what a teacher means by an arc. The radius is chosen so the arc length
is at least `seats * PITCH`. Every adjacent pair is
therefore at least 3 units apart before rounding. Rounding each coordinate to an
integer moves a point by at most 0.5, so the worst case separation is 2 units —
exactly the tile width, which `canPlace` accepts.

Non-overlap falls out of the radius choice rather than out of a repair pass that
nudges colliding seats afterwards. A repair pass is where this would have gone
wrong: it terminates on most inputs and produces a visibly lumpy arc on the rest,
which is the failure that gets shipped because it still looks like an arc.

The test asserts non-overlap across the full clamped parameter range for all four
generators, not at sampled points.

## The Four Templates

`src/domain/room-templates.ts`. Pure, no React, no Dexie. Each is
`params -> { width, height, positions }`, with its clamps beside it.

```ts
rows    ({ rows, cols })          // phase 5's grid, still the default
arc     ({ seats, rows, curve })  // curved rows facing the board
islands ({ islands, perIsland })  // clusters, two tables wide
u       ({ seats })               // arms down both sides, closed at the back
```

**The U opens toward the board.** The board is at the top, so the arms run down
the left and right edges and the closed side is at the bottom. Every pupil faces
up.

**Clamps**: room at most 40 × 40 units (20 × 20 tiles); at most
`MAX_STUDENTS_PER_CLASS` (100) positions, so a room can never be stamped larger
than a class may be. Each parameter carries its own floor and ceiling in the
domain, next to the generator that reads it — not in the form, which is the
mistake the subject palette and the period names were moved out of a component
to avoid.

### Applying a template does not empty the room

`reseat(oldSeats, newPositions)` pours the currently-seated pupils into the new
positions in **reading order** (`y`, then `x`), so a 5 × 6 grid restamped as an
arc keeps the front row in front and the back row at the back. Pupils past the
end of the new position list return to the rail, and the form warns with that
count before the write, in the shape phase 5's `resizeWarning` already
established.

This is what makes a destructive stamp survivable in a real classroom: the
teacher who spent a term arranging 28 pupils does not lose the arrangement to a
change of room shape, only the exact chairs.

## Interaction

`Held` grows a third kind. It stays anchored to identity throughout:

```ts
type Held =
  | { kind: "pool";  studentId: string }  // a pupil from the rail
  | { kind: "seat";  seatId: string }     // a seated pupil
  | { kind: "table"; seatId: string };    // the furniture, layout-edit mode only
```

`resolveDrop` keeps its shape, its place in `src/domain/`, and its tests,
retargeted from `{ row, col }` to a seat id, plus one branch for `table`.

**The pupil gesture is unchanged in every respect.** A pupil held from the rail
*seats* and displaces whoever was there back to the rail; a pupil held from a
table *swaps*, degrading to a move when the target is empty; a bare tap on a
seated pupil opens their card, which stays the gesture of the lesson itself;
`Déplacer` on the card picks them up. The `dropping` ref still enforces one drop
per hold. Escape still releases.

**Furniture, in layout-edit mode only:**

| Gesture | Result |
|---|---|
| tap floor | `addTable` there, refused if it would overlap |
| tap a table, nothing held | pick the table up |
| tap floor, table held | `moveTable` — one row update on a stable id |
| arrow keys, table held | nudge one unit; Enter commits, Escape releases |
| `×` on a table | `removeTable`, unseating its occupant to the rail |

### Precision splits in two, and that is deliberate

Tapping bare floor has no keyboard equivalent, so reaching every position needs
two mechanisms rather than one:

- **Floor buttons** render in layout-edit mode only, at whole-tile coordinates
  (even `x` and `y`) where a table would fit. Bounded by the 20 × 20 tile clamp,
  so a few hundred at most, and only while editing. Tap precision is one tile.
- **Arrow keys on a held table** move it one unit. This reaches the odd
  coordinates an arc uses, and gives a keyboard user the whole feature rather
  than a degraded one.

A click handler on the canvas computing coordinates from the pointer offset was
the obvious alternative and is unreachable without a mouse.

## Rendering

`room-view.tsx` replaces `seat-grid.tsx`. Tables are absolutely positioned inside
a sized canvas.

**Unit = 36px**, so a table is 72 × 72 — squarer than phase 5's 80 × 56. The
square unit is required, not cosmetic: a non-square unit turns every circle into
an ellipse, and `canPlace`'s distance test into something that disagrees with
what the teacher sees.

**Scale to fit.** An 18-seat arc spans 54 units of arc length, and close to that
in width when the curve is shallow — near 1950px, which no tablet scrolls
comfortably mid-lesson. A `ResizeObserver` on the wrapper sets
`transform: scale(min(1, containerWidth / roomWidth))` on the canvas. It never
scales above 1 — a four-table room stays at its natural size rather than
ballooning to fill the screen.

**DOM order is reading order** (`y`, then `x`); position is CSS only. Tab moves
through the room front-to-back, which is the order a teacher thinks in. The board
bar lives inside the canvas so it scales with it.

**Empty room** — no template has been applied and every table has been removed —
shows the board bar and a line pointing at the template picker, not a blank box.

`room-template-form.tsx` replaces `layout-size-form.tsx`: a template picker, that
template's parameters, the count of pupils who would return to the rail, and
Save/Cancel. It keeps `key={layout.id}`, keeps Escape, and keeps releasing the
held item on every exit path — a stamp can delete the very table being held.

## Testing

**Domain, TDD** — `src/domain/room.ts` and `src/domain/room-templates.ts`:
`canPlace`'s overlap rule; every generator asserted non-overlapping and in-bounds
across its full clamped parameter range; the arc's spacing bound at the extremes
(maximum seats, maximum curve, minimum radius); `reseat` preserving reading order
and reporting overflow; `resolveDrop`'s branches.

**`src/db/`, against `fake-indexeddb`** — seat, swap, clear; `addTable` refusing
an overlap; `moveTable` keeping the id; `removeTable` returning its occupant to
the rail; `applyTemplate` replacing the room in one transaction. Plus the two
backup guards CLAUDE.md names: the export carries an array for every table in
`db.tables`, and a seed → export → wipe → import round trip preserves every
table's count.

**No component tests**, per the project's standing posture. The UI is verified by
driving `yarn dev` in a browser: stamp each of the four templates, move a table
by tap and by arrow key, seat a pupil, swap two, displace one from the rail, and
delete a table out from under its occupant.

## Files

| Path | Change |
|---|---|
| `src/domain/room.ts` | new — units, `Position`, `canPlace`, `reseat`, `Held`, `resolveDrop` |
| `src/domain/room-templates.ts` | new — the four generators and their clamps |
| `src/domain/seating.ts` | removed — `buildSeats` and `resizeSeats` have no successor |
| `src/db/types.ts` | `Seat` gains `id`/`x`/`y`, `SeatingLayout` gains `width`/`height` |
| `src/db/index.ts` | `version(7)`; `seatKey` deleted |
| `src/db/seating.ts` | `addTable`, `moveTable`, `removeTable`, `applyTemplate`; `swapSeats` loses `expectedStudentId` |
| `src/db/seed.ts` | demo rooms stamped from `rows` |
| `src/db/backup.ts` | `version: 7`, v6 refused |
| `src/modules/plan/components/room-view.tsx` | replaces `seat-grid.tsx` |
| `src/modules/plan/components/room-template-form.tsx` | replaces `layout-size-form.tsx` |
| `src/modules/plan/page.tsx` | three-kind `Held`, table editing |
| `src/i18n/locales/{fr,en}.json` | template names, parameters, board label, nudge hint |
| `CLAUDE.md` | the three-states paragraph and the seating section rewritten |

## Out of Scope

- **The history of remarks** from the same feedback message. Bounded, separate,
  next.
- **Named reusable rooms** shared between classes ("Ma salle 204"). Wanted
  eventually; it needs a table and a management screen, and one layout per class
  is still the documented limit (`docs/BACKLOG.md` #4).
- **Drag and drop.** Still deliberately absent, for the reason phase 5 gave: it
  is the one gesture the browser automation that verifies these screens cannot
  drive, and a keyboard equivalent is needed regardless.
- **Free-standing room objects** — door, windows, teacher's desk. Cut above.
- **Rotating tables.** A table has a position and no orientation. A U's side arms
  render the same way its back row does.
