# profs — évaluations: one editor for a barème and a grille (design)

Status: designed, not implemented.
Supersedes `2026-09-09-profs-rubric-as-column-design.md`, which made a grille a
`GradeColumn` of `type: "rubric"` with embedded `criteria`. That move stands;
what changes is that the grille stops being one fixed thing.

## What This Is

A grille is hard-coded. `RUBRIC_LEVELS = [1, 2, 3, 4] as const` decides how
many levels there are, `RUBRIC_LEVEL_COLORS` decides what they look like, and
the locale files decide what they are called. The teacher owns exactly one
thing about a grille — the list of critères — and owns it through *Modèle de
grille*, a section of Réglages.

That is the wrong split twice over. A teacher who marks a *passage individuel*
out of sixteen points across four unequal critères cannot express it at all;
a teacher whose établissement uses a three-band acquis scale is given four
bands with names they do not use. And *Modèle de grille* sits in Réglages,
among the theme and the backup, as if a grille were a preference.

So: an **évaluation** becomes a first-class object with its own page, and one
editor produces both of the things French teachers actually build —

- a **barème de correction**: critères worth points, summed, converted to a
  mark, counted in the moyenne;
- a **grille de compétence**: critères assessed on a named scale, rendered as
  a colour, counted in nothing.

They are not two features. A grille de compétence is an évaluation whose
critères are in Niveaux mode, whose display is a band list, and whose
`countsTowardAverage` is false. The editor never asks which kind you are
making.

## The Object

`Rubric`, table `rubrics`, workspace-scoped. The French UI calls it *une
évaluation*; the identifier stays English, and `Rubric` is English for exactly
this — a scoring guide made of criteria. `RubricTemplate` disappears into it.

```ts
interface Rubric {
  id: string;
  lineageId: string;      // stable across versions; what "the same évaluation" means
  version: number;        // 1, 2, 3 — see Lifecycle
  name: string;
  scale: RubricLevel[];   // ordered, at least two entries
  criteria: RubricCriterion[];
  outOf: number | null;   // 20 by default; null = the rubric's own nominal total
  display: RubricDisplay;
  countsTowardAverage: boolean;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface RubricLevel {
  id: string;
  label: string;          // "Non atteint"
  abbrev: string;         // "NA" — what a narrow cell draws
  color: string;          // from LEVEL_COLORS, never a free hex
  value: number;          // integer points this level is worth
}

interface RubricCriterion {
  id: string;
  label: string;
  mode: "points" | "levels" | "checkbox";
  points: number;         // what it is worth — read-only in "levels" mode
  optional: boolean;      // facultatif: blank drops it from total AND max
}

type RubricDisplay =
  | { kind: "number" }
  | { kind: "bands"; bands: RubricBand[] };   // ordered high to low

interface RubricBand {
  threshold: number;      // on the mark, i.e. out of `outOf`
  label: string;
  abbrev: string;
  color: string;
  icon?: string;
}
```

`RubricLevel` is a **new type under an old name**: today it is
`1 | 2 | 3 | 4`, a union of four literals, and every use of it — `isRubricLevel`,
`RUBRIC_LEVEL_COLORS`, `LevelDistribution` keyed by it — goes away with the
fixed scale. Nothing should be carried forward on the strength of the name
matching.

`scale` and `criteria` are embedded rather than tabled, for
`GradeColumn.criteria`'s reason: a level and a critère are never queried,
listed or deleted except through the rubric that owns them, so embedding
avoids a join for something always read whole. A pupil's *score* on a critère
is written one tap at a time, which is what a compound key is for — see *The
Cells*.

### Points, and only points

A critère carries **one** number: what it is worth. Not min, max and coef.

`/4 coef 2` and `/8 coef 1` are the same barème, and this app has already
refused that duplication once — `calculation` columns do not weight, because
`column.weight` already does. A barème is printed on a corrigé as *Justesse …
/8*, one number per line, and that is what the editor asks for.

The cost is real and accepted: a bonus/malus critère (`−2 → +2`) cannot be
expressed. Nothing else here can express it either, and inventing a signed
scale to carry it would put a second number back on every row.

In `levels` mode `points` is derived and read-only: it is the highest `value`
in the scale. That is what makes a grille de compétence fall out — every line
is worth the same, because on a competency grid every competency is.

### What the total becomes

For one pupil:

- `scored` — the critères with a row in `criterionScores`.
- A critère that is `optional` and unscored drops out of **both** the sum and
  the denominator.
- A critère that is not `optional` and unscored makes the grille **incomplete**.
- An incomplete grille yields no mark. The cell shows coverage — `3/4` — and
  the column contributes nothing to any moyenne.

This is today's rule, kept deliberately. A mean over one critère of three sits
in the same column as a mean over all three, and the least-assessed pupil
reliably posts the best figure. A fraction can never be misread as a result.

- `total` = Σ `points` of scored critères.
- `denominator` = Σ `points` of every critère except unscored optional ones.
- `mark` = `total / denominator × outOf`, or `total / denominator × nominal`
  when `outOf` is null, where `nominal` = Σ `points` of every critère.

The denominator varies per pupil; the **column's `max` does not**. It is
`outOf` (or `nominal`), a fixed number, which is what lets `studentAverage`
keep normalising a column by its own max exactly as it does today.

### The display is a skin, never the value

An évaluation always produces a number. `display` decides only how the cell
draws it, through a band list read high to low: the first band whose
`threshold` the mark meets, wins.

- *coché si ≥ 15* is two bands.
- *lettres A–E* is five.
- *couleur seule* is bands with no label drawn.
- *icônes* is bands carrying an `icon`.

The moyenne, `classStats`, the JSON export and the fast-entry screen all read
the number regardless of the skin. One code path computes; one draws. This is
the whole reason letters and colours cost nothing here: they are not a kind of
value, they are a rendering of one.

Opening the band editor on a rubric that already has a scale **pre-fills** it
from that scale — one band per level, `threshold = level.value / topValue ×
outOf` — so a grille de compétence configures its output by not touching it.
A Points-only rubric starts from a two-band ☑/☐.

### Colours

`LEVEL_COLORS`, a fixed palette in `src/domain`, each entry paired with a
measured text colour in both themes. Not a free hex field, for
`SUBJECT_COLORS`' stated reason: a free field lets a teacher choose white on
white, and it scatters literal colours through the components.

A scale takes its colours from a **ramp by rank** as levels are added
(rouge → vert by default), and any single level may be overridden from the
palette. That is what lets *Absent* be grey among four coloured bands without
the teacher colouring the other four by hand.

`--level-1..4` and `RUBRIC_LEVEL_COLORS` / `RUBRIC_LEVEL_TEXT_COLORS` are
replaced by the palette. The four current values become four of its entries,
so a seeded grille still matches a swatch.

## Lifecycle: locked, forked, archived

An évaluation is **editable until a column references it, and frozen from that
moment**. Not from the first recorded mark — from first use.

That is the harshest of the available rules and the only one with a clean
guarantee: what `/evaluations` shows is exactly what every carnet using it
computes, and no edit anywhere can move a moyenne that has already been read.
It is what makes a *reference* safe. A column stores a `rubricId` rather than a
copy, so an évaluation used by sixteen classes is one row and not sixteen — and
the reason `setColumnCriteria` copies critères with fresh UUIDs today
(improving a template must not reach a graded grid) is dissolved rather than
worked around.

**Editing a locked évaluation forks it.** *Modifier* writes a new `rubrics`
row: same `lineageId`, `version + 1`, fresh ids for every level and critère.
Existing columns stay on the old version and are never migrated. `/evaluations`
lists the latest version of each lineage; an older version is reachable from
the columns that use it.

The teacher is not asked to understand this. They press *Modifier*, they edit,
they save; the app versions. The badge on the card (`🔒 v2`) is the whole
explanation.

**Archiver** sets `archivedAt` on a lineage: it disappears from the column
form's picker and moves to the *Archivées* filter on `/evaluations`. Columns
using it keep working. This replaces refusal-to-delete: `deleteRubric` is
offered only for a lineage no column has ever referenced.

## The page

`/evaluations`, a drawer destination after Salles. That placement follows the
salle argument rather than breaking the rule it bends: the drawer excludes
*configuration*, and an évaluation is content — the substance of what a teacher
assesses, not a preference about the app. *Modèle de grille* leaves Réglages
entirely.

A **card grid**, like `/salles`, each card drawn from its **own** critères: one
bar per critère sized by its points, the scale as a strip beneath, then the
name, the lock-and-version badge, what it renders, whether it counts, and the
carnets using it. A teacher recognises an évaluation by its shape before
reading its name, and a card cannot promise one thing and open onto another.
`RubricThumbnail` is `RoomThumbnail`'s counterpart and is the same component
the creation sheet uses to draw a preset.

Filters: *Actives* / *Archivées*. No delete on the list — a lineage in use has
none, and one that is not is deleted from its own page.

**Creation** is a sheet of presets, code constants in `src/domain`, offered
exactly as `ROOM_PRESETS` is behind *Nouvelle salle*: grille de compétences,
barème de correction, oral/exposé, fait / non fait, vierge. A preset stamps and
ceases to exist; nothing records that an évaluation "is a grille de
compétences".

The **editor** is `/evaluations/:rubricId`: the name, the scale, the critères,
`outOf`, the display bands, `countsTowardAverage`. Locked, it renders read-only
with *Modifier* (which forks), *Dupliquer* and *Archiver*.

## The column

```ts
export const COLUMN_TYPES = ["numeric", "text", "calculation", "bareme"] as const;
```

`letter`, `icon`, `checkbox` and `rubric` are removed. Each was a one-critère
évaluation in a different saisie mode, and keeping them would mean two ways to
make the same column. `numeric` survives because a plain /20 mark is the
everyday gesture and must stay one tap to create; `text` survives because an
appréciation is prose about a pupil, not a thing being assessed.

`GradeColumn` gains `rubricId?: string` and keeps `weight`. It no longer needs
`criteria` — those live on the rubric — and its `max` for a `bareme` column is
read from the rubric rather than stored.

`isNumericColumn(type)` cannot answer any more, because whether a column counts
is now a property of its rubric. It is replaced by a resolver in
`src/domain/gradebook`:

```ts
resolveColumn(column, rubric?): { counts: boolean; max: number }
```

`studentAverage` and `classStats` keep taking a flat list and stay ignorant of
rubrics: the caller resolves each column and supplies the pupil's value —
a `Grade` for `numeric`, a computed mark for `bareme`, an evaluated
`CalculationSpec` for `calculation`. That keeps the average pure, and keeps the
FULL-column-list rule intact (`studentAverage` still filters by `periodId`
internally; passing an already-filtered list still changes results silently).

The column form's picker lists the **latest non-archived version of each
lineage**, and nothing else — an older version is reachable only from a column
already on it, and an archived lineage from `/evaluations`. There is no inline
creation: the picker links out to `/evaluations`, the way the class roster
links out rather than growing a second form. A column whose type is `bareme`
and whose `rubricId` names nothing (a hand-edited backup) renders as unset and
contributes nothing, the same resolve-or-ignore rule `?classe` follows.

`GradeValue` loses its `letter`, `icon` and `checkbox` members, `parseGradeValue`
loses their branches, and `parseGradeValue("bareme", …)` returns null the way
`calculation` and `rubric` already do — a `bareme` column stores no `Grade` row
for its value. A cell **note** still writes one, with `note` set and no `value`,
which `writeGrade` and `setGradeNote` already handle.

## The cells

`criterionLevels` becomes `criterionScores`, same compound key:

```
criterionScores: "[columnId+criterionId+studentId], columnId, criterionId, studentId"

interface CriterionScore {
  columnId: string;
  criterionId: string;
  studentId: string;
  points: number;
  levelId?: string;     // present in "levels" mode
  updatedAt: number;
}
```

The key is unchanged, but the **shape** is not, and a store whose shape changed
must be dropped rather than carried forward — otherwise a v17 row with `level:
3` feeds `points` into arithmetic as `undefined`. The rename does that in one
declaration: Dexie diffs by name, so a name it has never held has no prior key
to conflict with. `criterionLevels: null` and `criterionScores: "…"` in the
same version is a drop and an unrelated create, not a change.

Storing **both** `points` and `levelId` is redundant, and the lock is what makes
the redundancy safe: a locked rubric cannot renumber a level, and a fork never
moves an existing column, so the two can never disagree. It buys a direct sum
with nothing to resolve, and a faithful redraw — a scale holding *Absent* worth
0 beside *Non atteint* worth 0 keeps them distinct, which storing points alone
would not.

Saisie per mode, each one tap, the same tap clearing:

- **points** — a numeric field, `parseDecimal` (half-points are ordinary), 0 to
  `points`, out of range refused rather than clamped.
- **levels** — the scale's buttons; tapping the active one clears the row.
- **checkbox** — ☑ writes `points`, ☒ writes 0, tapping the active one clears.
  Three states, because "not marked" and "marked no" are different facts.

The two doors are unchanged: the carnet cell opens the panel **in place**, and
the column header opens the class matrix at
`/gradebooks/:gradebookId/rubric/:columnId`. The matrix is the évaluation's
fast-entry surface, so `/entry/:columnId` stays numeric-only. The in-place
panel's ~300px row stretch stays a known, accepted cost.

## Schema and backup

`db.version(18)`, **no upgrade function**, per the standing rule.

```
rubricTemplates : null
criterionLevels : null
rubrics         : "id, lineageId, name"
criterionScores : "[columnId+criterionId+studentId], columnId, criterionId, studentId"
columns         : "id, gradebookId, periodId, order, rubricId"
```

18 is the next integer above 17 and that is load-bearing: a number equal to or
lower than a workspace's own would make Dexie catch the downgrade, reopen
unversioned, and leave `rubricTemplates` and `criterionLevels` in IndexedDB —
outside `db.tables`, and therefore outside `wipeWorkspace`.

Backup format **13 → 14**, and 14 alone is accepted. A format-13 file names
`rubricTemplates` and `criterionLevels`, stores this schema no longer has, so
its grilles have nowhere to land; half-importing it would leave a workspace
that looks whole and is not. `rubrics` and `criterionScores` must be added by
hand to the export list, to `importWorkspace`'s clear array, to the wipe test
and to the schema table-list test — those two fail until you do, and that is
the guard.

**Accepted loss.** Existing `grades` rows belonging to `letter`, `icon` and
`checkbox` columns survive the bump with no column type to render them:
invisible, never averaged, still exported. This is the same gap `CLAUDE.md`
already records for `numeric → calculation` edits, and it is left there rather
than fixed with an upgrade callback that would run once and never again. A
stale workspace is wiped in Réglages, not migrated.

## Seed

The demo school seeds two évaluations, both already used and therefore already
locked, so `/evaluations` shows the real case on first open rather than an
empty page:

- **Chant — passage individuel** — four critères (Justesse 8 points, Rythme 4,
  Posture 2 in Niveaux, Écoute 2 in Coché), `outOf: 20`, display `number`,
  counts. A barème de correction.
- **Écoute — compétences** — three critères in Niveaux on an NA/EC/A/D scale,
  display bands pre-filled from that scale, does not count. A grille de
  compétence.

Both are graded across the sixteen classes from each pupil's latent aptitude,
as every other seeded surface already is. `MAX_HISTORY_DAYS` and the
date-dependence rules are unchanged: **never assert an exact score count**.

## i18n

New keys under `rubric.*` for the editor and `evaluations.*` for the page, in
both `fr.json` and `en.json` — the parity test fails the build otherwise. The
fifteen `rubric.*` keys naming the fixed 1–4 levels are removed; those labels
are now stored data, and a stored value is never a translated label.

## What Was Rejected

**A level-to-mark conversion table on the scale** ("Acquis vaut 15/20"). It was
the first shape this design took and it is the one `CLAUDE.md` and
`docs/BACKLOG.md` #1 both warned about: it invents a precision the levels do
not carry, and it asks the teacher to state a global equivalence they never
think in. Points per critère replace it, and the numbers are not invented —
the teacher allocated them, exactly as they would on a corrigé.

**Min and coef per critère.** See *Points, and only points*.

**A separate band table for letters, unrelated to the scale.** The bands are
one list that pre-fills from the scale when there is one; two independent lists
would need keeping in agreement forever.

**Freezing at the first recorded mark instead of at first use.** It leaves room
to fix a typo between preparing a grille and using it, and it makes "is this
locked?" a question about data rather than about structure. Forking on edit
gives the typo an answer without the softer rule.

**Copying the rubric into the column, rooms-style.** Consistent with
`ROOM_PRESETS` and with today's `setColumnCriteria`, and rejected because it
makes an évaluation used by sixteen classes sixteen rows that drift, with no
central page worth building. The lock is what makes the reference safe.

**Moving the cell panel into a Sheet.** It would close the documented ~300px
row-stretch gap, and it was declined: opening in place keeps the neighbouring
pupils and the other columns visible, which was the original argument for it.

**Splitting the work into phases.** A half-collapsed `ColumnType` means two
ways to make a checkbox column existing side by side, and every screen carrying
both. One spec, one plan, one branch.

## Consequences for CLAUDE.md

Two statements become false and must change **with** the code, not after it:

- The invariant *"Rubrics never feed an average"* is removed. Its replacement:
  an évaluation counts toward the moyenne when `countsTowardAverage` is true,
  and what it contributes is a mark out of a scale the teacher allocated by
  hand. A grille de compétence still counts toward nothing, by being an
  évaluation that says so.
- `docs/BACKLOG.md` #1's *"deliberately not built"* note on rubric-to-average
  conversion is rewritten to record that it was built, and by what mechanism.

## Testing

Domain and `src/db` are TDD against `fake-indexeddb`, as ever. The cases worth
naming:

- `rubricMark` — complete, incomplete, all-optional-blank, every critère
  optional and none scored, `outOf: null`, a denominator of zero.
- `resolveBand` — the top band, the bottom band, a mark exactly on a threshold,
  a band list of one.
- `forkRubric` — fresh level and critère ids, `lineageId` preserved, `version`
  incremented, existing columns still resolving to the old row.
- The lock predicate — a rubric with no column is editable, one with a column
  is not, one whose only column was deleted becomes editable again.
- `db.version(18)` against a v17 fixture: `rubricTemplates` and
  `criterionLevels` absent from `db.backendDB().objectStoreNames` — the raw
  store list, never `db.tables` — while `grades`, `columns` and `sessions`
  survive.
- `parseBackup` refuses a format-13 file whole.

UI is verified by driving a real browser against `yarn dev` on port 3000. There
are deliberately no component tests.

## Files

New: `src/domain/rubric-presets.ts`, `src/domain/level-palette.ts`,
`src/db/rubrics.ts`, `src/modules/evaluations/` (page, editor, create sheet,
`RubricThumbnail`, scale editor, criteria editor, band editor).

Rewritten: `src/domain/rubric.ts`, `src/db/criterion-levels.ts` →
`criterion-scores.ts`, `src/modules/gradebook/components/column-form.tsx`,
`src/modules/rubric/` (cell, grid, level buttons).

Touched: `src/db/index.ts`, `src/db/types.ts`, `src/db/backup.ts`,
`src/db/cascade.ts`, `src/db/seed.ts`, `src/domain/gradebook/column.ts`,
`grade.ts`, `average.ts`, `src/router.ts`, `src/app.tsx`,
`src/modules/shared/app-drawer.tsx`, `src/modules/settings/page.tsx`
(the *Modèle de grille* section is removed), both locale files, `CLAUDE.md`,
`docs/BACKLOG.md`.
