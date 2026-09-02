# profs — Phase 3: annotations, groups, calculation columns (design)

**Date:** 2026-09-02
**Status:** Approved, ready for implementation planning
**Follows:** `2026-09-01-profs-phase2-classroom-design.md` (phase 2, shipped)

## What This Is

Three features from the iDoceo gap analysis in `docs/BACKLOG.md`, chosen by
Maxime on 2026-09-01 and built in this order:

1. **Cell annotations** — a note on any grade cell.
2. **Student groups** — named subsets of a class.
3. **Calculation columns** — a column derived from other columns.

Groups land before calculations deliberately: an aggregate scoped to a group is
a natural pairing, and building groups second avoids reworking the calculation's
scope afterwards.

Every constraint from v1 and phase 2 still binds: local-only, IndexedDB, **no
network request of any kind**, `fr` default with `en` alongside, no blocking
browser dialogs, 44px live-entry tap targets, writes in `src/db/` and never in a
component.

## Goals

- A teacher can record *why* a mark is what it is, on the mark itself.
- A class can be divided into working groups, reusable across the seating plan
  and the gradebook.
- A gradebook can show a derived figure — a sub-average, a total — without
  arithmetic on paper.

## Non-Goals

- **Calculation columns feeding the gradebook average.** See the ruling below.
- **Calculations reading other calculations.** Sources are plain numeric
  columns only, so no cycle can exist: there is no cycle detection to write, no
  evaluation order to define, and no circular-reference error to explain to a
  teacher.
- Criterion weights on rubrics, student reports, resources manager, timetable
  — all still parked in `docs/BACKLOG.md`.
- Group-level marking. A group is a way of selecting and viewing pupils, not a
  thing that holds a grade.

## The calculation ruling, and why

**A calculation column is display-only. It never enters `studentAverage`.**

French secondary marking already expresses "this assessment counts more" through
the **coefficient**, which this app implements as `column.weight` and has since
v1. "Best three of five" is an Anglo convention; the French moyenne
trimestrielle is a weighted mean of every devoir by coefficient. A calculation
column that fed the average would therefore duplicate a mechanism that already
exists, while introducing the one failure this app cannot afford — a silently
wrong bulletin average, discovered by a parent rather than by us.

What a French teacher wants from a derived column is a *sub-average to read*:
"moyenne des devoirs surveillés" beside "moyenne des devoirs maison", or a
points total. Those are informational and sit alongside the trimestre average
rather than replacing it.

Consequences:

- `src/domain/gradebook/average.ts` is **not modified by this phase**, and a
  task asserts it byte-identical.
- `isNumericColumn` continues to gate average participation, and a calculation
  column is not numeric for that purpose.
- The decision is reversible in the safe direction: giving a calculation column
  a weight later is additive. Removing a double-counted average from bulletins
  already issued is not.

## Data Model

Added to the twelve tables of phase 2. Schema moves to `version(4)`; existing
data remains disposable, so there is no upgrade callback.

```
StudentGroup   id, classId, name, color, createdAt, updatedAt
GroupMember    [groupId+studentId] (compound), addedAt
```

`Grade.note?: string` **already exists** in the v1 schema and nothing has ever
read or written it. Annotations need no schema change — this is the cheapest
real gap in the backlog for exactly that reason.

Calculation columns need no new table either. `GradeColumn` gains:

```
GradeColumn    ... type: "calculation", calculation?: { kind, sourceColumnIds }
```

`calculation` is only meaningful when `type` is `"calculation"`, the same way
`max` is only meaningful for `numeric`.

**Compound key, again.** `groupMembers` uses `[groupId+studentId]` for the same
reason as `grades`, `attendance`, `seats` and `rubricScores`: adding one pupil
to one group is a single-row `put`, removing them a single-row `delete`, and
membership is never read-modify-written as a collection. `groupMemberKey()` is
the only constructor.

### Calculation kinds

`CALCULATION_KINDS` in `src/domain/gradebook/calculation.ts`, an `as const`
list:

| Kind | Meaning |
|---|---|
| `mean` | Weighted mean of the sources, normalised to /20 like any average |
| `sum` | Total of the raw values, not normalised |
| `bestOf` | Mean of the best *n* sources, `n` stored alongside |
| `count` | How many of the sources have a value |

`mean` and `bestOf` normalise each source by its own `max` before combining,
exactly as `studentAverage` does — a /100 test and a /20 test must be
comparable. `sum` deliberately does not normalise: a points total is asked for
in raw points.

A calculation over zero sources, or over sources a pupil has no marks in,
yields **null** and renders as an empty cell. It never renders as zero: a pupil
who sat nothing has no average, and showing 0/20 would be a lie about their
work.

### Groups

A group belongs to a class and carries a colour from the existing
`SUBJECT_COLORS` palette, reused rather than duplicated.

Where groups are consumed in this phase:

- **The class roster** filters by group.
- **The seating plan** filters the unseated pool by group, so seating "les
  rouges" together is one selection rather than thirty decisions.
- **The gradebook grid** filters rows by group.

Deliberately not consumed by rubrics in this phase — an assessment scoped to a
group is a real idea, and it is a phase 4 question, not a free addition here.

## Annotations

`Grade.note` is written and read for the first time.

- The grid cell shows a small corner marker when a note exists. The marker is
  never the only indication: the cell's `title` and accessible name carry the
  note text too.
- Opening a cell's editor exposes the note field beneath the value. Saving the
  note is a single-row `put` on the same compound key, and clearing the note
  removes only the note, never the mark.
- The fast-entry screen exposes the same field, since that is where a teacher
  is when the reason is fresh.
- A note on a cell with no value is allowed: "absent, à rattraper" is a real
  thing to record before a mark exists. That means a grade row may exist with a
  note and no value, and `studentAverage` must continue to skip it — it already
  skips non-numeric values, and a test pins this.

## Modules and Routes

No new routes. Groups are managed from the class page; annotations live in the
grid and fast entry; calculation columns are a column type in the existing
column form.

New domain modules:

- `src/domain/gradebook/calculation.ts` — kinds, and the pure evaluation
  function. No React, no Dexie.
- `src/domain/group.ts` — group name rules and membership helpers.

New database operations, all named, exported and unit-tested in `src/db/`:

- `saveGroup`, `addToGroup`, `removeFromGroup`, `setGroupMembers`
- `setGradeNote`, `clearGradeNote`

Components hold no write logic. This is settled practice from phase 2B and is
not renegotiated here.

## Deletion

`src/db/cascade.ts` gains:

- `deleteGroup` — the group and its memberships.
- `deleteStudent` — additionally, that pupil's group memberships.
- `deleteClass` — additionally, its groups and their memberships.
- `deleteColumn` — additionally, **removes the deleted column from the
  `sourceColumnIds` of every calculation column that referenced it**. A
  calculation pointing at a column that no longer exists would otherwise
  silently change meaning, or compute over a phantom.

That last one is the subtle cascade in this phase and it gets its own tests.

## Testing

Unchanged posture. Domain and `src/db` are TDD against `fake-indexeddb`; there
are deliberately no component tests; UI is verified by driving a real browser.

Specific to this phase:

- `average.ts` is asserted byte-identical.
- A test proves a grade row carrying a note but no value does not affect a
  pupil's average.
- Cascade tests assert zero orphans and that a neighbouring record survives.
- `deleteColumn` has a test proving a calculation referencing the deleted
  column is updated, and one proving a calculation referencing a *different*
  column is untouched.

Validation gate before any task is complete:
`yarn format && yarn lint && yarn typecheck && yarn test`.

## Execution

One plan, three phases of tasks, in the agreed order: annotations, then groups,
then calculations. Each is independently shippable, and annotations need no
schema change at all, so the first commits carry no migration risk.
