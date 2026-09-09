# The Grille Is A Column — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a rubric assessment from a standalone screen into a `GradeColumn` of type `"rubric"` whose cell opens into its critères, so the carnet becomes the live assessment surface.

**Architecture:** `RubricAssessment` stops being a row: a column carries the critères embedded (the `calculation` precedent) and a level keeps its own row, rekeyed `[columnId+criterionId+studentId]` in a store renamed `criterionLevels`. The Dexie version chain collapses to a single `db.version(1)`, which is only safe once `VersionError` classifies as recoverable. No level ever becomes a mark: `isNumericColumn("rubric")` is `false`, so `studentAverage` is untouched and nothing on a bulletin can move.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Chicane router, TailwindCSS, Jest + fake-indexeddb, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-09-profs-rubric-as-column-design.md`

## Global Constraints

- **Node is not on PATH.** Every `yarn` command needs this first, in the same shell:
  `export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"`
- **Validation gate — all four must be green before any task is done:**
  `yarn format && yarn lint && yarn typecheck && yarn test`
- **No network request of any kind.** No `fetch`, no CDN, no external font or image. This is a documented promise in `README.md` and `PRIVACY.md`.
- **No `window.confirm`, `alert`, `beforeunload`, or any blocking browser dialog.** Destructive actions use `ConfirmButton`.
- **Every user-visible string goes through `t()`, and every key must exist in BOTH** `src/i18n/locales/fr.json` **and** `en.json` — a parity test fails the build otherwise. `fr` is the default and the fallback.
- **Identifiers are English; only translation values are French.**
- **Writes live in `src/db/`, never inline in a component.**
- **Every multi-table delete lives in `src/db/cascade.ts`,** each a single `rw` transaction.
- **IDs come from `crypto.randomUUID()`; timestamps are `Date.now()` epoch-ms.**
- **Pupil names render only through `PupilName`.**
- **Navigation uses Chicane `<Link to={Router.X({...})}>`,** never a raw `<a href>`.
- **A rubric level never enters an average.** `isNumericColumn("rubric")` is `false` and stays false in this plan.
- **There are deliberately no component tests.** UI is verified by driving a real browser against `yarn dev` on port 3000.
- **Tests run in the `node` environment** with `import "fake-indexeddb/auto"` at the top of any suite touching Dexie.

---

## File Structure

**Created**
- `src/db/criterion-levels.ts` — every write to a level: `setLevel`, `clearLevel`, `setColumnCriteria`. Replaces the level half of `src/db/rubrics.ts`.
- `src/modules/rubric/cell.tsx` — the closed cell and the one-pupil panel behind it.
- `src/modules/rubric/components/criteria-field.tsx` — the column form's critères section (template picker + `CriteriaEditor`).

**Modified**
- `src/domain/gradebook/column.ts` — `"rubric"` joins `COLUMN_TYPES`.
- `src/domain/gradebook/grade.ts` — `parseGradeValue` refuses `"rubric"`.
- `src/domain/rubric.ts` — `CriterionLevelLike`, `RubricCell`, `rubricCell`.
- `src/db/types.ts` — `GradeColumn.criteria`, `CriterionLevel` replaces `RubricScore`, `RubricAssessment` deleted.
- `src/db/index.ts` — one `db.version(1)`, `criterionLevelKey`.
- `src/db/rubrics.ts` — reduced to template writes only.
- `src/db/cascade.ts` — `deleteColumn` sweeps levels; assessment cascades deleted.
- `src/db/backup.ts` — format 13, single literal, `criterionLevels`.
- `src/db/seed.ts` — a rubric column per class instead of an assessment.
- `src/domain/recovery.ts` — `VersionError` no longer classifies as `retry`.
- `src/modules/gradebook/page.tsx` — loads levels, renders the rubric cell, header link to the matrix.
- `src/modules/gradebook/components/column-form.tsx` — the `"rubric"` branch.
- `src/modules/rubric/grid.tsx` — takes a `columnId`, drops the assessment.
- `src/modules/rubric/page.tsx` — becomes the matrix route only.
- `src/router.ts`, `src/app.tsx` — one rubric route replaces two.
- `src/i18n/locales/{fr,en}.json`.

**Deleted**
- `src/modules/rubric/components/assessment-form.tsx`.
- The assessment half of `src/db/rubrics.ts` and its tests.
- Four upgrade-seam describes in `src/db/index.test.ts`.

---

### Task 1: A database the code is too old for offers a way out

`VersionError` classifies as `retry`, which offers only *Recharger* — a button that fails identically, forever. Task 2 makes every existing workspace raise it, so this lands first. It is also a live bug on its own: a stale service-worker shell after any schema bump hits the same wall.

**Files:**
- Modify: `src/domain/recovery.ts:31` (the `RETRY_ERRORS` list and the comment above it)
- Test: `src/domain/recovery.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `classifyOpenFailure(error: unknown): RecoveryKind` — unchanged signature, changed behaviour for `VersionError`. Task 2 relies on it returning `"corrupt"`.

- [ ] **Step 1: Write the failing test**

Append to `src/domain/recovery.test.ts`:

```ts
describe("a database newer than the code", () => {
  it("offers the discard rather than a reload that cannot work", () => {
    // IndexedDB throws this when the declared version is LOWER than the
    // stored one — the code is older than the database. No reload fixes it:
    // the same build comes back. A stale service-worker shell after a schema
    // bump reaches this too, not only a version collapse.
    const error = { name: "VersionError", message: "Database version 1 is smaller than 16" };
    expect(classifyOpenFailure(error)).toBe("corrupt");
    expect(offersDiscard(classifyOpenFailure(error))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/domain/recovery.test.ts
```

Expected: FAIL — `Expected: "corrupt", Received: "retry"`.

- [ ] **Step 3: Take `VersionError` out of the retry list**

In `src/domain/recovery.ts`, replace the `RETRY_ERRORS` block (its comment included) with:

```ts
/**
 * Reloading fixes it. Another tab holding the database mid-upgrade, a
 * connection closed underneath us — the data is intact and nothing should be
 * offered that touches it.
 *
 * `VersionError` is deliberately NOT here. It means the declared version is
 * lower than the stored one — the code is older than the database — which a
 * reload cannot fix, since the same build comes back. It falls through to
 * `corrupt`, the branch that offers the discard. The case this list's comment
 * used to claim for it (another tab mid-upgrade) raises `BlockedError` or
 * `DatabaseClosedError`, never this.
 */
const RETRY_ERRORS = ["DatabaseClosedError", "AbortError", "TimeoutError"] as const;
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
yarn test src/domain/recovery.test.ts
```

Expected: PASS, and every pre-existing test in the file still passes.

- [ ] **Step 5: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/recovery.ts src/domain/recovery.test.ts
git commit -m "fix(recovery): a database the code is too old for is not a reload away

VersionError classified as retry, whose panel offers only Recharger — a
button that fails identically, forever, with the pupils still in
IndexedDB and no route to the wipe. It means the code is older than the
database, which no reload fixes; a stale service-worker shell after any
schema bump reaches it. It falls through to corrupt, which offers the
discard."
```

---

### Task 2: A column type that holds critères, and the cell rule

Pure domain, no database. `GradeColumn` gains an optional field, which is safe to add before the schema moves.

**Files:**
- Modify: `src/domain/gradebook/column.ts`
- Modify: `src/domain/gradebook/grade.ts:60-90` (the `parseGradeValue` switch)
- Modify: `src/domain/rubric.ts`
- Modify: `src/db/types.ts:62-73` (`GradeColumn`)
- Test: `src/domain/gradebook/column.test.ts`, `src/domain/gradebook/grade.test.ts`, `src/domain/rubric.test.ts`

**Interfaces:**
- Consumes: `RubricCriterion`, `RubricLevel` from `src/domain/rubric.ts` (existing).
- Produces:
  - `ColumnType` now includes `"rubric"`.
  - `interface CriterionLevelLike { criterionId: string; studentId: string; level: RubricLevel }`
  - `type RubricCell = { state: "empty" } | { state: "partial"; scored: number; total: number } | { state: "complete"; mean: number }`
  - `function rubricCell(levels: CriterionLevelLike[], criteria: RubricCriterion[], studentId: string): RubricCell`
  - `GradeColumn.criteria?: RubricCriterion[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/rubric.test.ts`:

```ts
describe("rubricCell", () => {
  const criteria = [
    { id: "just", label: "Justesse" },
    { id: "ryth", label: "Rythme" },
    { id: "ecou", label: "Écoute" },
  ];
  const level = (criterionId: string, studentId: string, level: RubricLevel) => ({
    criterionId,
    studentId,
    level,
  });

  it("is empty when the pupil has no level at all", () => {
    expect(rubricCell([], criteria, "adam")).toEqual({ state: "empty" });
  });

  it("counts progress while the grille is unfinished, and shows no mean", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({
      state: "partial",
      scored: 2,
      total: 3,
    });
  });

  it("means only once every critère is in", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4), level("ecou", "adam", 3)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "complete", mean: 3 });
  });

  it("falls back to partial when a critère is added under a finished pupil", () => {
    // The mean must not survive the denominator changing: a stale 3,0 over
    // three critères sitting in a column of four is the silently-wrong number
    // the completeness rule exists to refuse.
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4), level("ecou", "adam", 3)];
    const grown = [...criteria, { id: "inte", label: "Intention" }];
    expect(rubricCell(levels, grown, "adam")).toEqual({ state: "partial", scored: 3, total: 4 });
  });

  it("counts against the CURRENT critères, never against the levels it holds", () => {
    // A level for a critère since removed is unreachable data. Counting it
    // would report 3/2 and mean a level nothing displays.
    const levels = [
      level("just", "adam", 2),
      level("ryth", "adam", 4),
      level("gone", "adam", 1),
    ];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "partial", scored: 2, total: 3 });
  });

  it("ignores other pupils", () => {
    const levels = [level("just", "adam", 2), level("ryth", "lucas", 4)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "partial", scored: 1, total: 3 });
  });

  it("is empty when the column has no critère yet", () => {
    expect(rubricCell([], [], "adam")).toEqual({ state: "empty" });
  });

  it("rounds the mean to two decimals", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 3), level("ecou", "adam", 3)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "complete", mean: 2.67 });
  });
});
```

Append to `src/domain/gradebook/column.test.ts`:

```ts
it("keeps a rubric column out of every average", () => {
  // A level is not a mark. This is the invariant the whole design rests on:
  // studentAverage only ever sees numeric columns.
  expect(isNumericColumn("rubric")).toBe(false);
});
```

Append to `src/domain/gradebook/grade.test.ts`:

```ts
it("refuses input on a rubric column, the way it refuses a calculation", () => {
  // A rubric column stores no Grade row — its levels live in criterionLevels
  // — so accepting input here would create a row the next render discards.
  expect(parseGradeValue("rubric", "3")).toBeNull();
  expect(parseGradeValue("rubric", "")).toBeNull();
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/domain/rubric.test.ts src/domain/gradebook/column.test.ts src/domain/gradebook/grade.test.ts
```

Expected: FAIL — `rubricCell is not a function`, and type errors on `"rubric"` not being a `ColumnType`.

- [ ] **Step 3: Add the type**

In `src/domain/gradebook/column.ts`, extend the tuple and the doc comment:

```ts
export const COLUMN_TYPES = [
  "numeric",
  "letter",
  "icon",
  "checkbox",
  "text",
  "calculation",
  "rubric",
] as const;
```

Then extend `isNumericColumn`'s comment — no code change, it already returns `type === "numeric"`:

```ts
/**
 * Only numeric columns contribute to averages. A `calculation` column is
 * derived and a `rubric` column holds levels rather than marks; both are
 * deliberately excluded. A level is not a mark out of 20 and no conversion
 * exists — see `src/domain/rubric.ts`.
 */
```

- [ ] **Step 4: Refuse input on a rubric cell**

In `src/domain/gradebook/grade.ts`, add a case to `parseGradeValue`'s switch, beside `calculation`:

```ts
    case "rubric":
      // A rubric column stores no Grade row: its levels live in
      // `criterionLevels`, one row per critère. Accepting input here would
      // create a value the next render discards — the same lie a
      // `calculation` would tell.
      return null;
```

- [ ] **Step 5: Write the cell rule**

In `src/domain/rubric.ts`, rename `RubricScoreLike` to `CriterionLevelLike` (the store it was named after is going) and append:

```ts
/** What `rubricCell` and the summaries need from one level row. */
export interface CriterionLevelLike {
  criterionId: string;
  studentId: string;
  level: RubricLevel;
}

/**
 * What one pupil's rubric cell shows in the carnet.
 *
 * `complete` is the only state carrying a mean, and that is the whole point.
 * A mean over one critère of three sits in the same column as a mean over all
 * three, and the least-assessed pupil reliably posts the best figure — so
 * every mean in a column is over the same denominator, always. While the
 * grille is unfinished the cell shows its coverage instead: `2/3` is progress
 * rather than a result, and a fraction can never be misread as a level.
 *
 * The count is taken against the CURRENT criteria list, never against the
 * levels held: a level for a critère since removed is unreachable in the UI
 * and must not make a cell read 3/2.
 */
export type RubricCell =
  | { state: "empty" }
  | { state: "partial"; scored: number; total: number }
  | { state: "complete"; mean: number };

export function rubricCell(
  levels: CriterionLevelLike[],
  criteria: RubricCriterion[],
  studentId: string,
): RubricCell {
  const total = criteria.length;
  if (total === 0) return { state: "empty" };

  const wanted = new Set(criteria.map((criterion) => criterion.id));
  const mine = levels.filter(
    (row) => row.studentId === studentId && wanted.has(row.criterionId),
  );
  if (mine.length === 0) return { state: "empty" };
  if (mine.length < total) return { state: "partial", scored: mine.length, total };

  return {
    state: "complete",
    mean: round2(mine.reduce((sum, row) => sum + row.level, 0) / total),
  };
}
```

Update the two summary signatures in the same file to the new name — `studentMean(scores: CriterionLevelLike[], …)` and `criterionMean` / `levelDistribution` likewise. `round2` already exists in the module.

- [ ] **Step 6: Add the field to the row type**

In `src/db/types.ts`, extend `GradeColumn` and its doc comment:

```ts
/**
 * One assessment column. `max` only meaningful when type is "numeric".
 *
 * `calculation` is only meaningful when `type` is "calculation": the column
 * stores no grade rows of its own, its value is derived on read from other
 * columns' grades. See `src/domain/gradebook/calculation.ts`.
 *
 * `criteria` is only meaningful when `type` is "rubric", and it is the third
 * instance of that pattern rather than a new one. Embedded rather than its own
 * store for `RubricAssessment.criteria`'s reason, which it inherits: a
 * critère is never queried, listed or deleted except through its column, so
 * embedding avoids a join for something always read whole. A LEVEL is the
 * opposite and keeps its own row — see `criterionLevels`.
 */
export interface GradeColumn {
  id: string;
  gradebookId: string;
  periodId: string;
  type: ColumnType;
  label: string;
  weight: number;
  max: number;
  order: number;
  /** When the column was created. Read only for `type: "rubric"` — a grille happened on a day. */
  date?: number;
  calculation?: CalculationSpec;
  criteria?: RubricCriterion[];
}
```

- [ ] **Step 7: Run the tests and watch them pass**

```bash
yarn test src/domain/rubric.test.ts src/domain/gradebook/column.test.ts src/domain/gradebook/grade.test.ts
```

Expected: PASS. `yarn typecheck` will still fail — `src/modules/rubric/grid.tsx` and `src/db/rubrics.ts` name `RubricScoreLike`. Fix those two imports to `CriterionLevelLike` now; no other change.

- [ ] **Step 8: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain src/db/types.ts src/modules/rubric/grid.tsx src/db/rubrics.ts
git commit -m "feat(gradebook): a column may hold critères, and a cell knows when it is done

ColumnType gains \"rubric\", carrying its critères embedded beside the
calculation spec — the third field meaningful for exactly one type.
isNumericColumn stays false for it, so no level can reach an average.

rubricCell means only when every critère is in. A mean over one critère
of three sits in the same column as a mean over three, and the
least-assessed pupil posts the best figure; while it is unfinished the
cell counts instead."
```

---

### Task 3: Remove the standalone assessment

Deleting the UI and the writes first is what lets Task 4 drop the store without leaving the app un-compilable. After this task the rubric feature is temporarily absent from the interface; Tasks 5–7 restore it inside the grid.

**Files:**
- Delete: `src/modules/rubric/components/assessment-form.tsx`
- Modify: `src/modules/rubric/page.tsx` (delete `RubricsPage`; keep `RubricAssessmentPage` for now, untouched)
- Modify: `src/router.ts` (delete the `Rubrics` route)
- Modify: `src/app.tsx` (delete the `Rubrics` case, the name from both route unions, and the `RubricsPage` import)
- Modify: `src/modules/gradebook/page.tsx` (delete the `Router.Rubrics` link and its `Link` usage)
- Modify: `src/db/rubrics.ts` (delete `NewAssessment`, `createAssessment`, `createAssessmentFromTemplate`; keep `newCriterion`, `setCriteria`, `setScore`, `clearScore`, `saveTemplate`)
- Modify: `src/db/rubrics.test.ts` (delete the tests for the three removed functions)

**Interfaces:**
- Consumes: nothing new.
- Produces: `src/db/rubrics.ts` exporting only `newCriterion`, `setCriteria`, `setScore`, `clearScore`, `saveTemplate`. Task 4 moves the middle three out.

- [ ] **Step 1: Delete the assessment tests first, and watch the suite go red**

Remove from `src/db/rubrics.test.ts` every `it` inside the `createAssessment` and `createAssessmentFromTemplate` describes, then delete the now-empty describes and the two imports.

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/db/rubrics.test.ts
```

Expected: PASS (fewer tests). This step removes coverage rather than adding it, so the red comes from `yarn typecheck` in the next step instead.

- [ ] **Step 2: Delete the three write functions**

In `src/db/rubrics.ts`, delete `NewAssessment`, `createAssessment` and `createAssessmentFromTemplate` entirely, and rewrite the module's header comment:

```ts
/**
 * Writes for rubric templates and the levels recorded against a column.
 *
 * A template's criteria are COPIED into a column, never referenced. A
 * reference would be smaller, and wrong: a teacher who improves next year's
 * oral grid must not silently rewrite the grid they graded last term with it.
 */
```

```bash
yarn typecheck
```

Expected: FAIL — `src/modules/rubric/components/assessment-form.tsx` imports both deleted functions.

- [ ] **Step 3: Delete the form and its only caller**

```bash
git rm src/modules/rubric/components/assessment-form.tsx
```

In `src/modules/rubric/page.tsx`, delete the whole `RubricsPage` component and every import only it used (`AssessmentForm`, `deleteRubricAssessment`, `ConfirmButton`, `Link`, `Router`, `scoredCount`, `levelCount`, `RubricAssessment`). Leave `RubricAssessmentPage` exactly as it is.

- [ ] **Step 4: Unwire the route**

In `src/router.ts`, delete the `Rubrics: "/gradebooks/:gradebookId/rubrics",` line. Leave `Rubric` alone — Task 6 replaces it.

In `src/app.tsx`: delete `"Rubrics"` from the route-name array around line 40 and from the union around line 77, delete the `case "Rubrics":` block, and change the import on line 10 to `import { RubricAssessmentPage } from "./modules/rubric/page";`.

In `src/modules/gradebook/page.tsx`, delete the Grilles link:

```tsx
          <Link className="btn" to={Router.Rubrics({ gradebookId })}>
            {t("rubric.title")}
          </Link>
```

Leave the `Link` import — `Router.Entry` still uses it in the column header.

- [ ] **Step 5: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "refactor(rubric): the standalone assessment list goes

A grille is about to become a column, so the screen that existed to list
assessments has nothing left to list. Deleting the UI and its writes
first is what lets the store go in one version rather than two.

The scoring grid and the template library are untouched; the feature is
absent from the interface until the grid carries it."
```

---

### Task 4: One schema version, and a level that is named after what it is

The chain collapses to `db.version(1)`, `rubricScores` becomes `criterionLevels`, and `rubricAssessments` goes. Every existing workspace now fails to open with `VersionError` and lands on the discard panel Task 1 unlocked.

**Files:**
- Modify: `src/db/index.ts` (whole `openWorkspaceDb` body; `rubricScoreKey` → `criterionLevelKey`)
- Modify: `src/db/types.ts` (`RubricScore` → `CriterionLevel`; delete `RubricAssessment`)
- Create: `src/db/criterion-levels.ts`
- Modify: `src/db/rubrics.ts` (templates only)
- Modify: `src/db/cascade.ts`
- Modify: `src/db/backup.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/modules/rubric/grid.tsx`, `src/modules/rubric/page.tsx` (import sites only)
- Test: `src/db/index.test.ts`, `src/db/cascade.test.ts`, `src/db/backup.test.ts`, `src/db/rubrics.test.ts` → `src/db/criterion-levels.test.ts`

**Interfaces:**
- Consumes: `CriterionLevelLike`, `rubricCell` (Task 2); `classifyOpenFailure` returning `"corrupt"` for `VersionError` (Task 1).
- Produces:
  - `criterionLevelKey(columnId: string, criterionId: string, studentId: string): [string, string, string]`
  - `db.criterionLevels: Table<CriterionLevel, [string, string, string]>`
  - `setLevel(db: AppDatabase, columnId: string, criterionId: string, studentId: string, level: RubricLevel): Promise<void>`
  - `clearLevel(db: AppDatabase, columnId: string, criterionId: string, studentId: string): Promise<void>`
  - `setColumnCriteria(db: AppDatabase, columnId: string, criteria: RubricCriterion[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Replace the four upgrade-seam describes in `src/db/index.test.ts` — `schema v12`, `schema v11`, `schema v14`, `schema v15`, and the `schema v16` pair — with one, and update the two survivors. Delete nothing else.

```ts
describe("a workspace built by a newer version of the app", () => {
  it("refuses to open, and refuses in a way that offers a way out", async () => {
    // The schema is a single version now, so an existing database can only
    // ever be AHEAD. IndexedDB rejects opening below the stored version, and
    // `classifyOpenFailure` must land that on the branch offering the
    // discard — otherwise the panel shows one button that fails identically,
    // forever, with the pupils still in IndexedDB.
    const name = `profs-${crypto.randomUUID()}`;
    const ahead = new Dexie(name);
    ahead.version(99).stores({ classes: "id, name" });
    await ahead.open();
    ahead.close();

    const current = new Dexie(name);
    current.version(1).stores({ classes: "id, name" });
    const error = await current.open().then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).not.toBeNull();
    expect(classifyOpenFailure(error)).toBe("corrupt");
    expect(offersDiscard(classifyOpenFailure(error))).toBe(true);
  });
});

describe("criterionLevels", () => {
  it("builds a level key", () => {
    expect(criterionLevelKey("col", "crit", "adam")).toEqual(["col", "crit", "adam"]);
  });

  it("round-trips a level on its compound key", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await db.criterionLevels.put({
      columnId: "col",
      criterionId: "crit",
      studentId: "adam",
      level: 3,
      updatedAt: Date.now(),
    });
    const found = await db.criterionLevels.get(criterionLevelKey("col", "crit", "adam"));
    expect(found?.level).toBe(3);
    db.close();
  });
});
```

Update the existing "opens with every table the schema declares" test's expected table list: remove `rubricAssessments`, rename `rubricScores` to `criterionLevels`.

Create `src/db/criterion-levels.test.ts` by moving the `setScore` / `clearScore` / `setCriteria` tests out of `src/db/rubrics.test.ts`, renaming as you go:

```ts
import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { clearLevel, setColumnCriteria, setLevel } from "./criterion-levels";
import { newCriterion } from "./rubrics";

describe("setLevel", () => {
  it("writes one row and leaves its neighbours alone", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await setLevel(db, "col", "just", "adam", 3);
    await setLevel(db, "col", "ryth", "adam", 4);
    await setLevel(db, "col", "just", "lucas", 2);

    await setLevel(db, "col", "just", "adam", 1);

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.criterionId === "just" && r.studentId === "adam")?.level).toBe(1);
    expect(rows.find((r) => r.criterionId === "ryth" && r.studentId === "adam")?.level).toBe(4);
    expect(rows.find((r) => r.studentId === "lucas")?.level).toBe(2);
    db.close();
  });
});

describe("clearLevel", () => {
  it("deletes one row and no other", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await setLevel(db, "col", "just", "adam", 3);
    await setLevel(db, "col", "ryth", "adam", 4);

    await clearLevel(db, "col", "just", "adam");

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionId).toBe("ryth");
    db.close();
  });
});

describe("setColumnCriteria", () => {
  it("drops the levels of a critère that did not survive", async () => {
    // A level for a removed critère is unreachable: invisible in the grid,
    // never summarised, still carried by every export.
    const db = openWorkspaceDb(crypto.randomUUID());
    const keep = newCriterion("Justesse");
    const doomed = newCriterion("Rythme");
    await db.columns.add({
      id: "col",
      gradebookId: "gb",
      periodId: "p1",
      type: "rubric",
      label: "Oral",
      weight: 1,
      max: 20,
      order: 0,
      criteria: [keep, doomed],
    });
    await setLevel(db, "col", keep.id, "adam", 3);
    await setLevel(db, "col", doomed.id, "adam", 2);

    await setColumnCriteria(db, "col", [keep]);

    const rows = await db.criterionLevels.where("columnId").equals("col").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionId).toBe(keep.id);
    expect((await db.columns.get("col"))?.criteria).toEqual([keep]);
    db.close();
  });
});
```

Add to `src/db/cascade.test.ts`:

```ts
it("takes a rubric column's levels with the column", async () => {
  const db = openWorkspaceDb(crypto.randomUUID());
  await db.columns.add({
    id: "col",
    gradebookId: "gb",
    periodId: "p1",
    type: "rubric",
    label: "Oral",
    weight: 1,
    max: 20,
    order: 0,
    criteria: [{ id: "just", label: "Justesse" }],
  });
  await db.criterionLevels.put({
    columnId: "col",
    criterionId: "just",
    studentId: "adam",
    level: 3,
    updatedAt: Date.now(),
  });

  await deleteColumn(db, "col");

  expect(await db.criterionLevels.where("columnId").equals("col").count()).toBe(0);
  db.close();
});
```

Add to `src/db/backup.test.ts`:

```ts
it("refuses a file from before the grille was a column", () => {
  // 11 and 12 both export rubricAssessments, a store that no longer exists.
  // Half-importing is worse than refusing: the grilles would vanish silently
  // rather than the file being turned away.
  for (const version of [11, 12]) {
    expect(parseBackup({ ...validBackupFixture(), version }).ok).toBe(false);
  }
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/db
```

Expected: FAIL — `db.criterionLevels is undefined`, `criterionLevelKey is not exported`, `Cannot find module './criterion-levels'`.

- [ ] **Step 3: Collapse the schema**

Replace the entire body of `openWorkspaceDb` in `src/db/index.ts` — every `db.version(2)` through `db.version(16)`, comments included — with one version:

```ts
export function openWorkspaceDb(workspaceId: string): AppDatabase {
  const db = new Dexie(`profs-${workspaceId}`) as AppDatabase;
  /**
   * ONE version, declaring the schema as it stands.
   *
   * There were sixteen, each a bump with no upgrade callback, because schema
   * changes here are disposable: a stale workspace is wiped on the next boot
   * rather than migrated. Nothing is deployed, so that chain described
   * migrations nobody will ever run, and the current shape could only be read
   * by replaying fifteen diffs.
   *
   * The consequence is load-bearing and deliberate: IndexedDB refuses to open
   * a database at a version LOWER than the stored one, so every workspace
   * built by an earlier build fails to open with `VersionError`, reaches
   * `RecoveryShell`, and is offered the discard. That is only true because
   * `classifyOpenFailure` treats `VersionError` as `corrupt` — see
   * `src/domain/recovery.ts`. Without that, this line bricks every existing
   * workspace instead of wiping it.
   *
   * The rule for the next change is unchanged: add a table or a field, bump to
   * version 2, write no upgrade function.
   *
   * `&` marks a unique index. `desks` refuses two tables on one square,
   * `seatingPlans` one plan per class per salle, and `assignments` one pupil
   * in two chairs — invariants that used to live only in careful code.
   */
  db.version(1).stores({
    classes: "id, name",
    students: "id, classId, lastName",
    subjects: "id, name",
    gradebooks: "id, classId, subjectId",
    periods: "id, gradebookId, order",
    columns: "id, gradebookId, periodId, order",
    grades: "[gradebookId+columnId+studentId], gradebookId, columnId, studentId",
    sessions: "id, classId, date, [classId+date], subjectId",
    attendance: "[sessionId+studentId], sessionId, studentId",
    behaviourEvents: "id, sessionId, studentId, classId, createdAt",
    rooms: "id, name",
    desks: "id, roomId, &[roomId+x+y]",
    seatingPlans: "id, classId, roomId, &[classId+roomId]",
    assignments: "[planId+deskId], planId, deskId, studentId, &[planId+studentId]",
    rubricTemplates: "id, name",
    // A level, not a score: it is one pupil's level on one critère of one
    // COLUMN. The name it had pointed at an assessment row that no longer
    // exists. Keyed like `grades` — one tap is one put, one clear is one
    // delete, and nothing read-modify-writes a collection of them.
    criterionLevels: "[columnId+criterionId+studentId], columnId, criterionId, studentId",
    studentGroups: "id, classId",
    groupMembers: "[groupId+studentId], groupId, studentId",
    scheduleEntries: "id, classId, weekday, roomId",
  });
  return db;
}
```

Delete the now-unused `import { repairSeanceCollisions } from "@domain/seance";` at the top of the file — `backup.ts` keeps its own import.

Rename the key constructor in the same file:

```ts
/** The compound primary key of one pupil's level on one critère. */
export function criterionLevelKey(
  columnId: string,
  criterionId: string,
  studentId: string,
): [string, string, string] {
  return [columnId, criterionId, studentId];
}
```

And in `AppDatabase`, replace the two rubric lines with:

```ts
  criterionLevels: Table<CriterionLevel, [string, string, string]>;
```

updating both the `import type` and the `export type` blocks: `RubricScore` → `CriterionLevel`, `RubricAssessment` removed.

- [ ] **Step 4: Rename the row type**

In `src/db/types.ts`, delete the `RubricAssessment` interface entirely and replace `RubricScore` with:

```ts
/**
 * One pupil's level on one critère of one column. Keyed
 * [columnId+criterionId+studentId].
 *
 * Its own row rather than a map inside a `Grade`, because a level is written
 * and cleared one tap at a time — the same fork `Grade` and `Assignment` are
 * on the other side of. A map would make each tap a read-modify-write, and
 * two fast taps could lose one silently.
 */
export interface CriterionLevel {
  columnId: string;
  criterionId: string;
  studentId: string;
  level: RubricLevel;
  updatedAt: number;
}
```

- [ ] **Step 5: Move the level writes into their own module**

Create `src/db/criterion-levels.ts`:

```ts
import type { RubricCriterion, RubricLevel } from "@domain/rubric";
import type { AppDatabase } from ".";
import { criterionLevelKey } from ".";

/**
 * Every write to a level recorded against a rubric column.
 *
 * One cell, one row. Never read-modify-write a collection of these — the
 * compound key means a single row write is always enough, which is what keeps
 * two fast taps mid-lesson from losing one.
 */

/** One cell, one `put`. */
export async function setLevel(
  db: AppDatabase,
  columnId: string,
  criterionId: string,
  studentId: string,
  level: RubricLevel,
): Promise<void> {
  await db.criterionLevels.put({
    columnId,
    criterionId,
    studentId,
    level,
    updatedAt: Date.now(),
  });
}

/** One cell, one `delete`. Leaves every other pupil and critère untouched. */
export async function clearLevel(
  db: AppDatabase,
  columnId: string,
  criterionId: string,
  studentId: string,
): Promise<void> {
  await db.criterionLevels.delete(criterionLevelKey(columnId, criterionId, studentId));
}

/**
 * Replace a column's critères, dropping the levels of any that go.
 *
 * A removed critère's levels are unreachable — invisible in the grid, never
 * summarised, still carried by export — so this is a cascade and belongs
 * beside the write, in one transaction.
 */
export async function setColumnCriteria(
  db: AppDatabase,
  columnId: string,
  criteria: RubricCriterion[],
): Promise<void> {
  await db.transaction("rw", [db.columns, db.criterionLevels], async () => {
    const keep = new Set(criteria.map((criterion) => criterion.id));
    const levels = await db.criterionLevels.where("columnId").equals(columnId).toArray();
    const doomed = levels.filter((row) => !keep.has(row.criterionId));
    if (doomed.length > 0) {
      await db.criterionLevels.bulkDelete(
        doomed.map((row) => criterionLevelKey(row.columnId, row.criterionId, row.studentId)),
      );
    }
    await db.columns.update(columnId, { criteria });
  });
}
```

In `src/db/rubrics.ts`, delete `setCriteria`, `setScore` and `clearScore`. What remains is `newCriterion` and `saveTemplate`.

- [ ] **Step 6: Follow the rename through the cascades**

In `src/db/cascade.ts`:

- `deleteColumn` — add `db.criterionLevels` to the transaction's table list and, as its first statement, `await db.criterionLevels.where("columnId").equals(columnId).delete();`
- `deleteGradebook` — replace the `rubricAssessments` block with a sweep by the columns it is already deleting:

```ts
      const columnIds = await db.columns.where("gradebookId").equals(gradebookId).primaryKeys();
      if (columnIds.length > 0) {
        await db.criterionLevels.where("columnId").anyOf(columnIds).delete();
      }
```
  collected BEFORE `db.columns.where(...).delete()` runs, and with `db.criterionLevels` in place of the two rubric tables in the transaction list.
- `deletePeriod` — the same shape, reusing the `columnIds` it already collects.
- `deleteStudent` — change `db.rubricScores` to `db.criterionLevels` in both the table list and the sweep. The index it uses is unchanged.
- `deleteClass` — same rename wherever it names the store.
- Delete `deleteRubricAssessment` entirely. Keep `deleteRubricTemplate`.

- [ ] **Step 7: Follow it through backup and seed**

In `src/db/backup.ts`:
- `WorkspaceBackup`: `version: 13`, `rubricAssessments` removed, `rubricScores: RubricScore[]` becomes `criterionLevels: CriterionLevel[]`.
- The Zod schema: `version: z.literal(13)`, the `rubricAssessments` line removed, and

```ts
  criterionLevels: z.array(
    z
      .object({
        columnId: z.string(),
        criterionId: z.string(),
        studentId: z.string(),
      })
      .loose(),
  ),
```
- The export body, the import body and the transaction's table list: `db.rubricAssessments` gone, `db.rubricScores` → `db.criterionLevels`, `bulkPut` unchanged.
- Rewrite the version comment to state the standing rule: **a file is accepted at the current format and no other**, because a format is only importable while every store it names still exists.
- The unconditional `repairSeanceCollisions` on import is now inert — every format-13 file carries times. Delete it and its comment, along with the `import { repairSeanceCollisions }` line if nothing else in the file uses it.

In `src/db/seed.ts`, replace the assessment block: build one `GradeColumn` of `type: "rubric"` per class, in the class's first period, `criteria` copied from `rubricTemplate.criteria` with fresh ids, `date` inside the seeded history window, `weight: 1`, `max: 20`, `order` after the class's other columns. Write the same aptitude-derived levels into `criterionLevels` keyed by that column. Delete `rubricAssessments` from the seed transaction's table list and from `db.rubricAssessments.bulkAdd`.

- [ ] **Step 8: Follow it through the two remaining components**

`src/modules/rubric/grid.tsx` and `src/modules/rubric/page.tsx` import `setScore`/`clearScore` and the `RubricScore` type. Point them at `setLevel`/`clearLevel` from `@db/criterion-levels` and `CriterionLevel` from `@db`, passing `columnId` where `assessmentId` went. `RubricAssessmentPage` still reads `db.rubricAssessments` — replace that read with `db.columns.get(columnId)` and rename its prop; Task 6 rewrites this component properly, so the minimum that compiles is enough here.

- [ ] **Step 9: Run the tests and watch them pass**

```bash
yarn test src/db
```

Expected: PASS, including the new higher-version test and the backup refusal.

- [ ] **Step 10: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(db): one schema version, and a level named after what it is

Sixteen versions described migrations nobody will run — nothing is
deployed. The chain collapses to db.version(1), and every workspace built
by an earlier build now fails to open with VersionError and is offered
the discard, which only works because that error stopped classifying as
retry.

rubricScores becomes criterionLevels, keyed [columnId+criterionId+
studentId]: a score was named after an assessment row that no longer
exists, and what it holds is one pupil's level on one critère of one
column. rubricAssessments goes with it.

Backup format 13, accepted alone. A format is only importable while every
store it names still exists, so the union of literals was the thing to
remove rather than extend."
```

---

### Task 5: The cell

**Files:**
- Create: `src/modules/rubric/cell.tsx`
- Modify: `src/modules/design-system/components/editable-cell.tsx` (the `calculation` early-return block, around line 66)
- Modify: `src/modules/gradebook/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `rubricCell`, `RubricCell`, `CriterionLevelLike`, `RUBRIC_LEVEL_COLORS` (Task 2); `setLevel`, `clearLevel` (Task 4); `LevelButtons` (existing).
- Produces: `<RubricCellButton column={GradeColumn} levels={CriterionLevel[]} student={Student} />`.

- [ ] **Step 1: Add the strings**

`fr.json`, under the existing `rubric` key:

```json
"cellEmpty": "Pas encore évalué",
"cellPartial": "{{scored}}/{{total}} critères",
"cellComplete": "Moyenne des niveaux : {{mean}}",
"openFor": "Évaluer {{name}}",
"closePanel": "Fermer"
```

`en.json`, the same keys:

```json
"cellEmpty": "Not yet assessed",
"cellPartial": "{{scored}}/{{total}} criteria",
"cellComplete": "Mean level: {{mean}}",
"openFor": "Assess {{name}}",
"closePanel": "Close"
```

Note the interpolation variables are `scored` and `total`, never `count` — `count` triggers i18next plural resolution.

- [ ] **Step 2: Write the cell component**

Create `src/modules/rubric/cell.tsx`:

```tsx
import type { CriterionLevel, GradeColumn, Student } from "@db";
import { clearLevel, setLevel } from "@db/criterion-levels";
import { useDb } from "@db/provider";
import { formatDecimal } from "@domain/gradebook/decimal";
import { rubricCell, RUBRIC_LEVEL_COLORS, type RubricLevel } from "@domain/rubric";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../design-system/components/pupil-name";
import { LevelButtons } from "./components/level-buttons";

/** Nearest whole level for colouring a continuous mean. Clamped to 1–4. */
function meanColor(mean: number): string {
  return RUBRIC_LEVEL_COLORS[Math.min(4, Math.max(1, Math.round(mean))) as RubricLevel];
}

/**
 * One rubric cell in the carnet: what the pupil's grille says, and the way in.
 *
 * The closed cell never shows a mean until every critère is in — see
 * `rubricCell`. Open, it is that pupil's critères and nothing else; the class
 * matrix lives behind the column header, exactly as fast entry does for a
 * numeric column.
 */
export function RubricCellButton({
  column,
  levels,
  student,
}: {
  column: GradeColumn;
  /** Every level on THIS column, for every pupil — filtered here. */
  levels: CriterionLevel[];
  student: Student;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [open, setOpen] = useState(false);
  const criteria = column.criteria ?? [];
  const cell = rubricCell(levels, criteria, student.id);

  const byCriterion = new Map<string, RubricLevel>(
    levels
      .filter((row) => row.studentId === student.id)
      .map((row) => [row.criterionId, row.level]),
  );

  async function write(criterionId: string, next: RubricLevel | null): Promise<void> {
    if (next === null) {
      await clearLevel(db, column.id, criterionId, student.id);
      return;
    }
    await setLevel(db, column.id, criterionId, student.id, next);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="min-h-11 min-w-11 tabular-nums"
        aria-expanded={open}
        aria-label={t("rubric.openFor", { name: `${student.lastName} ${student.firstName}` })}
        title={
          cell.state === "complete"
            ? t("rubric.cellComplete", { mean: formatDecimal(cell.mean, i18n.language) })
            : cell.state === "partial"
              ? t("rubric.cellPartial", { scored: cell.scored, total: cell.total })
              : t("rubric.cellEmpty")
        }
        onClick={() => setOpen((current) => !current)}
      >
        {cell.state === "empty" && <span className="text-text-faint">—</span>}
        {cell.state === "partial" && (
          <span className="text-sm text-text-muted">
            {cell.scored}/{cell.total}
          </span>
        )}
        {cell.state === "complete" && (
          <span className="inline-flex items-center gap-1 font-medium">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ background: meanColor(cell.mean) }}
            />
            {formatDecimal(cell.mean, i18n.language)}
          </span>
        )}
      </button>

      {open && (
        <div className="flex w-56 flex-col gap-2 rounded border border-border bg-bg p-2 text-left">
          <PupilName student={student} format="surname" />
          {criteria.map((criterion) => (
            <div key={criterion.id} className="flex flex-col gap-1">
              <span className="text-text-muted text-xs">{criterion.label}</span>
              <LevelButtons
                compact
                value={byCriterion.get(criterion.id) ?? null}
                onChange={(next) => void write(criterion.id, next)}
              />
            </div>
          ))}
          <button type="button" className="btn self-end" onClick={() => setOpen(false)}>
            {t("rubric.closePanel")}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Keep `EditableCell` out of it**

In `src/modules/design-system/components/editable-cell.tsx`, extend the `calculation` early return so a rubric column can never reach the editor:

```tsx
  // A calculation column stores nothing and a rubric column stores no Grade
  // row at all — its levels live in `criterionLevels`. Neither may reach the
  // editor: typing into either would produce a stored value the next render
  // discards. A rubric cell renders through `RubricCellButton` instead, so
  // this branch is a guard rather than a rendering.
  if (type === "rubric") return null;

  if (type === "calculation") {
```

- [ ] **Step 4: Wire the grid**

In `src/modules/gradebook/page.tsx`:

Add `criterionLevels` to the `useLiveQuery`, scoped to the gradebook's columns so the query stays one index hit:

```ts
    const rubricColumnIds = columns.filter((c) => c.type === "rubric").map((c) => c.id);
    const levels =
      rubricColumnIds.length > 0
        ? await db.criterionLevels.where("columnId").anyOf(rubricColumnIds).toArray()
        : [];
```

and return it alongside the rest. Then branch the cell, beside the existing `calculation` branch:

```tsx
                {columns.map((column) =>
                  column.type === "rubric" ? (
                    <td key={column.id} className="px-3 py-2 text-center">
                      <RubricCellButton
                        column={column}
                        levels={data.levels.filter((row) => row.columnId === column.id)}
                        student={student}
                      />
                    </td>
                  ) : column.type === "calculation" ? (
```

- [ ] **Step 5: Confirm the grid still renders, and defer the rest**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn dev
```

Open `http://localhost:3000/profs/` and go to a class → a carnet. What is verifiable now is that **nothing regressed**: the existing columns render, cells still edit, the moyenne still computes, and the console is clean.

The rubric cell itself cannot be seen yet — no surface creates a rubric column until Task 7 builds the form, and the seed's column (Task 4) only appears in a freshly seeded workspace. **Do not hand-write a column into IndexedDB from the console to fake this.** The full flow is verified end to end in Task 7 Step 4, against a column made the way a teacher makes one. Say exactly that in the commit rather than claiming the cell was seen working.

- [ ] **Step 6: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(gradebook): a rubric cell shows where the pupil is, and opens

Closed, the cell counts while the grille is unfinished and means only
when it is done — every figure in the column over the same denominator.
Open, it is that pupil's critères and nothing else.

EditableCell refuses the type outright: a rubric column stores no Grade
row, so an editor reaching it could only write a value the next render
discards."
```

---

### Task 6: The matrix, behind the header

**Files:**
- Modify: `src/router.ts` (replace the `Rubric` route)
- Modify: `src/app.tsx`
- Modify: `src/modules/rubric/page.tsx` (rewrite as the column's matrix page)
- Modify: `src/modules/rubric/grid.tsx` (props)
- Modify: `src/modules/gradebook/page.tsx` (the header link)

**Interfaces:**
- Consumes: `setLevel`, `clearLevel`, `setColumnCriteria` (Task 4); `CriteriaEditor` (existing).
- Produces: route `Rubric: "/gradebooks/:gradebookId/rubric/:columnId"`, component `<RubricColumnPage gradebookId columnId />`.

- [ ] **Step 1: Replace the route**

In `src/router.ts`:

```ts
    // The class matrix for one rubric column — the header's door, mirroring
    // Entry for a numeric column. The cell's door is the pupil's own critères,
    // in the grid.
    Rubric: "/gradebooks/:gradebookId/rubric/:columnId",
```

In `src/app.tsx`, the `case "Rubric":` block becomes:

```tsx
    case "Rubric":
      return (
        <RubricColumnPage
          gradebookId={route.params.gradebookId}
          columnId={route.params.columnId}
        />
      );
```

with the import updated to `import { RubricColumnPage } from "./modules/rubric/page";`.

- [ ] **Step 2: Rewrite the page**

`src/modules/rubric/page.tsx` becomes one component. It loads the column, refuses one that is not a rubric column or belongs to another gradebook, and renders `RubricGrid` plus the critères editor:

```tsx
export function RubricColumnPage({
  gradebookId,
  columnId,
}: {
  gradebookId: string;
  columnId: string;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [draftCriteria, setDraftCriteria] = useState<RubricCriterion[]>([]);

  const data = useLiveQuery(async () => {
    const column = await db.columns.get(columnId);
    // The column must belong to the gradebook in the URL and be a rubric
    // column. Without both checks this route renders one carnet's roster
    // against another's column, or a matrix over a numeric column with no
    // critère to draw.
    if (!column || column.gradebookId !== gradebookId || column.type !== "rubric") return null;
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [students, levels] = await Promise.all([
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.criterionLevels.where("columnId").equals(columnId).toArray(),
    ]);
    return { column, students, levels };
  }, [db, gradebookId, columnId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("rubric.notFound")}</p>;
  …
}
```

The heading shows `data.column.label` and, when `data.column.date` is set,
`new Date(data.column.date).toLocaleDateString(i18n.language)` — the field that
was written and never read until now. *Modifier les critères* seeds
`draftCriteria` from `data.column.criteria ?? []` and saves through
`setColumnCriteria(db, columnId, draftCriteria)`. The rest of the body is the
existing `RubricAssessmentPage`'s, with `assessment.criteria` becoming
`data.column.criteria ?? []`.

- [ ] **Step 3: Repoint the grid**

In `src/modules/rubric/grid.tsx`, rename the `assessmentId` prop to `columnId`, the `scores` prop to `levels` (typed `CriterionLevel[]`), and route both writes through `setLevel` / `clearLevel`. The matrix, the phone-shaped criterion-at-a-time view, `studentMean`, `criterionMean` and `levelDistribution` are unchanged.

- [ ] **Step 4: Link from the column header**

In `src/modules/gradebook/page.tsx`, the header currently links to `Router.Entry` for numeric columns only. Extend it so a rubric column links to its matrix, and say why in a comment:

```tsx
                    {isNumericColumn(column.type) ? (
                      <Link to={Router.Entry({ gradebookId, columnId: column.id })} …>
                        …
                      </Link>
                    ) : column.type === "rubric" ? (
                      // Two doors, the same two a numeric column has: the
                      // header opens the class matrix, the cell edits one
                      // pupil. Learned once, used on both.
                      <Link
                        to={Router.Rubric({ gradebookId, columnId: column.id })}
                        className="flex flex-col items-center hover:text-accent"
                      >
                        <span className="flex items-center gap-1">
                          <ColumnTypeIcon type={column.type} />
                          {column.label}
                        </span>
                      </Link>
                    ) : (
```

Add a `rubric` case to `ColumnTypeIcon` if it does not already handle every `ColumnType` exhaustively — check `src/modules/design-system/components/column-type-icon.tsx` and follow the existing shape.

- [ ] **Step 5: Run the gate and commit**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(rubric): the class matrix lives behind the column header

The same two doors a numeric column already has — header to the whole
class, cell to one pupil — so the gesture is learned once. The route
mirrors Entry, and the column's date is finally read: a grille happened
on a day."
```

---

### Task 7: Creating one

**Files:**
- Create: `src/modules/rubric/components/criteria-field.tsx`
- Modify: `src/modules/gradebook/components/column-form.tsx`
- Modify: `src/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `CriteriaEditor`, `newCriterion` (existing); `setColumnCriteria` (Task 4).
- Produces: `<CriteriaField value={RubricCriterion[]} onChange={(next: RubricCriterion[]) => void} templates={RubricTemplate[]} />`.

- [ ] **Step 1: Add the strings**

`fr.json`, under `gradebook.type`, add `"rubric": "Grille d'évaluation"`. Under `rubric`, add `"criteriaSource": "Critères"`. `en.json`: `"rubric": "Rubric"` and `"criteriaSource": "Criteria"`. `rubric.blank` ("Grille vierge") already exists and is reused.

- [ ] **Step 2: Build the field**

`src/modules/rubric/components/criteria-field.tsx` renders a `<select>` of `vierge` plus every template, and the `CriteriaEditor` beneath it. Choosing a template calls `onChange` with **fresh ids**:

```tsx
  function applyTemplate(templateId: string): void {
    if (templateId === "blank") {
      onChange([]);
      return;
    }
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    // Fresh ids, always. Two columns built from one template must not share
    // criterion ids, or a level written on one would be readable from the
    // other — and improving the template later must never reach a grille
    // already graded.
    onChange(template.criteria.map((criterion) => newCriterion(criterion.label)));
  }
```

- [ ] **Step 3: Branch the column form**

In `src/modules/gradebook/components/column-form.tsx`:

- Add `const [criteria, setCriteria] = useState<RubricCriterion[]>(column?.criteria ?? []);` and a `templates` prop, loaded by the caller from `db.rubricTemplates`.
- Render `<CriteriaField … />` when `type === "rubric"`, beside the existing `type === "calculation"` block.
- Hide the weight and max fields for the type. They already only show for numeric types — confirm the existing conditions cover `"rubric"` and extend them if not.
- In `save()`, build the field the way `calculation` is built, so switching a column AWAY from `rubric` clears it rather than leaving a stale list:

```ts
    const criteriaField: RubricCriterion[] | undefined = type === "rubric" ? criteria : undefined;
```
  destructure `criteria` out of the existing row on edit — exactly as `calculation` is destructured — and spread `...(criteriaField ? { criteria: criteriaField } : {})` into both the `put` and the `add`.
- For an EDIT that changes the critères, route the write through `setColumnCriteria(db, column.id, criteria)` rather than the plain `put`, so a removed critère takes its levels with it in the same transaction.

- [ ] **Step 4: Verify the whole flow in a real browser**

```bash
yarn dev
```

At `http://localhost:3000/profs/`: a class → a carnet → *Ajouter une colonne* → type **Grille d'évaluation** → critères from the seeded template → save. Then check, in order:
1. The column appears with its label and its date in the header.
2. Every cell reads `—`.
3. Tapping a cell opens that pupil's critères; setting one flips the cell to `1/3`.
4. Completing all three flips it to a coloured mean.
5. Tapping the same level again clears it, and the cell falls back to `2/3`.
6. The pupil's **Moyenne** column is unchanged by every step above.
7. The column header opens the matrix, which shows the same levels and its distributions.
8. Removing a critère in *Modifier les critères* drops its levels and the cells recount.
9. Deleting the column leaves no orphan: reload and confirm the grid is clean.

- [ ] **Step 5: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(gradebook): create a grille as a column

The type picker gains Grille d'évaluation, and its critères come from a
template or from nothing — copied with fresh ids either way, so improving
a template cannot reach a grille already graded. Editing them goes
through setColumnCriteria, which takes a removed critère's levels with it
in one transaction."
```

---

### Task 8: Say what changed

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKLOG.md` (entry #1)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation matching the code. Nothing depends on it.

- [ ] **Step 1: Update `CLAUDE.md`**

Four edits, each replacing a statement this work made false:

1. The `src/db/` paragraph — "Twenty tables across `db.version(2)` through `version(14)`" becomes one `db.version(1)` declaring nineteen tables, and states the consequence: an older workspace fails to open and is offered the discard, which is why `VersionError` must classify as `corrupt`.
2. *Schema changes are disposable* — the rule stands, but the two-version dance for a changed primary key is now historical. Say that a rename sidesteps it entirely: a store that does not exist yet has no key to change. Note that the four upgrade-seam tests are gone and what replaced them.
3. The rubric invariant — a grille is a column of a carnet, its critères embedded like `calculation`, its levels their own rows in `criterionLevels`. **A level still never feeds an average**, and the opt-in barème is named as the decision deliberately left open.
4. The journal/backup paragraph — format **13**, accepted alone, and the rule: a file is importable only while every store it names still exists.

- [ ] **Step 2: Update `docs/BACKLOG.md`**

Entry #1's "What was deliberately not built" list says rubrics are "standalone, not attached to a gradebook column". That is now the opposite of the truth. Rewrite that bullet to record the change and the reasoning, and keep the two that still hold — no criterion weights, no rubric-to-average conversion — adding that the barème has been designed for and not built.

- [ ] **Step 3: Run the gate and commit**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
git add CLAUDE.md docs/BACKLOG.md
git commit -m "docs: a grille is a column, and the schema is one version

CLAUDE.md described twenty tables across fifteen versions, a rubric
assessment standing beside the carnet, and backup format 11. All three
were true this morning."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the ruling and the schema (2, 4), where a level lives (4), the cell (2, 5), the two doors (5, 6), deletes (4), migration and the recovery fix (1, 4), backup (4), seed (4), tests (throughout), documentation (8). The one spec item deliberately carried as a decision rather than a change is the inert `repairSeanceCollisions` on import — Task 4 Step 7 deletes it and says why.

**Placeholders.** Task 5 Step 5 verifies only that nothing regressed and defers the rubric cell's own verification to Task 7 Step 4, where a column exists that a teacher could have made; it forbids hand-writing one into IndexedDB to close the step early. Task 6 Step 2 gives the page's shape and its two guards in code but describes the body it inherits from the existing component rather than repeating forty lines verbatim; Task 7 Step 3 does the same against `ColumnForm`'s existing `calculation` branch, which is on screen while the edit is made. Both name the exact file and the exact existing block to mirror.

**Type consistency.** `criterionLevelKey(columnId, criterionId, studentId)`, `CriterionLevel`, `CriterionLevelLike`, `criterionLevels`, `setLevel`, `clearLevel`, `setColumnCriteria`, `rubricCell`, `RubricCell`, `RubricCellButton`, `RubricColumnPage` are used identically wherever they appear. `RubricLevel`, `RubricCriterion`, `RubricTemplate`, `RUBRIC_LEVELS` and `RUBRIC_LEVEL_COLORS` keep their names throughout — only the row named after a dead parent changed.
