# Phase 3 Implementation Plan — annotations, groups, calculation columns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher record why a mark is what it is, divide a class into working groups, and read a derived figure without doing arithmetic on paper.

**Architecture:** Annotations need no schema change — `Grade.note` has existed unused since v1. Groups add two tables at Dexie `version(4)`. Calculation columns add a column type and an optional `calculation` field, evaluated by a pure function; they store nothing and never enter `studentAverage`.

**Tech Stack:** React 19, TypeScript strict, Dexie 4 + dexie-react-hooks, Chicane, Tailwind v4, i18next, zod, Jest + ts-jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-02-profs-phase3-annotations-groups-calculations.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN font, no external image. Documented promise in `README.md` and `PRIVACY.md`.
- **No `window.confirm`, `alert`, `prompt`, or blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use `ConfirmButton`.
- **`src/domain/gradebook/average.ts` must be byte-identical when this plan completes.** Verify with `git diff --stat`. Calculation columns are display-only.
- **Components hold no database write logic.** Every write is a named, tested function in `src/db/`.
- **Use the primitives** in `src/modules/design-system/components/primitives.tsx` (`ActionButton`, `ToggleGroup`, `ToggleOption`, `SeatTile`, `Chip`). Tap height comes from `--control-min`; callers never override it.
- **Two themes** (`copie`, `ardoise`) via `data-theme`. Never hardcode a colour that only works on one — use the tokens in `src/styles/global.css`. Semantic fills carry a paired foreground token; white is not a safe default.
- **i18n parity:** every string through `t()`, every key in BOTH `fr.json` and `en.json`. Plurals use `_one`/`_other`; only pass `count` when plural resolution is wanted.
- **Forms:** `<form onSubmit>` so Enter submits, `autoFocus` on the first field, Escape cancels via `src/modules/shared/use-escape.ts`, every non-submitting button explicitly `type="button"`, errors carry `role="alert"` and `aria-invalid`.
- **Compound-key rows are never read-modify-written as a collection.**
- **State bound to a record is anchored to that record's identity, never its position.** Every armed/staged/draft state gets a `key` on the record id. This codebase has produced that bug four times.
- Navigation uses Chicane `<Link>`; a raw `<a href>` causes a full page reload.
- IDs from `crypto.randomUUID()`; timestamps from `Date.now()`.
- **Validation gate:** `yarn format && yarn lint && yarn typecheck && yarn test`, plus `yarn build`.
- **Staging:** stage explicit paths only. Never `git add -A`.

---

## Part 1 — Annotations (no schema change)

### Task 1: Grade note operations

**Files:**
- Modify: `src/db/grades.ts` (create if absent)
- Test: `src/db/grades.test.ts`

**Interfaces:**
- Produces: `setGradeNote(db, gradebookId, columnId, studentId, note)`, `clearGradeNote(db, ...)`.

- [ ] **Step 1: Write the failing test**

```ts
import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";
import { clearGradeNote, setGradeNote } from "./grades";

function freshDb() {
  return openWorkspaceDb(`grades-${crypto.randomUUID()}`);
}

describe("setGradeNote", () => {
  it("adds a note to an existing mark without touching the value", async () => {
    const db = freshDb();
    await db.grades.put({
      gradebookId: "g1",
      columnId: "c1",
      studentId: "p1",
      value: { type: "numeric", value: 14 },
      updatedAt: 1,
    });
    await setGradeNote(db, "g1", "c1", "p1", "copie rendue en retard");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBe("copie rendue en retard");
    expect(row?.value).toEqual({ type: "numeric", value: 14 });
  });

  it("creates a note-only row when there is no mark yet", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "absent, à rattraper");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBe("absent, à rattraper");
    expect(row?.value).toBeUndefined();
  });

  it("trims, and a blank note clears rather than storing whitespace", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "  revoir  ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBe("revoir");
    await setGradeNote(db, "g1", "c1", "p1", "   ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBeUndefined();
  });
});

describe("clearGradeNote", () => {
  it("removes the note and keeps the mark", async () => {
    const db = freshDb();
    await db.grades.put({
      gradebookId: "g1",
      columnId: "c1",
      studentId: "p1",
      value: { type: "numeric", value: 12 },
      note: "bien",
      updatedAt: 1,
    });
    await clearGradeNote(db, "g1", "c1", "p1");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBeUndefined();
    expect(row?.value).toEqual({ type: "numeric", value: 12 });
  });

  it("deletes the row entirely when only the note remained", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "à rattraper");
    await clearGradeNote(db, "g1", "c1", "p1");
    // A row with neither value nor note is invisible everywhere and would be
    // carried by export forever. It must not survive.
    expect(await db.grades.get(gradeKey("g1", "c1", "p1"))).toBeUndefined();
    expect(await db.grades.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `yarn test src/db/grades.test.ts`, module not found.

- [ ] **Step 3: Implement**

```ts
import type { AppDatabase } from ".";
import { gradeKey } from ".";

/**
 * Notes on a cell.
 *
 * `Grade.note` has existed in the schema since v1 and nothing ever wrote it.
 * A note may exist without a mark — "absent, à rattraper" is worth recording
 * before there is anything to record it against — so these functions maintain
 * one invariant: a row with neither a value nor a note is deleted, never left
 * behind. Such a row is invisible in every grid and would ride along in every
 * export forever.
 */
export async function setGradeNote(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  const key = gradeKey(gradebookId, columnId, studentId);

  await db.transaction("rw", db.grades, async () => {
    const existing = await db.grades.get(key);

    if (trimmed.length === 0) {
      if (!existing) return;
      if (existing.value === undefined) {
        await db.grades.delete(key);
        return;
      }
      const { note: _dropped, ...rest } = existing;
      await db.grades.put({ ...rest, updatedAt: Date.now() });
      return;
    }

    await db.grades.put({
      ...(existing ?? { gradebookId, columnId, studentId }),
      note: trimmed,
      updatedAt: Date.now(),
    } as Parameters<typeof db.grades.put>[0]);
  });
}

export async function clearGradeNote(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
): Promise<void> {
  await setGradeNote(db, gradebookId, columnId, studentId, "");
}
```

Note: `Grade.value` is currently required in `src/db/types.ts`. Make it optional (`value?: GradeValue`) and fix every consumer the compiler flags — `studentAverage` already guards with `grade.value.type !== "numeric"`, so it needs a `grade.value === undefined` guard added, which is a **behaviour-preserving** change and does not count as modifying the file's logic. If that guard cannot be added without touching `average.ts`, STOP and report: the spec forbids changing that file, and this is exactly the kind of conflict a controller must rule on rather than an implementer decide.

- [ ] **Step 4: Run tests, then the whole suite.** A note-only row must not change any average.

- [ ] **Step 5: Add the average-safety test** to `src/domain/gradebook/average.test.ts`:

```ts
it("ignores a row that carries a note but no mark", () => {
  const columns = [{ id: "c1", type: "numeric" as const, weight: 1, max: 20, periodId: "p1" }];
  const withMark = studentAverage([{ columnId: "c1", value: { type: "numeric", value: 10 } }], columns);
  // A note-only row reaches this function with no value at all.
  const withNoteOnly = studentAverage(
    [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: undefined as never },
    ],
    columns,
  );
  expect(withNoteOnly).toBe(withMark);
});
```

- [ ] **Step 6: Commit** — `git add src/db/grades.ts src/db/grades.test.ts src/db/types.ts src/domain/gradebook/average.test.ts`

### Task 2: Annotation UI

**Files:**
- Modify: `src/modules/design-system/components/editable-cell.tsx`
- Modify: `src/modules/gradebook/page.tsx` (marker on annotated cells)
- Modify: `src/modules/entry/page.tsx` (note field in fast entry)
- Modify: both locale files

Requirements, not a transcription:

- An annotated cell shows a small corner marker. The marker is **never the only** indication — the cell's `title` and its accessible name carry the note text, so a screen reader and a hover both reach it.
- The cell editor gains a note field beneath the value. Committing the value and committing the note are separate single-row writes through `setGradeNote`; neither may clobber the other.
- Clearing the note must not clear the mark, and clearing the mark must not clear the note. Prove both in the browser.
- Fast entry (`entry/page.tsx`) gains the same field, positioned so it does not slow the value loop: the value input keeps focus and Enter still advances.
- New keys: `gradebook.note`, `gradebook.notePlaceholder`, `gradebook.hasNote`.

- [ ] Browser verification: add a note to a marked cell, reload, confirm both survive; clear the mark, confirm the note survives; clear the note, confirm the mark survives; add a note to an empty cell, confirm the pupil's average is unchanged.

---

## Part 2 — Student groups

### Task 3: Group domain and schema v4

**Files:**
- Create: `src/domain/group.ts`, `src/domain/group.test.ts`
- Modify: `src/db/types.ts`, `src/db/index.ts`
- Modify: `src/db/index.test.ts`

**Interfaces:**
- Produces: `MAX_GROUP_NAME`, `normaliseGroupName`, `groupsForStudent`; `StudentGroup`, `GroupMember`; `groupMemberKey(groupId, studentId)`; tables `studentGroups`, `groupMembers`.

```ts
// src/domain/group.ts
/**
 * Working groups within a class.
 *
 * A group is a way of selecting and viewing pupils — for seating, for
 * filtering a roster — and deliberately not a thing that holds a grade. Marks
 * belong to a pupil, and a group whose membership changes must never
 * retroactively change what a pupil scored.
 */

export const MAX_GROUP_NAME = 40;

export function normaliseGroupName(raw: string): string {
  return raw.trim().slice(0, MAX_GROUP_NAME);
}

/** Every group a pupil belongs to, in the order the groups were given. */
export function groupsForStudent<T extends { id: string }>(
  groups: T[],
  memberships: { groupId: string; studentId: string }[],
  studentId: string,
): T[] {
  const mine = new Set(
    memberships.filter((m) => m.studentId === studentId).map((m) => m.groupId),
  );
  return groups.filter((g) => mine.has(g.id));
}
```

Tests: name trimmed and truncated at 40; `groupsForStudent` returns only that pupil's groups, in the given order, and an empty array when they belong to none.

Schema: add a `db.version(4).stores({ studentGroups: "id, classId", groupMembers: "[groupId+studentId], groupId, studentId" })` block beside `version(3)`. Add `groupMemberKey`.

- [ ] Commit.

### Task 4: Group operations and cascades

**Files:**
- Create: `src/db/groups.ts`, `src/db/groups.test.ts`
- Modify: `src/db/cascade.ts`, `src/db/cascade.test.ts`
- Modify: `src/db/backup.ts`, `src/db/backup.test.ts` (version 4, rejecting 3)
- Modify: `src/db/seed.ts`

**Interfaces:**
- Produces: `saveGroup`, `addToGroup`, `removeFromGroup`, `setGroupMembers`; `deleteGroup`.

Requirements:

- `saveGroup(db, { groupId?, classId, name, color })` creates or updates, normalising the name and refusing an empty one.
- `addToGroup` / `removeFromGroup` are single-row `put` / `delete` on the compound key.
- `setGroupMembers(db, groupId, studentIds)` replaces membership in one transaction — this is the one legitimately whole-list operation, since the picker edits the set.
- `deleteGroup` takes its memberships. `deleteStudent` gains a membership sweep. `deleteClass` gains its groups and their memberships.
- Backup to `version: 4`, rejecting 3, with a double-import test asserting identical counts after the second import.
- Seed two groups on one class ("Groupe A", "Groupe B") splitting the roster, so the feature is visible in the demo.

Cascade tests assert **zero orphans** across every affected table and that a neighbouring record survives.

- [ ] Commit.

### Task 5: Group UI

**Files:**
- Create: `src/modules/class/components/group-form.tsx`, `src/modules/class/components/group-filter.tsx`
- Modify: `src/modules/class/page.tsx`, `src/modules/plan/page.tsx`, `src/modules/gradebook/page.tsx`, both locale files

Requirements:

- Groups are managed on the class page: create, rename, recolour, delete (via `ConfirmButton`, keyed on group id, its label naming the membership count).
- Membership is edited with a pupil picker calling `setGroupMembers`.
- `GroupFilter` is a shared control — a `ToggleGroup` of group chips plus "Tous" — reused by the class roster, the seating plan's unseated pool, and the gradebook grid. Selection is held as a **group id**, never an index, and falls back to "Tous" when the selected group disappears.
- A pupil's group chips appear on the class roster row.

- [ ] Browser verification: create a group, add pupils, filter the roster, filter the unseated pool on the plan, delete the group and confirm the pupils survive.

---

## Part 3 — Calculation columns

### Task 6: The calculation domain

**Files:**
- Create: `src/domain/gradebook/calculation.ts`, `src/domain/gradebook/calculation.test.ts`
- Modify: `src/domain/gradebook/column.ts` (add `"calculation"` to `COLUMN_TYPES`)

**Interfaces:**
- Produces: `CALCULATION_KINDS`, `CalculationKind`, `CalculationSpec`, `evaluateCalculation`.

```ts
/**
 * Columns whose value is derived from other columns.
 *
 * Display only: a calculation NEVER enters `studentAverage`. French marking
 * already expresses weighting through the coefficient — `column.weight`, since
 * v1 — so a calculation feeding the average would duplicate that mechanism
 * while risking the one failure this app cannot afford, a silently wrong
 * bulletin. See the phase 3 spec for the full argument.
 *
 * Sources are plain numeric columns only. No calculation may read another, so
 * no cycle can exist and there is no evaluation order to define.
 */

export const CALCULATION_KINDS = ["mean", "sum", "bestOf", "count"] as const;

export type CalculationKind = (typeof CALCULATION_KINDS)[number];

export interface CalculationSpec {
  kind: CalculationKind;
  sourceColumnIds: string[];
  /** Only meaningful for `bestOf`. */
  bestCount?: number;
}
```

`evaluateCalculation(spec, sources, grades)` returns `number | null`:

- `mean` — each source normalised to /20 by its own `max`, weighted by its `weight`, then averaged. Same normalisation as `studentAverage`, so a /100 and a /20 test are comparable.
- `bestOf` — normalise each source to /20, take the best `bestCount`, mean them. Fewer marks than `bestCount` means mean of what exists, not a penalty.
- `sum` — raw values added, **not** normalised. A points total is asked for in points.
- `count` — how many sources have a numeric value. This one returns 0 rather than null for a pupil with nothing, because "zero marks so far" is the honest answer to a count.

Everything except `count` returns **null** when the pupil has no numeric value in any source. Null renders as an empty cell — never as 0/20, which would be a lie about a pupil who sat nothing.

Tests must cover, at minimum: mean normalising a /100 source; weight respected; `bestOf` with fewer marks than `bestCount`; `sum` not normalising; `count` returning 0 not null; every kind returning null (or 0 for `count`) on an empty source list; a source id that matches no column being ignored rather than throwing.

- [ ] Commit.

### Task 7: Calculation columns in the database and grid

**Files:**
- Modify: `src/db/types.ts` (`GradeColumn.calculation?: CalculationSpec`)
- Modify: `src/db/cascade.ts`, `src/db/cascade.test.ts`
- Modify: `src/modules/gradebook/components/column-form.tsx`
- Modify: `src/modules/gradebook/page.tsx`, `src/modules/design-system/components/editable-cell.tsx`
- Modify: both locale files

**The subtle cascade.** `deleteColumn` must remove the deleted column's id from `sourceColumnIds` of every calculation column that referenced it, in the same transaction. A calculation pointing at a column that no longer exists silently changes meaning. Two tests: one proving the referencing calculation is updated, one proving a calculation referencing a *different* column is untouched.

**A calculation column stores nothing.** There are no grade rows for it. Consequences to implement and test:

- `EditableCell` renders a calculation cell **read-only** — it is derived, and letting a teacher type into it would create a stored value that the next render discards.
- `parseGradeValue` must not accept a calculation type.
- `isNumericColumn` stays false for `calculation`, so it never enters the average.
- Export/import carry the `calculation` field on the column; no grade rows accompany it.

Column form: choosing type `calculation` reveals a kind selector, a multi-select of the gradebook's numeric columns in the same period, and a count input for `bestOf`. A calculation with no sources is allowed but renders empty, with a hint saying so.

- [ ] Browser verification: create a `mean` calculation over two columns of different `max`, confirm the value matches a hand calculation; confirm the cell cannot be typed into; delete one source column and confirm the calculation updates rather than breaking; confirm **every pupil's gradebook average is unchanged** before and after adding the calculation column.

### Task 8: Documentation

- `CLAUDE.md`: the two new tables, `Grade.note` now in use and the no-value-no-note invariant, calculation columns being display-only and why, the `deleteColumn` source-pruning cascade.
- `docs/BACKLOG.md`: mark items 1, 2 and 3 delivered; keep the parked items intact.
- `README.md`: add the three features.
- `PRIVACY.md`: annotations are free text a teacher may use for anything, stored on device and **included in JSON export** like `Student.notes`. Say so.

- [ ] Commit.

---

## Self-Review

**Spec coverage.** Annotations without schema change (T1, T2), the no-value-no-note invariant (T1), groups and membership (T3, T4), the three consumption points (T5), calculation kinds and normalisation (T6), display-only enforcement (T6, T7), the `deleteColumn` source-pruning cascade (T7), `average.ts` untouched (asserted in T1 and T7), privacy note on annotations (T8).

**Placeholders.** Tasks 2, 5 and 7's UI portions are specified as behaviour with named browser verifications rather than transcribed markup — the same posture as phases 2A and 2B, which caught defects reliably. The domain and database layers, where a mistake corrupts data silently, carry complete code and tests.

**Type consistency.** `CalculationSpec` is defined once in `@domain/gradebook/calculation` and imported by `db/types.ts`, never redeclared. `groupMemberKey` returns `[string, string]`, matching `Table<GroupMember, [string, string]>`. `Grade.value` becomes optional in T1, and every consumer the compiler flags is fixed in that same task.

**The one hazard worth naming.** Making `Grade.value` optional touches a type that `average.ts` consumes. The task says explicitly: if the necessary guard cannot be added without changing `average.ts`'s logic, stop and report rather than decide. That file is the one whose silent failure reaches a parent.
