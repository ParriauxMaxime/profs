# profs — Phase 5: seating by direct manipulation, and a class-size ceiling (design)

**Date:** 2026-09-02
**Status:** Approved, ready for implementation planning
**Follows:** phase 4b (`2026-09-02-profs-phase4b-diary-calendar.md`, shipped)

## What This Is

Two changes that share no code but ship together, because the second bounds the
first.

1. **The seating plan's gesture is inverted.** Today a teacher arms a *seat*,
   then names an *occupant*. From now on they pick up a *pupil*, then choose a
   *seat*.
2. **A class holds at most 100 pupils.** A hard ceiling, enforced at every
   write site.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two
themes.

Nothing here changes the schema. `seatingLayouts` and `seats` keep their shape,
and a `Seat` row keeps encoding three states by presence: no row is a **gap**,
a row with `studentId: null` is an **empty seat**, a row with a `studentId` is
**occupied**.

## Part 1 — the seating plan

### What is wrong now, measured in the running app

Driven against `yarn dev` on 3°B (24 pupils, a 5×6 room):

- **The order is inverted.** `armedSeat` is armed first, and only then does the
  pool accept a tap. The teacher's sentence is "Bernard goes there"; the app
  demands "there gets Bernard".
- **The two halves of the gesture are far apart.** The pool sits at the bottom
  of the page, the grid at the top. Seating a full class at the rentrée is
  **48 taps** and 24 round trips down the page.
- **The pool is dead until a seat is armed** — its chips carry `disabled`, and
  the hint line `plan.tapSeatThenStudent` appears and disappears with the armed
  state, so the chip row *moves by one line height* between every two taps of
  the same gesture. Verified by mis-tapping it in the browser: the chip had
  moved out from under the pointer between the screenshot and the click.
- **Two pupils cannot be swapped.** An occupied seat cannot be armed, so
  exchanging two pupils is: clear one, move, re-arm, move back — **six taps**,
  during which the room is in a state that is not the room.
- **The mode is silent.** With a seat armed, tapping an occupant *moves* them
  instead of opening their card, and the only signal is a dashed border on
  every seat at once.

### The gesture

One piece of state replaces `armedSeat`:

```ts
type Held =
  | { kind: "pool"; studentId: string }
  | { kind: "seat"; row: number; col: number }
  | null;
```

Anchored to a pupil's id or to a cell's coordinates — never to a list position.
This is the codebase's recurring bug shape (see CLAUDE.md); the rail reorders
whenever a pupil is seated, so an index-held selection would retarget onto
whoever slid into that slot.

With nothing held, tapping an **empty seat** does nothing. Arming a seat is
what this change removes, so an empty seat is no longer a control in normal
mode — it is only ever a target.

**Picking up.** Tapping a chip in the rail picks that pupil up. Tapping the
held chip again puts them down. `Escape` cancels, through the existing
`useEscape`.

**Putting down.** While someone is held, every seat is a target:

| Target | Result |
|---|---|
| empty seat | pupil is seated |
| the seat they already hold | no-op, released |
| seat occupied by someone else, holder came from a **seat** | the two **swap** |
| seat occupied by someone else, holder came from the **rail** | the occupant is **displaced to the rail** |

Displacement rather than refusal: the gesture always completes, nothing is
lost, and the displaced pupil reappears in the rail with the counter
incrementing. A refusal would reintroduce the round trip this whole change
exists to remove.

### The one thing that must not be sacrificed

Tapping a seated pupil opens their **card** — attendance, behaviour. That is
the gesture of the lesson itself, and it is the overwhelming majority of taps
this page ever receives. It does not become "pick up".

So picking up a *seated* pupil has two doors, and neither is the bare tap:

- The pupil card gains a **`Déplacer`** action. It closes the card and picks
  that pupil up. The card is already open by then, so rearranging costs one
  tap more than it would have, and only in the mode where rearranging is rare.
- In **`Modifier le plan`** — the layout-edit mode that already exists — a bare
  tap on a seated pupil picks them up. That mode is *for* rearranging, and it
  is already the mode where the grid's controls are destructive and the pupil
  card is beside the point.

Entering or leaving `Modifier le plan` releases whoever is held, exactly as it
currently disarms the armed seat: a held pupil is a live gesture and must not
survive a mode change.

### The rail

`UnseatedPool` becomes a rail beside the grid rather than a strip below it:
sticky, always enabled, with a count badge. On a narrow screen it stacks above
the grid — above, not below, because the thing you are about to place should
not be off-screen while you look at where to put it.

It must survive 100 chips (see part 2): it scrolls internally rather than
growing the page, and above **12** unseated pupils it grows a search field over
`domain/search.ts`, which is already accent-insensitive. Twelve is the point at
which the rail stops being scannable at a glance on a tablet; below it a search
field is one more thing in the way.

The hint line stops appearing and disappearing. It is present in both states,
its text changing between "pick a pupil" and "put them somewhere" — a line that
is always there cannot move the chips under a finger.

### Writes

`src/db/seating.ts` gains exactly one function:

```ts
swapSeats(db, layoutId, a: {row, col}, b: {row, col}): Promise<void>
```

One `rw` transaction, symmetric with `moveSeat`, a no-op when `a` and `b` are
the same cell, and — like `moveSeat` — it reads both seats inside the
transaction rather than trusting what the caller last rendered.

`seatStudent` is **not** changed. It already writes the incoming pupil over
whatever occupied the target and clears their previous chair in the same
transaction, which is precisely the displacement rule above. It gains a test
that says so, because an invariant nobody asserted is an invariant that leaves.

### What is explicitly not in this phase

- **Drag and drop.** Tap is the reference implementation — it is the one that
  works with a keyboard, with a screen reader, and with a finger on a tablet
  held in one hand. Drag is additive and can land later without disturbing any
  of the above. Building both at once doubles what a browser pass has to
  verify.
- **A fill mode / auto-arrangement** (the queue and the alphabetical, snake,
  by-group and random layouts sketched during design). It solves the rentrée,
  not the daily gesture, and it is a separable piece of work.

## Part 2 — 100 pupils per class

`MAX_STUDENTS_PER_CLASS = 100`, in a new `src/domain/class-size.ts` with the
pure helpers around it (`remainingCapacity`, `classesOverCapacity`). A domain
constant, never inlined into a component — the same rule that put the subject
palette and the period names there.

100 is far above any real French secondary class (a full one is ~35). It is not
a pedagogical rule; it is the bound that keeps a rail of chips, a seating grid
of at most 12×12 = 144 cells, and a class average from meeting a roster nobody
intended to paste.

Three write sites add pupils, and the rule leaks if any is missed:

| Site | Behaviour |
|---|---|
| `student-form.tsx` | refuses, with a message, when the class is full |
| `csv-import.tsx` | the preview states how many rows and how many places remain; import is blocked until the teacher unticks enough rows — the per-row tick already exists |
| `parseBackup` (`db/backup.ts`) | **throws** if any class in the file exceeds 100 |

The backup case is the one that deserves its rationale written down, because it
was decided against the recommendation on the table. The alternative was to let
a restore through and cap only subsequent additions, on the grounds that a
ceiling should stop a teacher inflating a class, not stop them recovering their
own data. The ruling is the stricter one: a backup that violates an invariant
is refused whole, exactly as a v1 backup is refused rather than upgraded — a
half-legal workspace is worse than a rejected file.

What makes that safe is where the check sits. `parseBackup` runs **before** the
`rw` transaction that clears every table (`backup.ts:232`), so a refusal leaves
the workspace untouched. A test asserts that: import a 101-pupil backup, expect
the throw, then assert every table still holds what it held.

The seed (24 and 22 pupils) is unaffected.

## Testing

Domain and `src/db` are TDD as always; there are still no component tests, and
the UI is verified by driving a real browser against `yarn dev` on port 3000.

- `domain/class-size.test.ts` — the boundary at exactly 100, at 101, and an
  empty class.
- `db/seating.test.ts` — `swapSeats` exchanges two occupants; swapping with an
  empty seat behaves as a move; swapping a cell with itself changes nothing;
  swapping into a gap is refused rather than creating a seat where the teacher
  carved an aisle. Plus the new `seatStudent` displacement assertion.
- `db/backup.test.ts` — the over-capacity refusal, and the workspace intact
  after it.
- Browser pass: place from the rail, swap two seated pupils, displace an
  occupant, cancel with `Escape`, confirm a bare tap still opens the pupil card
  in normal mode, and confirm the rail does not move under the finger between
  two taps.

The validation gate is unchanged and all four must be green:
`yarn format && yarn lint && yarn typecheck && yarn test`.

## Consequences for CLAUDE.md

Three passages need updating once this ships: the seating-plan paragraph in the
architecture section (the armed seat becomes a held pupil), the identity-anchor
list (a new entry for `held`), and the "known v1 gaps" list, which should record
that drag and drop and auto-arrangement were deliberately deferred rather than
forgotten.
