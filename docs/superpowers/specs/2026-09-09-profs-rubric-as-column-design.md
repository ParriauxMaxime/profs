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

criterionLevels  [columnId+criterionId+studentId]  { level: RubricLevel, updatedAt }
rubricTemplates  unchanged
rubricAssessments  dropped
```

The renames that follow the store: `RubricScore` → `CriterionLevel`,
`RubricScoreLike` → `CriterionLevelLike`, `rubricScoreKey` → `criterionLevelKey`.
`RubricLevel`, `RubricCriterion`, `RubricTemplate` and `RUBRIC_LEVELS` keep their
names — a level and a critère are still rubric vocabulary; only the row that was
named after a dead parent changes.

`weight` and `max` are unused for a rubric column and hidden in the form. They
are not removed from the row: they are fields of every column, and the barème
decision may want `weight` back.

### Where a level lives, and why it is its own row

A level could have been a map inside one `Grade` row —
`{ type: "rubric", levels: Record<criterionId, RubricLevel> }` — collapsing
everything into `grades`. That was rejected on what a single tap costs.

With its own row, setting Justesse to 3 for one pupil is:

```ts
await db.criterionLevels.put({ columnId, criterionId, studentId, level, updatedAt });
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
  levels: CriterionLevelLike[],
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

- `deleteColumn` gains `db.criterionLevels` in its transaction and sweeps
  `where("columnId")`. Its existing `calculation` pruning is unaffected — a
  calculation may not name a rubric column, since only numeric columns are
  valid sources.
- `deleteGradebook` and `deletePeriod` lose their `rubricAssessments` sweeps.
  Both already collect the column ids they are destroying; the scores go with
  them, by `columnId`.
- `deleteStudent` keeps its shape but follows the rename: it already sweeps by
  `studentId`, and that index survives the rekey unchanged.
- `deleteRubricAssessment` is deleted. `deleteRubricTemplate` stays as it is.

`setCriteria` moves from an assessment id to a column id and keeps its cascade:
replacing a column's critères drops the `criterionLevels` of any criterion that did
not survive, in one transaction. Those scores are otherwise unreachable —
invisible in the grid, never summarised, still carried by export.

## Migration

The app is not released. So rather than adding versions 17 and 18 to a chain of
sixteen, **the chain collapses to a single declaration** of the schema as it
now stands. That is the honest expression of "schema changes are disposable":
there is nothing deployed to migrate, so there is no migration — and no history
of migrations to read past when someone wants to know the current shape.

```ts
db.version(17).stores({ …the whole schema, rubricAssessments absent… });
```

**The number is 17, and 1 would have been a silent bug.** This is corrected
from an earlier draft of this spec, which said `db.version(1)` and reasoned
from a `VersionError` that never happens; the subsection below carries the
measurement. 17 is simply the next integer above the chain's last version —
one declaration, no chain, no upgrade callback. The next change bumps to 18 and
writes no upgrade function, exactly as the standing rule has always said.

The store is also **renamed**: `rubricScores` becomes `criterionLevels`. Under
a collapse the rename costs nothing mechanically, and it is right on its own
terms — a *score* was named against an assessment that no longer exists, while
what the row holds is one pupil's level on one critère of one column. The type
`RubricScore` becomes `CriterionLevel`, and `rubricScoreKey` becomes
`criterionLevelKey`, still the only constructor of the key.

Everything the deleted versions did survives only where it is already written
down: `CLAUDE.md` carries the primary-key doctrine, the zombie-row argument and
the reason `Desk` is not `Table`. The per-version comments go with the versions.

### What a collapse does to an existing workspace

**Measured, not reasoned about**, with probes against Dexie 4 and
`fake-indexeddb` — because the reasoning was wrong twice before the probe
settled it.

At **17**, the upgrade runs forwards, as an upgrade. Dexie diffs the
declaration against the stored schema, **deletes** the stores that are gone —
`rubricAssessments`, `rubricScores`, and the older casualties before them — and
carries every surviving store forward with its rows untouched. Nothing rejects,
`initWorkspace` resolves, and `RecoveryShell` is never reached. A grille already
graded is lost because its STORE is dropped, not because the workspace is
discarded.

**The trap, worth writing down so nobody rediscovers it: Dexie swallows a
downgrade.** A number LOWER than the stored one — `db.version(1)` against a v16
workspace — provokes a real `VersionError` from IndexedDB, and `dexieOpen`
catches it:

```js
case 'VersionError':
    if (nativeVerToOpen > 0) {
        nativeVerToOpen = 0;
        return tryOpenDB();     // reopen with no version at all
    }
```

It then patches the declared schema into whatever it found, warning `Dexie
SchemaDiff: Schema was extended without increasing the number passed to
db.version()`. The database opens. `db.tables` reads exactly as it does at 17.
And the stores that are gone are **not** deleted: they stay in IndexedDB,
outside `db.tables` — which is what `wipeWorkspace` and the backup's clear list
both read. A term of pupils' levels would survive *supprimer toutes les
données*, invisible and unreachable, against a `PRIVACY.md` that calls that
erase permanent.

That is why `src/db/index.test.ts` asserts the dropped stores are absent from
`db.backendDB().objectStoreNames` and deliberately **not** from `db.tables`: a
`db.tables` assertion passes under either number and would have caught nothing.

**`src/domain/recovery.ts`'s one-line fix stays, and is no longer load-bearing
for this design.** `VersionError` was classified `retry`, and
`offersDiscard("retry")` is `false`, so a panel offering only *Recharger* would
have failed identically, forever. It is removed from `RETRY_ERRORS` and falls
through to `corrupt`. The comment above that list is corrected with it: the case
it describes — another tab holding the database mid-upgrade — raises
`BlockedError` or `DatabaseClosedError`, never `VersionError`. `VersionError`
means *the code is older than the database*, which no reload can fix.

**This is a latent bug independent of this design**, which is the whole reason
it survives the correction: a device running a stale service-worker shell after
any schema bump can still meet a `VersionError` that reaches a caller, and it
must land on the branch offering a way out. What is no longer true is that this
design depends on it — nothing here produces a `VersionError` any more.

When a discard does happen, it deletes the database and keeps the registry
entry, so the workspace returns **named and empty**. It does not return seeded:
`seedIfEmpty` gates on `profs-seeded-workspaces` in `localStorage`, which the
discard does not touch, and that is deliberate — Réglages promises the wipe is
permanent, and one discard that reseeds while another does not is two meanings
for one word.

### What is lost

**Grilles already graded**, in the database and in an exported file alike.

**Not the séance backfill**, which is the one thing the collapse must keep. It
was listed here as lost while the migration was still believed to discard an old
workspace; at 17, `sessions` is carried FORWARD, so a séance recorded before
séances carried times arrives with no `startsAt` — and both `startsAt` and
`endsAt` are required on `Session`. A row that fails its own declaration is the
zombie the standing rule drops stores to avoid, and here dropping is not
available: `attendance` and `behaviourEvents` are keyed to `sessions.id`, so
losing `sessions` strands a term of both. That is exactly the argument
`db.version(16)` was written for, and it survives the collapse unchanged.

So the single declaration carries one `.upgrade()`, which is still one version:

```ts
db.version(17).stores({ … }).upgrade(async (tx) => { …repairSeanceCollisions… });
```

It repairs the séances as a WHOLE collection, never row by row —
`backfillSeanceTimes` alone cannot see that two untimed séances of one class on
one day floor to the same hour, and the first `resolveSlot` match would strand
the second forever. `repairSeanceCollisions` therefore keeps its one real
caller. `backup.ts`'s call is still gone: with one backup format accepted, every
imported séance already carries times.

**The upgrade-seam regression tests** in `src/db/index.test.ts` — the v2
per-class layout, the v9 saved room, the v13 day-keyed journal, the v15 entry.
They build a database at an earlier version and open it with current code,
which one declaration leaves nothing to say: there are no intermediate versions
left for a fixture to sit at. They are deleted and replaced by the tests named
below.

**A backup file is accepted at the current format and no other, as a standing
rule.** `parseBackup` accepts `z.union([literal(11), literal(12)])` today, and
that union is the thing to remove rather than extend: a format is only
importable while every store it names still exists, which is a coincidence each
accumulated literal has been quietly relying on. From here it is one
`z.literal(N)`, and a schema change that drops a store bumps N.

The format goes to **13** rather than back to 1 alongside the schema. The number
now carries no history — nothing older is accepted — but it must stay
monotonic, or a file written today reads as older than one written last week to
anyone who opens it in a text editor.

11 and 12 are both refused. Both export `rubricAssessments`, so both carry
grilles with nowhere to land, and half-importing a file is worse than refusing
it — the ruling a format-10 file already gets.

Four edits in `backup.ts`, all by hand because the export is a literal and
nothing else will notice: `rubricAssessments` leaves `WorkspaceBackup`, the
validation schema and the export/import bodies; `rubricScores` becomes
`criterionLevels` throughout and its validated shape swaps `assessmentId` for
`columnId` (it is validated on its key fields, not `.loose()` alone, so it will
not pass silently); the version union becomes a literal; and the clear list is
untouched, since it reads `db.tables`.

One consequence to settle while doing it: the import path applies
`repairSeanceCollisions` unconditionally, to give times to séances from a
format-11 file. With only format 13 accepted, every imported séance already
carries times and that repair is inert. Inert defensive code is not this
codebase's habit, so it should go — but it is a subtraction outside this
design's subject, and it should be made deliberately rather than swept along.

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

Recovery (`src/domain/recovery.test.ts`): `VersionError` classifies as
`corrupt` and therefore `offersDiscard`. This is the test that stands in for
every deleted seam test — the guarantee is no longer "an old row is dropped
cleanly" but "an old database offers a way out", and that is now the only thing
standing between a version collapse and a bricked workspace.

Schema (`src/db/index.test.ts`): the four upgrade-seam tests are deleted, and
five replace them, over one fixture that writes a row into every store the
declaration drops — including `seats`, `seatingLayouts` and `diaryEntries`, so
the deleted v12 and v14 seam tests keep a successor. Open it with current code
and assert (a) every dropped store is gone from `backendDB().objectStoreNames`,
which is the assertion the downgrade trap makes necessary — `db.tables` reads
the same either way, (b) every surviving store keeps its rows and nothing
rejects, (c) an untimed séance comes back timed with its attendance and
behaviour intact, (d) two untimed séances of one class on one day come back
with different starts, and (e) a `VersionError` that does reach a caller still
classifies as discardable. The table-list test and the wipe test stay, and both
gain `criterionLevels`.

Backup (`src/db/backup.test.ts`): a format-11 file and a format-12 file are each
refused whole; a format-13 round-trip carries rubric columns and their levels;
the double-import row-count comparison covers `criterionLevels` at its new key.
That comparison is why `criterionLevels` must be added to the export literal
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
