# profs — the grille is a column, not a screen (design)

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning
**Follows:** phase 2B (rubrics, `docs/BACKLOG.md` #1, shipped)

## What This Is

The app holds two evaluation models. They share a parent row, a period and a
roster, and **nothing else** — no average crosses between them, no screen shows
both, and the one field that would have joined a grille to a lesson,
`RubricAssessment.sessionId`, has never been written by anything.

The judgement made here is that the split was in the wrong place. A grille is
not a second kind of marking that needs a second destination; it is **one
column of a carnet whose cell happens to open**. Marking is already a grid, the
grid is already where a teacher is, and a grille reached at
`class → carnet → Grilles → the assessment` is four taps from the lesson it is
being used in.

So `RubricAssessment` ceases to exist as a row and becomes a `GradeColumn` of
type `rubric`. The carnet becomes the live assessment surface it was always
shaped like.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
mid-lesson tap targets, writes in `src/db/` and never in a component, and
`PupilName` as the only place a pupil's name is composed.

## What This Deliberately Does Not Do

**A level still never becomes a mark.** The opt-in barème — a teacher stating
`1→4, 2→9, 3→14, 4→18` and letting a grille count toward the moyenne — is a
direction this design is built to accept later and does not take now.
`isNumericColumn("rubric")` is `false`, `studentAverage` and `classStats` are
untouched, and **nothing on a bulletin can move as a result of this change.**
That is the property that makes the pass affordable; the argument about whether
a competency scale should feed a /20 average is left exactly where
`docs/BACKLOG.md` #1 left it.

Also out: progression of one critère across grilles, critère weights, a link
from a grille to a séance, the group filter on the matrix, and fast entry
(`/entry/:columnId`) for a rubric column.

## The Ruling: The Column Is The Assessment

A `RubricAssessment` today carries `gradebookId`, `periodId`, a name, a date and
an embedded criteria list. A `GradeColumn` carries `gradebookId`, `periodId`, a
label, a dead `date` and — for exactly one type — an embedded `calculation`
spec. They are the same row, written twice, one of them reachable from the grid
and one of them not.

The alternative kept on the table until the end was a `GradeColumn` that
*points* at an assessment (`assessmentId?`, meaningful only for `type:
"rubric"`). It was rejected because it leaves a grille with two parents — a
column, and a gradebook plus a period — and the first question it raises has no
good answer: what happens to the assessment when its column is deleted. Every
answer either strands data or deletes something the teacher did not name.

### The precedent this follows

`GradeColumn` already carries two fields meaningful for one type only: `max`
("only meaningful when type is numeric") and `calculation` ("only meaningful
when type is `calculation`"). `criteria` is the third instance of a pattern the
schema already states twice.

`calculation` is worth reading before implementing this, as the near-miss it
is: it is the app's only existing column type whose payload lives on the
COLUMN rather than in the cells. A rubric column is its mirror — payload on the
column, but cells that are *recorded* rather than derived.

### `date` stops being dead

`ColumnForm` stamps `date: Date.now()` on every column it creates and nothing
in the app reads it. A rubric column is the one column type that genuinely
happened on a day — "Oral du 12/09" — so `date` is read in the column header
for `type: "rubric"`. It stays unread for every other type; making it
meaningful everywhere is a different change.

## The Schema

```ts
ColumnType = "numeric" | "letter" | "icon" | "checkbox" | "text"
           | "calculation" | "rubric"

GradeColumn {
  id, gradebookId, periodId, order,
  type, label, weight, max, date?, calculation?,
  criteria?: RubricCriterion[],   // only meaningful when type is "rubric"
}

rubricScores  [columnId+criterionId+studentId]  { level: RubricLevel, updatedAt }
rubricTemplates  unchanged
rubricAssessments  dropped
```

`weight` and `max` are unused for a rubric column and hidden in the form. They
are not removed from the row: they are fields of every column, and the barème
decision may want `weight` back.

### Where a level lives, and why it is its own row

A level could have been a map inside one `Grade` row —
`{ type: "rubric", levels: Record<criterionId, RubricLevel> }` — collapsing
everything into `grades`. That was rejected on what a single tap costs.

With its own row, setting Justesse to 3 for one pupil is:

```ts
await db.rubricScores.put({ columnId, criterionId, studentId, level, updatedAt });
```

One record. Nothing read first. Clearing is one `delete`.

With a map it is a read-modify-write of a collection, which this codebase bans
for grades, and three consequences follow that are not about speed:

1. **Two fast taps can lose one.** If the second read lands before the first
   write, the second `put` writes a map that never contained the first level,
   and it is gone silently. `EntryPage` already carries `pendingNoteWrite`,
   `skipNoteBlurRef` and `isCommitting` because a note write and a value write
   raced on one row; a map reproduces that race *per critère*, on a surface
   built for rapid tapping.
2. **Clearing acquires a decision.** Removing the last critère leaves
   `levels: {}` — the empty husk `writeGrade` goes out of its way never to
   store — so the clear path must detect it and delete the row instead.
3. **Every write site carries the merge.** `put` replaces the row, so a note
   must be spread forward explicitly at each one.

The compound key *is* the merge. This is the same reasoning that keys `Grade`
`[gradebookId+columnId+studentId]` and `Assignment` `[planId+deskId]`, and it is
the codebase's own stated rule for the fork: embedded when always read whole
(`criteria`), its own row with a compound key when written and cleared one at a
time (a level).

A consequence worth stating: a rubric column's cells produce **no `Grade`
rows**. `parseGradeValue` returns `null` for the type, exactly as it does for
`calculation`, so no editor path can create a row the next render discards.
`GradeValue` gains no variant.

## The Cell

A cell has three states, and the rule producing them is a pure function in
`src/domain/rubric.ts` rather than a component detail — the `weekParity`
posture, for the `weekParity` reason: a cell showing `4,0` over one critère
looks exactly like a cell showing `4,0` over three, and nobody checks a mean
against another mean.

```ts
export type RubricCell =
  | { state: "empty" }                                    // —
  | { state: "partial"; scored: number; total: number }   // 2/3
  | { state: "complete"; mean: number };                  // ◉ 3,0

export function rubricCell(
  scores: RubricScoreLike[],
  criteria: RubricCriterion[],
  studentId: string,
): RubricCell;
```

**No mean until every critère is scored.** A mean over a third of a grille sits
in the same column as a mean over all of it, and the least-assessed pupil
reliably posts the best figure. Every number in the column is therefore over the
same denominator, always.

**An incomplete cell shows its coverage instead.** `2/3` is progress, not a
result, and a fraction can never be misread as a level. It flips to the mean the
moment the last critère lands. Mid-lesson, "who have I not done yet" is the
question actually being asked, and without this an untouched pupil and a
half-assessed one are indistinguishable.

Never both at once: a cell shows a fraction or a mean, and the transition
between them is the assessment finishing.

`studentMean`, `criterionMean` and `levelDistribution` survive unchanged —
they are the matrix's reporting strip, and they remain for reading a grid,
never for a bulletin.

## The Two Doors

The grid already has this shape for numeric columns: the **header** links to
fast entry, the **cell** edits in place. A rubric column takes the same two
doors, so the gesture is learned once.

**Cell → one pupil.** `EditableCell` gains a rubric branch: it draws the
`RubricCell` and opens that pupil's critères, scored with `LevelButtons` —
one tap sets a level, the same tap clears it, no save button. This is the
mid-lesson gesture.

**Header → the class matrix.** A new route
`/gradebooks/:gradebookId/rubric/:columnId`, mirroring `/entry/:columnId`.
`RubricGrid` renders there essentially as built: the pupil-by-critère matrix at
`md` and above, criterion-at-a-time below it, means and distributions beneath
both.

`Rubrics` (`/gradebooks/:id/rubrics`) and `Rubric`
(`/gradebooks/:id/rubrics/:assessmentId`) are **removed with no redirect**,
unlike the class tabs' `*Legacy` routes. A redirect exists to land an old
bookmark on something real; an `assessmentId` names a row that no longer
exists in any workspace, so there is nothing real to land on.

`ColumnForm` for `type: "rubric"`: intitulé, période, and critères from
`vierge` or a template. A template's criteria are copied **with fresh ids** —
the rule survives the move intact, and for its original reason: shared ids
would make a level written against one column silently readable from another,
and improving a template later could never reach a grid already graded.

`RubricTemplate` and its Réglages panel are untouched. It is a critères
library, and a library is exactly what survives when the thing it seeded stops
being a row of its own.

## Deletes

Every multi-table delete stays in `src/db/cascade.ts`, one `rw` transaction
each.

- `deleteColumn` gains `db.rubricScores` in its transaction and sweeps
  `where("columnId")`. Its existing `calculation` pruning is unaffected — a
  calculation may not name a rubric column, since only numeric columns are
  valid sources.
- `deleteGradebook` and `deletePeriod` lose their `rubricAssessments` sweeps.
  Both already collect the column ids they are destroying; the scores go with
  them, by `columnId`.
- `deleteStudent` needs **no change**. It already sweeps `rubricScores` by
  `studentId`, and the rekey does not touch that index.
- `deleteRubricAssessment` is deleted. `deleteRubricTemplate` stays as it is.

`setCriteria` moves from an assessment id to a column id and keeps its cascade:
replacing a column's critères drops the `rubricScores` of any criterion that did
not survive, in one transaction. Those scores are otherwise unreachable —
invisible in the grid, never summarised, still carried by export.

## Migration

The primary key of `rubricScores` changes, which Dexie refuses outright with
`UpgradeError: Not yet support for changing primary key`. The sanctioned shape
is two versions, per `db.version(7)`/`(8)`:

```ts
db.version(17).stores({ rubricAssessments: null, rubricScores: null });
db.version(18).stores({
  rubricScores: "[columnId+criterionId+studentId], columnId, criterionId, studentId",
});
```

`db.version(16)` is taken — the séance-times backfill — so these are the next
two free numbers. That version also carries the first upgrade callback in the
file, for a field becoming required underneath rows that carry dependents. It
does not apply here: this is a changed primary key, the case the standing rule
already excludes and Dexie refuses outright, so drop-then-recreate remains the
only shape available.

`rubricScoreKey` in `src/db/index.ts` takes an `assessmentId`; it becomes
`columnId`. It is the only constructor of the key and must stay so.

No upgrade callback. **Grilles already graded are lost**,
in the database and in an exported file alike. That cost was weighed and
accepted: converting on import would put a format-11 fixture and its conversion
code in the importer permanently, and an in-place upgrade across a changed
primary key is the exact case that bricks a workspace rather than wiping it.

`rubricAssessments` must be dropped rather than left standing: its rows name a
model nothing reads, and a backup taken afterwards would export them intact —
the silent-zombie failure `db.version(7)` was written for.

**Backup format goes to 13, and 11 and 12 are both refused.** `parseBackup`
currently accepts `z.union([literal(11), literal(12)])`; that becomes
`literal(13)` alone. Both older formats export `rubricAssessments`, so both
carry grilles that have nowhere to land — and half-importing a file is worse
than refusing it, the ruling a format-10 file already gets.

Three edits in `backup.ts`, all by hand because the export is a literal and
nothing else will notice: `rubricAssessments` leaves `WorkspaceBackup`, the
validation schema and the export/import bodies; `rubricScores`' validated shape
swaps `assessmentId` for `columnId` (it is validated on its key fields, not
`.loose()` alone, so it will not pass silently); and the clear list is
untouched, since it reads `db.tables`.

Refusing a format-12 file written days earlier is a real cost, and it is the
one this design accepts rather than carrying a conversion. It is the same
trade the drop makes in the database.

## Seed

`seed.ts` builds a `RubricTemplate` and one assessment per class with scores
drawn from each pupil's latent aptitude. That becomes a rubric **column** per
class, in the first period, with its critères copied from the template and its
`date` set within the seeded history window. The template itself is unchanged.

## Tests

Domain (`src/domain/rubric.test.ts`), TDD:
- `rubricCell` across empty, partial and complete.
- A pupil scored on every critère, then a critère added — the cell must fall
  back from `complete` to `partial` rather than keep a stale mean.
- A pupil scored on a critère since removed — `rubricCell` counts against the
  CURRENT criteria list, never against the scores it happens to hold.

DB (`src/db/rubrics.test.ts`, `src/db/cascade.test.ts`):
- `setScore` / `clearScore` at the new key: one row written, one row deleted,
  neighbours untouched.
- `setCriteria` on a column drops orphaned scores in one transaction.
- `deleteColumn`, `deleteGradebook`, `deletePeriod` each leave no score behind.
- `deleteStudent` still sweeps by `studentId` after the rekey.

Schema seam (`src/db/index.test.ts`) — the standing requirement that every
schema change gets one, since nothing else in the suite runs new code against an
old row: build a **v16** database with `fake-indexeddb` holding a
`rubricAssessment` and an old-keyed `rubricScore`, open it with current code,
and assert both are gone rather than carried forward as zombies.

Backup (`src/db/backup.test.ts`): a format-11 file and a format-12 file are each
refused whole; a format-13 round-trip carries rubric columns and their scores;
the double-import row-count comparison covers `rubricScores` at its new key.
That comparison is why `rubricScores` must be added to the export literal
deliberately — a store missing *entirely* keeps its count on both passes, which
is how the day-keyed journal store went unexported for a whole commit with
every backup test green.

UI is verified by driving a real browser against `yarn dev` on :3000, per the
standing posture — there are deliberately no component tests.

## Consequences Worth Recording

- The class page still does not show a grille. It shows a `CarnetsPanel`, and a
  grille is now inside a carnet rather than beside one — which is a shorter path
  than it was, and not yet the lesson-side entry a later pass may want.
- A rubric column's mean is not comparable across columns with different
  critères, and nothing says so. Within a column it is comparable by
  construction, which is what the completeness rule buys.
- `RubricAssessment.sessionId` dies with the row. The question it was asking —
  does a grille belong to a lesson — is not answered here; it is un-asked, and
  will need re-asking on the séance side rather than as a dangling field.
