# Pupil Page Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/students/:studentId` as a fully editable, pupil-major synthesis for the conseil de classe — marks per carnet against the class, an assiduité figure, and a séance-by-séance attendance record.

**Architecture:** Four new pure domain modules carry every rule (`student-summary.ts`, `student-list.ts`); the page is an orchestrator in `src/modules/student/` with three block components; every write goes through `src/db/`, including a `writeGrade` that this plan extracts out of two components first.

**Tech Stack:** React 19, Dexie (IndexedDB), Chicane router, TanStack Table, Tailwind, i18next, Jest + fake-indexeddb, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-09-profs-student-synthesis-design.md` — read it before Task 1. The plan argues from it and does not repeat its reasoning.

## Global Constraints

- **Node is not on the default PATH.** Every `yarn` command fails with `command not found` until you prepend it:
  `export PATH="$HOME/.local/share/fnm/node-versions/<version>/installation/bin:$PATH"`. Find the version with `ls ~/.local/share/fnm/node-versions/`.
- **Validation gate — all four green before any task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- **No network request of any kind.** No `fetch`, no CDN, no external font, no chart library. The position bar is hand-written inline SVG.
- **No `window.confirm`, `alert`, `beforeunload`, or any blocking browser dialog.** Destructive actions use `ConfirmButton`.
- **Every user-visible string goes through `t()`**, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json` — `src/i18n/locales/locales.test.ts` fails the build otherwise. Plurals use `_one` / `_other`. Only pass an interpolation variable named `count` when you want plural resolution.
- **`fr` is the default and the fallback**; identifiers are English, only translation values are French.
- **Pupil names are composed only by `PupilName`** (`src/modules/design-system/components/pupil-name.tsx`). Never `toUpperCase()`.
- **44px minimum tap targets** (`.btn` and `min-h-11`).
- **State bound to a record is anchored to the record's id, never to its position in a list.**
- **IDs are `crypto.randomUUID()`; timestamps are `Date.now()` epoch-ms.**
- **Never add days by arithmetic.** Use `addDays` / `nextDay` from `src/domain/calendar.ts`.
- **Domain modules import no React, no Dexie, no I/O.** They are the only place with real unit tests.
- **There are deliberately no component tests.** UI is verified by driving a real browser against `yarn dev` on port 3000.
- **Writes live in `src/db/`, never inline in a component.**
- Formatting: `formatDecimal` for display, `formatDecimalExact` for seeding an editor. Both take the app's locale from `i18n.language`, never the browser's.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/domain/student-summary.ts` | The four pure rules the page prints: `attendanceSummary`, `positionOnScale`, `lastMarkedPeriod`, `groupSeancesByMonth` / `defaultOpenMonth`. |
| `src/domain/student-summary.test.ts` | Its tests. |
| `src/domain/student-list.ts` | The ordered set the `‹ ›` arrows walk: params type, filter, comparator, sequence, neighbours. |
| `src/domain/student-list.test.ts` | Its tests. |
| `src/db/grades.test.ts` | Tests for the extracted `writeGrade` (the file does not exist yet; `grades.ts` does). |
| `src/modules/design-system/components/position-bar.tsx` | The inline-SVG class-spread bar, with its text equivalent. |
| `src/modules/student/components/student-header.tsx` | Photo, name, class link, arrows, Modifier/Supprimer, notes. |
| `src/modules/student/components/carnet-section.tsx` | One carnet: period tabs, average, position bar, editable column rows. |
| `src/modules/student/components/presence-block.tsx` | Assiduité figure, counts, month-grouped séance rows with P/A/R/E. |
| `src/modules/student/components/behaviour-block.tsx` | Counts by type and the complete timeline with delete. |

**Modified**

| File | Change |
|---|---|
| `src/db/grades.ts` | Gains `writeGrade`. |
| `src/modules/gradebook/page.tsx` | Local `writeGrade` deleted; the cell's `onChange` calls the db one. Nothing else in this file changes. |
| `src/modules/entry/page.tsx` | Inline write block replaced by the db call. |
| `src/router.ts` | `Student` and `ClassStudents` gain search params. |
| `src/app.tsx` | Passes the new params through. |
| `src/modules/class/students-page.tsx` | Group filter and sort move from React state into the URL; pupil links carry the list params. |
| `src/modules/students/page.tsx` | Pupil links and `onRowClick` carry the list params; columns use the shared comparator. |
| `src/modules/plan/components/student-card.tsx` | Its link to the pupil page takes optional list params. |
| `src/modules/student/page.tsx` | Rewritten as the orchestrator. |
| `src/i18n/locales/fr.json`, `en.json` | New keys; `behaviour.range` / `behaviour.rangeLabel` removed. |
| `CLAUDE.md`, `docs/BACKLOG.md` | The rulings this work takes. |

**Deleted**

`src/domain/behaviour-range.ts`, `src/domain/behaviour-range.test.ts`.

---

### Task 1: `writeGrade` moves into `src/db/grades.ts`

The rule for writing a mark is a local function in the grid page and a hand-copied block in the fast-entry screen. The two have already drifted: the entry screen re-reads the row inside the write so a concurrently written note is not clobbered; the grid builds the row from a render-time snapshot. Adding a third copy on the pupil page is what this prevents.

**Files:**
- Modify: `src/db/grades.ts` (add `writeGrade` above `setGradeNote`)
- Create: `src/db/grades.test.ts`
- Modify: `src/modules/gradebook/page.tsx:126-151` (delete local `writeGrade`), `:333` (the `onChange` call site)
- Modify: `src/modules/entry/page.tsx:91-112` (the inline write block)

**Interfaces:**
- Consumes: `gradeKey(gradebookId, columnId, studentId)` and `AppDatabase` from `src/db/index.ts`; `GradeValue` from `@domain/gradebook/grade`.
- Produces: `writeGrade(db: AppDatabase, gradebookId: string, columnId: string, studentId: string, next: GradeValue | null): Promise<void>` — Tasks 7 and the two modified pages call it.

- [ ] **Step 1: Write the failing tests**

Create `src/db/grades.test.ts`:

```ts
import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";
import { setGradeNote, writeGrade } from "./grades";

function freshDb(label: string) {
  return openWorkspaceDb(`grades-${label}-${crypto.randomUUID()}`);
}

describe("writeGrade", () => {
  it("stores a mark", async () => {
    const db = freshDb("store");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });

    expect((await db.grades.get(gradeKey("gb1", "c1", "s1")))?.value).toEqual({
      type: "numeric",
      value: 14,
    });
    db.close();
  });

  it("replaces a mark rather than adding a second row", async () => {
    const db = freshDb("replace");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 9 });

    expect(await db.grades.count()).toBe(1);
    expect((await db.grades.get(gradeKey("gb1", "c1", "s1")))?.value).toEqual({
      type: "numeric",
      value: 9,
    });
    db.close();
  });

  it("deletes the row outright when a cleared cell has no note", async () => {
    const db = freshDb("clear");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await writeGrade(db, "gb1", "c1", "s1", null);

    expect(await db.grades.get(gradeKey("gb1", "c1", "s1"))).toBeUndefined();
    db.close();
  });

  it("keeps the note when the mark is cleared", async () => {
    const db = freshDb("keep-note");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await setGradeNote(db, "gb1", "c1", "s1", "à rattraper");
    await writeGrade(db, "gb1", "c1", "s1", null);

    const row = await db.grades.get(gradeKey("gb1", "c1", "s1"));
    expect(row?.note).toBe("à rattraper");
    expect(row?.value).toBeUndefined();
    db.close();
  });

  // The drift this extraction exists to remove. The grid built its `put` from
  // a render-time snapshot, so a note written after that render — by the note
  // field's own blur, or by another surface on the same row — was carried
  // forward as `undefined` and silently lost. Re-reading inside the
  // transaction is what the fast-entry screen already did.
  it("carries a note written after the caller last read the row", async () => {
    const db = freshDb("stale");
    await setGradeNote(db, "gb1", "c1", "s1", "absent, à rattraper");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 11 });

    const row = await db.grades.get(gradeKey("gb1", "c1", "s1"));
    expect(row?.note).toBe("absent, à rattraper");
    expect(row?.value).toEqual({ type: "numeric", value: 11 });
    db.close();
  });

  it("writes nothing when clearing a cell that was never stored", async () => {
    const db = freshDb("noop");
    await writeGrade(db, "gb1", "c1", "s1", null);

    expect(await db.grades.count()).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/db/grades.test.ts`
Expected: FAIL — `writeGrade` is not exported from `./grades`.

- [ ] **Step 3: Write the implementation**

Add to `src/db/grades.ts`, after the imports and before `setGradeNote`. Extend the existing import line to `import { gradeKey } from ".";` if it is not already there, and add `import type { GradeValue } from "@domain/gradebook/grade";`.

```ts
/**
 * One cell's mark. `null` means "clear this cell".
 *
 * The counterpart of `setGradeNote`, and it maintains the same invariant from
 * the other side: a row with neither a value nor a note is deleted rather than
 * left as an empty husk, since such a row is invisible in every grid and rides
 * along in every export forever.
 *
 * The read happens INSIDE the transaction rather than in the caller. A note
 * may have been written since the caller last rendered — by the note field's
 * own blur, or by another surface live on the same row — and a `put` built
 * from a stale snapshot drops it silently. Two of the three callers used to
 * hand-write this; one of them re-read and one did not.
 */
export async function writeGrade(
  db: AppDatabase,
  gradebookId: string,
  columnId: string,
  studentId: string,
  next: GradeValue | null,
): Promise<void> {
  const key = gradeKey(gradebookId, columnId, studentId);

  await db.transaction("rw", db.grades, async () => {
    const existing = await db.grades.get(key);

    if (next === null) {
      if (!existing) return;
      if (existing.note === undefined) {
        await db.grades.delete(key);
        return;
      }
      const { value: _dropped, ...rest } = existing;
      await db.grades.put({ ...rest, updatedAt: Date.now() });
      return;
    }

    await db.grades.put({
      ...(existing ?? { gradebookId, columnId, studentId }),
      value: next,
      updatedAt: Date.now(),
    });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/db/grades.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Move the grid onto it**

In `src/modules/gradebook/page.tsx`, delete the whole local `async function writeGrade(column, student, next)` (lines ~126–151) and add `writeGrade` to the existing `setGradeNote` import from `@db/grades`. Change the call site:

```tsx
onChange={(next) => writeGrade(db, gradebookId, column.id, student.id, next)}
```

If `gradeKey` is now unused in this file, remove it from the import — `yarn lint` will say so.

- [ ] **Step 6: Move the fast-entry screen onto it**

In `src/modules/entry/page.tsx`, replace the whole `try` block body between `setIsCommitting(true);` and `setDraft(null);` — that is, the `const existing = await db.grades.get(...)` line and the `if (parsed === null) { … } else { … }` that follows — with:

```ts
      await writeGrade(db, gradebookId, columnId, current.id, parsed);
      setDraft(null);
```

Add `writeGrade` to the existing `@db/grades` import. Keep the comment about the note flush above (`commitNote()` and the awaited `pendingNoteWrite`) exactly as it is — it explains why the note is flushed first, which is still true; only the reason for re-reading has moved into `writeGrade`. If `gradeKey` becomes unused, drop it from the import.

- [ ] **Step 7: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 8: Verify the two existing surfaces still write in a browser**

Run `yarn dev`, open `http://localhost:3000/profs/`, go Classes → a class → Carnets → a carnet. Type a mark into a cell, press Enter, and confirm it persists on reload. Open the same cell's note, type text, clear the mark, and confirm the note survives and the mark is gone. Then open the carnet's fast entry for a column and do the same there.

- [ ] **Step 9: Commit**

```bash
git add src/db/grades.ts src/db/grades.test.ts src/modules/gradebook/page.tsx src/modules/entry/page.tsx
git commit -m "refactor(grades): a mark is written in one place, and it re-reads

\`writeGrade\` was a local function in the grid page and a hand-copied
block in the fast-entry screen. The copies had already drifted: the entry
screen re-read the row inside the write so a note written since the last
render survived, and the grid built its put from a render-time snapshot,
which dropped one. Both now call \`src/db/grades.ts\`, beside
\`setGradeNote\` and holding the same invariant from the other side.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 2: `attendanceSummary` and `positionOnScale`

The two figures the synthesis prints. Both refuse to answer rather than answer wrongly: no rate when nothing is marked, no bar for a spread of one.

**Files:**
- Create: `src/domain/student-summary.ts`
- Create: `src/domain/student-summary.test.ts`

**Interfaces:**
- Consumes: `ATTENDANCE_VALUES`, `AttendanceValue` from `@domain/attendance`.
- Produces:
  - `attendanceSummary(records: { value: AttendanceValue }[]): AttendanceSummary` where `AttendanceSummary = { counts: Record<AttendanceValue, number>; marked: number; unjustified: number; rate: number | null }` — `rate` is a fraction in `[0, 1]`, not a percentage.
  - `positionOnScale(value: number, values: number[]): Position | null` where `Position = { min: number; max: number; mean: number; fraction: number; meanFraction: number }` — both fractions in `[0, 1]`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/student-summary.test.ts`:

```ts
import type { AttendanceValue } from "./attendance";
import { attendanceSummary, positionOnScale } from "./student-summary";

const marks = (...values: AttendanceValue[]) => values.map((value) => ({ value }));

describe("attendanceSummary", () => {
  it("counts each value", () => {
    const summary = attendanceSummary(
      marks("present", "present", "absent", "late", "excused", "excused"),
    );

    expect(summary.counts).toEqual({ present: 2, absent: 1, late: 1, excused: 2 });
    expect(summary.marked).toBe(6);
  });

  // The numerator is présent + en retard + excusé: a late pupil was in the
  // room, and an excused one had a reason. Only an unjustified absence pulls
  // the figure down, which is why the label is "assiduité" and never
  // "présence".
  it("counts only an unjustified absence against the rate", () => {
    const summary = attendanceSummary(marks("present", "late", "excused", "absent"));

    expect(summary.unjustified).toBe(1);
    expect(summary.rate).toBeCloseTo(3 / 4);
  });

  it("reads a fully excused record as complete assiduité", () => {
    expect(attendanceSummary(marks("excused", "excused")).rate).toBe(1);
  });

  // Not 0 %, not 100 %. A séance is created lazily, so nothing marked means
  // nothing is known — printing a percentage would be a claim about lessons
  // the app never saw.
  it("has no rate at all when nothing was marked", () => {
    const summary = attendanceSummary([]);

    expect(summary.rate).toBeNull();
    expect(summary.marked).toBe(0);
    expect(summary.counts).toEqual({ present: 0, absent: 0, late: 0, excused: 0 });
  });

  it("reads a wholly unjustified record as zero", () => {
    expect(attendanceSummary(marks("absent", "absent")).rate).toBe(0);
  });
});

describe("positionOnScale", () => {
  it("places a value between the lowest and the highest", () => {
    const position = positionOnScale(12, [4, 12, 20]);

    expect(position).not.toBeNull();
    expect(position?.min).toBe(4);
    expect(position?.max).toBe(20);
    expect(position?.fraction).toBeCloseTo(0.5);
  });

  it("puts the lowest at 0 and the highest at 1", () => {
    expect(positionOnScale(4, [4, 20])?.fraction).toBe(0);
    expect(positionOnScale(20, [4, 20])?.fraction).toBe(1);
  });

  it("places the class mean on the same scale", () => {
    const position = positionOnScale(8, [4, 8, 20, 20]);

    expect(position?.mean).toBeCloseTo(13);
    expect(position?.meanFraction).toBeCloseTo((13 - 4) / 16);
  });

  // A spread of one is a point, and a point drawn as a scale is a lie about
  // a class.
  it("refuses to draw a scale from fewer than two values", () => {
    expect(positionOnScale(12, [12])).toBeNull();
    expect(positionOnScale(12, [])).toBeNull();
  });

  it("refuses a scale with no width", () => {
    expect(positionOnScale(12, [12, 12, 12])).toBeNull();
  });

  it("clamps a value outside the class spread", () => {
    expect(positionOnScale(2, [4, 20])?.fraction).toBe(0);
    expect(positionOnScale(25, [4, 20])?.fraction).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/domain/student-summary.test.ts`
Expected: FAIL — cannot find module `./student-summary`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/student-summary.ts`:

```ts
/**
 * What the pupil page prints about one child.
 *
 * Pure: no React, no Dexie. Every function here refuses to answer rather than
 * answer wrongly, because each of these figures is one a teacher repeats at a
 * conseil de classe or to a parent.
 */

import { ATTENDANCE_VALUES, type AttendanceValue } from "./attendance";

export interface AttendanceSummary {
  counts: Record<AttendanceValue, number>;
  /** Séances where this pupil was marked at all. Never lessons held. */
  marked: number;
  /** Absences with no reason recorded — the only value the rate counts against. */
  unjustified: number;
  /** A fraction in [0, 1], or null when nothing was marked. Never a percentage. */
  rate: number | null;
}

/**
 * Assiduité, and deliberately not présence.
 *
 * The numerator is présent + en retard + excusé: a late pupil was in the room,
 * and an excused one was not but had a reason. That makes the figure meaningless
 * under the word *présence* — a pupil absent half the term with a note from home
 * would read near 100 % — so the interface names it assiduité and states the
 * definition beside it.
 *
 * The denominator is séances MARKED. A séance is created lazily, only when
 * somebody recorded something, so the app knows lessons recorded and never
 * lessons held. With nothing marked there is no rate at all: 0 % and 100 % are
 * both claims about lessons nobody registered.
 */
export function attendanceSummary(records: { value: AttendanceValue }[]): AttendanceSummary {
  const counts = Object.fromEntries(ATTENDANCE_VALUES.map((value) => [value, 0])) as Record<
    AttendanceValue,
    number
  >;
  for (const record of records) counts[record.value] += 1;

  const marked = records.length;
  const unjustified = counts.absent;

  return {
    counts,
    marked,
    unjustified,
    rate: marked === 0 ? null : (marked - unjustified) / marked,
  };
}

export interface Position {
  min: number;
  max: number;
  mean: number;
  /** Where the value sits between min and max, clamped to [0, 1]. */
  fraction: number;
  /** Where the mean sits on the same scale. */
  meanFraction: number;
}

/**
 * Where one average sits in the class's spread.
 *
 * Null under two values, and null when the spread has no width: a point drawn
 * as a scale says something false about a class, and a bar with min === max
 * has nowhere to put the dot.
 *
 * The value is clamped rather than allowed off the ends, so a caller passing an
 * average that is not itself in `values` still draws inside the bar.
 */
export function positionOnScale(value: number, values: number[]): Position | null {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return null;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const place = (n: number): number => Math.min(1, Math.max(0, (n - min) / (max - min)));

  return { min, max, mean, fraction: place(value), meanFraction: place(mean) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/domain/student-summary.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/student-summary.ts src/domain/student-summary.test.ts
git commit -m "feat(domain): assiduité names what it counts, and a class of one draws no scale

\`attendanceSummary\` counts présent, en retard and excusé toward the rate —
only an unjustified absence pulls it down — and returns no rate at all when
nothing was marked, since a séance is created lazily and 0 % would be a claim
about lessons nobody registered. \`positionOnScale\` returns null under two
values and for a spread with no width: a point drawn as a scale is a lie
about a class.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 3: `lastMarkedPeriod` and `groupSeancesByMonth`

The two rules that decide what a page opens on: which period tab a carnet shows, and which month of séances is expanded.

**Files:**
- Modify: `src/domain/student-summary.ts`
- Modify: `src/domain/student-summary.test.ts`

**Interfaces:**
- Consumes: `addDays` is NOT needed here; month keys are read off a `Date` and never computed by arithmetic.
- Produces:
  - `lastMarkedPeriod(periods: PeriodOrder[], columns: ColumnPeriod[], gradedColumnIds: Iterable<string>): string | null` where `PeriodOrder = { id: string; order: number }` and `ColumnPeriod = { id: string; periodId: string }`.
  - `groupSeancesByMonth<T extends { date: number }>(sessions: T[]): SeanceMonth<T>[]` where `SeanceMonth<T> = { key: string; year: number; month: number; sessions: T[] }`.
  - `defaultOpenMonth(months: { key: string }[], now: number): string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/student-summary.test.ts`:

```ts
import { defaultOpenMonth, groupSeancesByMonth, lastMarkedPeriod } from "./student-summary";

const periods = [
  { id: "t1", order: 0 },
  { id: "t2", order: 1 },
  { id: "t3", order: 2 },
];
const columns = [
  { id: "c1", periodId: "t1" },
  { id: "c2", periodId: "t2" },
  { id: "c3", periodId: "t3" },
];

describe("lastMarkedPeriod", () => {
  // "Where the marking has got to" — in December that is T2, which is the
  // trimestre a conseil is about. It needs no dates, which Period does not
  // carry.
  it("picks the last period by order that holds a marked column", () => {
    expect(lastMarkedPeriod(periods, columns, ["c1", "c2"])).toBe("t2");
  });

  it("ignores order in the input and reads `order`", () => {
    const shuffled = [periods[2], periods[0], periods[1]];
    expect(lastMarkedPeriod(shuffled, columns, ["c1", "c3"])).toBe("t3");
  });

  it("falls back to the first period when nothing is marked at all", () => {
    expect(lastMarkedPeriod(periods, columns, [])).toBe("t1");
  });

  it("ignores a graded column that belongs to no period here", () => {
    expect(lastMarkedPeriod(periods, columns, ["ghost"])).toBe("t1");
  });

  it("has no answer for a carnet with no periods", () => {
    expect(lastMarkedPeriod([], columns, ["c1"])).toBeNull();
  });
});

describe("groupSeancesByMonth", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

  it("groups by calendar month, newest month first", () => {
    const months = groupSeancesByMonth([
      { date: at(2026, 11, 4) },
      { date: at(2026, 10, 18) },
      { date: at(2026, 11, 2) },
    ]);

    expect(months.map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
    expect(months[0].sessions).toHaveLength(2);
    expect(months[1].sessions).toHaveLength(1);
  });

  it("keeps the newest séance first inside a month", () => {
    const months = groupSeancesByMonth([
      { date: at(2026, 11, 2) },
      { date: at(2026, 11, 4) },
    ]);

    expect(months[0].sessions.map((s) => s.date)).toEqual([at(2026, 11, 4), at(2026, 11, 2)]);
  });

  it("carries the year and the month for the heading", () => {
    const months = groupSeancesByMonth([{ date: at(2027, 0, 9) }]);

    expect(months[0]).toMatchObject({ key: "2027-0", year: 2027, month: 0 });
  });

  it("separates the same month of two years", () => {
    const months = groupSeancesByMonth([{ date: at(2027, 0, 9) }, { date: at(2026, 0, 9) }]);

    expect(months.map((m) => m.key)).toEqual(["2027-0", "2026-0"]);
  });

  it("has nothing to group for a class with no séance", () => {
    expect(groupSeancesByMonth([])).toEqual([]);
  });
});

describe("defaultOpenMonth", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

  it("opens the month we are in", () => {
    const months = groupSeancesByMonth([{ date: at(2026, 11, 4) }, { date: at(2026, 10, 18) }]);

    expect(defaultOpenMonth(months, at(2026, 11, 20))).toBe("2026-11");
  });

  // A page whose only open section is empty reads as a bug. When this month
  // holds no séance — a holiday, or a class not taught since — the most
  // recent month that does is opened instead.
  it("opens the most recent month with a séance when this month has none", () => {
    const months = groupSeancesByMonth([{ date: at(2026, 10, 18) }]);

    expect(defaultOpenMonth(months, at(2026, 11, 20))).toBe("2026-10");
  });

  it("has nothing to open when there is no séance at all", () => {
    expect(defaultOpenMonth([], at(2026, 11, 20))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/domain/student-summary.test.ts`
Expected: FAIL — `lastMarkedPeriod`, `groupSeancesByMonth` and `defaultOpenMonth` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/domain/student-summary.ts`:

```ts
/**
 * Which period tab a carnet opens on: the last one, by `order`, holding a
 * column somebody has marked — "where the marking has got to", which in
 * December is the trimestre being discussed.
 *
 * It needs no dates, which is the point: a `Period` carries none, and inventing
 * one would change what a bulletin filters by. A carnet with no mark at all
 * falls back to its first period, which is where its grid starts.
 */
export function lastMarkedPeriod(
  periods: { id: string; order: number }[],
  columns: { id: string; periodId: string }[],
  gradedColumnIds: Iterable<string>,
): string | null {
  const ordered = [...periods].sort((a, b) => a.order - b.order);
  if (ordered.length === 0) return null;

  const periodOf = new Map(columns.map((column) => [column.id, column.periodId]));
  const marked = new Set<string>();
  for (const columnId of gradedColumnIds) {
    const periodId = periodOf.get(columnId);
    if (periodId !== undefined) marked.add(periodId);
  }

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (marked.has(ordered[i].id)) return ordered[i].id;
  }
  return ordered[0].id;
}

export interface SeanceMonth<T> {
  /** `"2026-11"` — the year and the zero-based month, for React keys and state. */
  key: string;
  year: number;
  /** Zero-based, as `Date.getMonth()` gives it. */
  month: number;
  sessions: T[];
}

/**
 * A class's séances, newest first, in calendar months.
 *
 * The month comes off a `Date`, never from arithmetic on the timestamp: this
 * codebase adds days by walking the calendar for `weekParity`'s reason, and a
 * month is a worse offender than a day.
 */
export function groupSeancesByMonth<T extends { date: number }>(sessions: T[]): SeanceMonth<T>[] {
  const months = new Map<string, SeanceMonth<T>>();

  for (const session of [...sessions].sort((a, b) => b.date - a.date)) {
    const day = new Date(session.date);
    const year = day.getFullYear();
    const month = day.getMonth();
    const key = `${year}-${month}`;
    const existing = months.get(key);
    if (existing) {
      existing.sessions.push(session);
    } else {
      months.set(key, { key, year, month, sessions: [session] });
    }
  }

  return [...months.values()];
}

/**
 * The month expanded when the page opens: the current one, or the most recent
 * one holding a séance. A page whose only open section is empty reads as a bug.
 */
export function defaultOpenMonth(months: { key: string }[], now: number): string | null {
  if (months.length === 0) return null;
  const today = new Date(now);
  const currentKey = `${today.getFullYear()}-${today.getMonth()}`;
  return months.some((month) => month.key === currentKey) ? currentKey : months[0].key;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/domain/student-summary.test.ts`
Expected: PASS, 25 tests total in the file.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/student-summary.ts src/domain/student-summary.test.ts
git commit -m "feat(domain): a carnet opens where the marking got to, a séance list on this month

\`lastMarkedPeriod\` picks the last period by order holding a marked column,
falling back to the first — no dates involved, since a Period carries none
and inventing one would change what a bulletin filters by.
\`groupSeancesByMonth\` reads the month off a Date rather than computing it,
and \`defaultOpenMonth\` opens the most recent month holding a séance when
this one holds none, so the one expanded section is never empty.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 4: `student-list.ts` — the set the arrows walk

The `‹ ›` arrows step through the list the teacher arrived from. That list is described by URL params, so the order has to be reconstructible from them — and it has to match what the table showed, which is why the comparator here is the one the tables will be given in Task 5.

**Files:**
- Create: `src/domain/student-list.ts`
- Create: `src/domain/student-list.test.ts`

**Interfaces:**
- Consumes: `fuzzyMatchAny` from `@domain/search`, `filterByGroup` from `@domain/group`, `sortingFromParams` and `ColumnSort` from `@domain/table-sort`.
- Produces:
  - `STUDENT_SORT_COLUMNS: readonly string[]` — `["lastName", "firstName", "classLabel"]`.
  - `interface StudentListParams { q?: string; classe?: string; groupe?: string; sort?: string; dir?: string }`
  - `interface ListStudent { id: string; lastName: string; firstName: string; classId: string; classLabel: string }`
  - `compareStudents(a: ListStudent, b: ListStudent, sorting: ColumnSort[]): number`
  - `studentSequence(students: ListStudent[], memberships: { groupId: string; studentId: string }[], params: StudentListParams): string[]`
  - `neighbours(ids: string[], studentId: string): { previousId: string | null; nextId: string | null; index: number; total: number } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/student-list.test.ts`:

```ts
import { compareStudents, neighbours, studentSequence } from "./student-list";

const pupil = (id: string, lastName: string, firstName: string, classId = "c1", classLabel = "3°B") => ({
  id,
  lastName,
  firstName,
  classId,
  classLabel,
});

const roster = [
  pupil("s1", "Bernard", "Adam"),
  pupil("s2", "Chevalier", "Éloïse"),
  pupil("s3", "Abadie", "Zoé"),
];

describe("compareStudents", () => {
  it("falls back to surname order when nothing is sorted", () => {
    const sorted = [...roster].sort((a, b) => compareStudents(a, b, []));
    expect(sorted.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
  });

  it("sorts by the named column, descending when asked", () => {
    const sorted = [...roster].sort((a, b) =>
      compareStudents(a, b, [{ id: "firstName", desc: true }]),
    );
    expect(sorted.map((s) => s.firstName)).toEqual(["Zoé", "Éloïse", "Adam"]);
  });

  // A surname sort that puts Éloïse after Z is a sort a French teacher reads
  // as broken. `Intl.Collator` is what the tables are given too, so the arrows
  // and the rows cannot disagree.
  it("orders accents where French expects them", () => {
    const names = [pupil("a", "Zaza", "z"), pupil("b", "Élan", "e"), pupil("c", "Eau", "e")];
    const sorted = [...names].sort((a, b) => compareStudents(a, b, [{ id: "lastName", desc: false }]));
    expect(sorted.map((s) => s.lastName)).toEqual(["Eau", "Élan", "Zaza"]);
  });

  it("breaks a tie on the sorted column with the surname", () => {
    const names = [pupil("a", "Zaza", "Léa"), pupil("b", "Abadie", "Léa")];
    const sorted = [...names].sort((a, b) =>
      compareStudents(a, b, [{ id: "firstName", desc: false }]),
    );
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("studentSequence", () => {
  it("is every pupil in surname order with no params", () => {
    expect(studentSequence(roster, [], {})).toEqual(["s3", "s1", "s2"]);
  });

  it("narrows to a class", () => {
    const mixed = [...roster, pupil("s4", "Durand", "Léo", "c2", "4°A")];
    expect(studentSequence(mixed, [], { classe: "c2" })).toEqual(["s4"]);
  });

  it("narrows to a group", () => {
    const memberships = [
      { groupId: "g1", studentId: "s1" },
      { groupId: "g1", studentId: "s3" },
    ];
    expect(studentSequence(roster, memberships, { groupe: "g1" })).toEqual(["s3", "s1"]);
  });

  // Same accent-insensitive search the tables run, so a teacher who typed
  // "eloise" and stepped through the results steps through the rows they saw.
  it("narrows by an accent-insensitive query", () => {
    expect(studentSequence(roster, [], { q: "eloise" })).toEqual(["s2"]);
  });

  it("searches the class label too", () => {
    const mixed = [...roster, pupil("s4", "Durand", "Léo", "c2", "4°A")];
    expect(studentSequence(mixed, [], { q: "4°A" })).toEqual(["s4"]);
  });

  it("applies the sort named in the params", () => {
    expect(studentSequence(roster, [], { sort: "firstName", dir: "desc" })).toEqual([
      "s3",
      "s2",
      "s1",
    ]);
  });

  // Resolve or ignore — the rule `?classe` already follows for a deleted
  // class. A URL can name a column that no longer exists.
  it("ignores a sort naming a column that does not exist", () => {
    expect(studentSequence(roster, [], { sort: "ghost", dir: "desc" })).toEqual(["s3", "s1", "s2"]);
  });

  it("ignores a class that does not exist rather than emptying the list", () => {
    expect(studentSequence(roster, [], { classe: "gone" })).toEqual(["s3", "s1", "s2"]);
  });

  it("ignores a group that does not exist", () => {
    expect(studentSequence(roster, [], { groupe: "gone" })).toEqual(["s3", "s1", "s2"]);
  });
});

describe("neighbours", () => {
  const ids = ["s3", "s1", "s2"];

  it("finds the pupil either side, one-based for display", () => {
    expect(neighbours(ids, "s1")).toEqual({
      previousId: "s3",
      nextId: "s2",
      index: 2,
      total: 3,
    });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(neighbours(ids, "s3")).toMatchObject({ previousId: null, nextId: "s1", index: 1 });
    expect(neighbours(ids, "s2")).toMatchObject({ previousId: "s1", nextId: null, index: 3 });
  });

  // A pupil reached from a seat on the plan, or from a link with no params,
  // is walking no list. Drawing arrows there would invent one.
  it("has nothing to say about a pupil outside the list", () => {
    expect(neighbours(ids, "ghost")).toBeNull();
    expect(neighbours([], "s1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/domain/student-list.test.ts`
Expected: FAIL — cannot find module `./student-list`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/student-list.ts`:

```ts
/**
 * The ordered set of pupils a list page is showing, reconstructed from its URL.
 *
 * The pupil page's `‹ ›` arrows walk the list the teacher arrived from, and a
 * page navigation cannot carry an array — so the params describe the list and
 * this module rebuilds it. `compareStudents` is handed to the tables as their
 * `sortingFn` as well, which is what stops the arrows walking a different
 * order from the rows on screen.
 */

import { filterByGroup } from "./group";
import { fuzzyMatchAny } from "./search";
import { type ColumnSort, sortingFromParams } from "./table-sort";

/** The columns a `?sort=` may name. Both list pages offer exactly these. */
export const STUDENT_SORT_COLUMNS = ["lastName", "firstName", "classLabel"];

export interface StudentListParams {
  q?: string;
  classe?: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}

/**
 * `classLabel` is carried ON the row rather than looked up, so that Classe
 * sorts and the search reaches it — the same reason `/students` does it.
 */
export interface ListStudent {
  id: string;
  lastName: string;
  firstName: string;
  classId: string;
  classLabel: string;
}

/**
 * Fixed to `fr` rather than the interface language, and deliberately.
 *
 * A roster's order must not change when a teacher switches the app to English:
 * the order is a property of the list, not of the labels around it. `base`
 * sensitivity makes "Élan" sort where a French reader looks for it, which the
 * default code-point comparison does not.
 */
const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function field(student: ListStudent, id: string): string {
  if (id === "firstName") return student.firstName;
  if (id === "classLabel") return student.classLabel;
  return student.lastName;
}

/**
 * The comparator both the arrows and the tables use.
 *
 * Ties break on the surname, so two pupils with one first name have a stable
 * order — without it, the sequence the arrows walk could differ from the rows
 * rendered, on nothing more than the input order.
 */
export function compareStudents(a: ListStudent, b: ListStudent, sorting: ColumnSort[]): number {
  const first = sorting[0];
  if (first) {
    const result = collator.compare(field(a, first.id), field(b, first.id));
    if (result !== 0) return first.desc ? -result : result;
  }
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
}

/**
 * The pupil ids a list page shows, in the order it shows them.
 *
 * Every param resolves or is ignored: an unknown class, an unknown group and a
 * sort naming a column that no longer exists each fall back rather than
 * emptying the list or sorting by a phantom. That is the rule `?classe`
 * already follows for a deleted class.
 */
export function studentSequence(
  students: ListStudent[],
  memberships: { groupId: string; studentId: string }[],
  params: StudentListParams,
): string[] {
  let visible = students;

  if (params.classe !== undefined && students.some((s) => s.classId === params.classe)) {
    visible = visible.filter((student) => student.classId === params.classe);
  }

  if (params.groupe !== undefined && memberships.some((m) => m.groupId === params.groupe)) {
    visible = filterByGroup(visible, memberships, params.groupe);
  }

  const query = params.q?.trim();
  if (query) {
    visible = visible.filter((student) =>
      fuzzyMatchAny([student.lastName, student.firstName, student.classLabel], query),
    );
  }

  const sorting = sortingFromParams(params.sort, params.dir, STUDENT_SORT_COLUMNS);
  return [...visible].sort((a, b) => compareStudents(a, b, sorting)).map((student) => student.id);
}

export interface StudentNeighbours {
  previousId: string | null;
  nextId: string | null;
  /** One-based, for "8 / 28". */
  index: number;
  total: number;
}

/**
 * Null for a pupil the list does not contain — reached from a seat on the
 * plan, or from a bare link. Drawing arrows there would invent a list.
 */
export function neighbours(ids: string[], studentId: string): StudentNeighbours | null {
  const at = ids.indexOf(studentId);
  if (at === -1) return null;

  return {
    previousId: at === 0 ? null : ids[at - 1],
    nextId: at === ids.length - 1 ? null : ids[at + 1],
    index: at + 1,
    total: ids.length,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/domain/student-list.test.ts`
Expected: PASS, 17 tests.

If the accent test fails, check `fuzzyMatchAny`'s behaviour in `src/domain/search.ts` and keep the collator as written — the collator, not the search, owns ordering.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/student-list.ts src/domain/student-list.test.ts
git commit -m "feat(domain): the list a pupil page walks is rebuilt from its URL

A page navigation cannot carry an array, so the params describe the list and
\`studentSequence\` rebuilds it — class, group, query and sort, each resolving
or being ignored the way ?classe already is for a deleted class.
\`compareStudents\` is exported because the tables will be given it as their
sortingFn: an order computed twice by two comparators is an order that
eventually disagrees with itself, and the arrows would then walk rows the
teacher never saw.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 5: The list context reaches the pupil page

Routes gain params, the roster's filter and sort move into its URL, and both list pages hand their params to the links they draw.

**Files:**
- Modify: `src/router.ts:38` (`ClassStudents`), `:46` (`Student`)
- Modify: `src/app.tsx` (the `ClassStudents` and `Student` cases, and both type lists)
- Modify: `src/modules/class/students-page.tsx`
- Modify: `src/modules/students/page.tsx`
- Modify: `src/modules/plan/components/student-card.tsx`
- Modify: `src/modules/student/page.tsx` (accept the new props; the page body is rewritten in Task 6)

**Interfaces:**
- Consumes: `StudentListParams`, `STUDENT_SORT_COLUMNS`, `compareStudents` from Task 4; `sortingFromParams` / `paramsFromSorting` from `@domain/table-sort`.
- Produces: `StudentPage` takes `{ studentId: string; q?: string; classe?: string; groupe?: string; sort?: string; dir?: string }`. `StudentCard` takes an optional `listParams?: StudentListParams`.

- [ ] **Step 1: Widen the two routes**

In `src/router.ts`, replace the two route lines:

```ts
    ClassStudents: "/classes/:classId/eleves?:groupe&:sort&:dir",
```

```ts
    // The params describe the LIST the `‹ ›` arrows walk, never the pupil.
    // A page navigation cannot carry an array, so the URL carries the
    // description and `studentSequence` rebuilds the order.
    Student: "/students/:studentId?:q&:classe&:groupe&:sort&:dir",
```

- [ ] **Step 2: Pass them through in `src/app.tsx`**

```tsx
    case "ClassStudents":
      return (
        <ClassStudentsPage
          classId={route.params.classId}
          groupe={route.params.groupe}
          sort={route.params.sort}
          dir={route.params.dir}
        />
      );
```

```tsx
    case "Student":
      return (
        <StudentPage
          studentId={route.params.studentId}
          q={route.params.q}
          classe={route.params.classe}
          groupe={route.params.groupe}
          sort={route.params.sort}
          dir={route.params.dir}
        />
      );
```

- [ ] **Step 3: Move the roster's filter and sort into its URL**

In `src/modules/class/students-page.tsx`:

Change the signature and delete the `selectedGroupId` state:

```tsx
export function ClassStudentsPage({
  classId,
  groupe,
  sort,
  dir,
}: {
  classId: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}) {
```

Delete this line:

```tsx
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
```

After the `membershipsList` declaration, add:

```tsx
  // Every param this page owns, written in one place. A handler naming only
  // the param it changes silently clears the others — the bug `/students`
  // already had to fix by centralising its four.
  const sorting = sortingFromParams(sort, dir, STUDENT_SORT_COLUMNS);
  const selectedGroupId = resolveGroupSelection(groupsList, groupe ?? null);
  const replaceParams = (next: { groupe?: string | null; sorting?: ColumnSort[] }) =>
    Router.replace("ClassStudents", {
      classId,
      groupe: (next.groupe === undefined ? selectedGroupId : next.groupe) ?? undefined,
      ...paramsFromSorting(next.sorting ?? sorting),
    });
```

Add the imports:

```tsx
import { filterByGroup, groupsForStudent, resolveGroupSelection } from "@domain/group";
import { STUDENT_SORT_COLUMNS, compareStudents } from "@domain/student-list";
import { type ColumnSort, paramsFromSorting, sortingFromParams } from "@domain/table-sort";
```

Wire the filter and the table:

```tsx
        <GroupFilter
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelect={(groupId) => replaceParams({ groupe: groupId })}
        />
```

```tsx
      <DataTable
        columns={columns as ColumnDef<Student, unknown>[]}
        data={visibleStudents}
        getRowId={(student) => student.id}
        globalSearchFields={["lastName", "firstName"]}
        emptyMessage={t("class.noStudents")}
        sorting={sorting}
        onSortingChange={(next) => replaceParams({ sorting: next })}
      />
```

And in the group delete's `onConfirm`, replace `setSelectedGroupId(null)`:

```tsx
                      onConfirm={async () => {
                        await deleteGroup(db, group.id);
                        if (selectedGroupId === group.id) replaceParams({ groupe: null });
                      }}
```

Give the two sortable columns the shared comparator so the rows and the arrows cannot disagree. In the `columns` memo, add to the `lastName` and `firstName` accessors:

```tsx
        sortingFn: (a, b, columnId) =>
          compareStudents(
            { ...a.original, classLabel: "" },
            { ...b.original, classLabel: "" },
            [{ id: columnId, desc: false }],
          ),
```

- [ ] **Step 4: Hand the list params to the roster's links**

The roster's surname cell opens the `StudentCard`, and the card is what links to the pupil page. Give the card the params.

In `src/modules/plan/components/student-card.tsx`, add to the props:

```tsx
  /**
   * The list the pupil page's `‹ ›` arrows should walk, when this card was
   * opened from one. Absent on the seating plan, which is not a list.
   */
  listParams?: StudentListParams;
```

and use it in the existing link:

```tsx
            <Link
              to={Router.Student({ studentId: student.id, ...listParams })}
              className="text-accent text-sm"
            >
```

Import the type: `import type { StudentListParams } from "@domain/student-list";`

Then in `students-page.tsx`, pass it:

```tsx
        <StudentCard
          key={cardStudent.id}
          student={cardStudent}
          session={null}
          listParams={{
            classe: classId,
            groupe: selectedGroupId ?? undefined,
            ...paramsFromSorting(sorting),
          }}
          onClose={() => setCardStudentId(null)}
        />
```

- [ ] **Step 5: Hand the list params to `/students`**

In `src/modules/students/page.tsx`, replace the local `SORTABLE_COLUMNS` constant with the shared one (`import { STUDENT_SORT_COLUMNS, compareStudents } from "@domain/student-list";`, then use `STUDENT_SORT_COLUMNS` in the `sortingFromParams` call and delete the local array).

Add a value carrying the params, after `sorting` is computed:

```tsx
  // What the pupil page needs to rebuild this exact list for its arrows.
  const listParams = {
    q: q || undefined,
    classe: selectedClassId ?? undefined,
    ...paramsFromSorting(sorting),
  };
```

Use it in the surname cell's `Link` and in `onRowClick`. The cell is inside a `useMemo` over `[t]`, so add `listParams` to its dependency array — or, simpler and with no memo churn, read it through a ref-free closure by moving the `columns` memo below `listParams` and listing it:

```tsx
        cell: (info) => (
          <Link
            to={Router.Student({ studentId: info.row.original.id, ...listParams })}
            className="font-medium hover:underline"
          >
            <PupilName student={info.row.original} format="surname" />
          </Link>
        ),
```

```tsx
        onRowClick={(student) => Router.push("Student", { studentId: student.id, ...listParams })}
```

Give the three columns the shared comparator, exactly as on the roster:

```tsx
        sortingFn: (a, b, columnId) =>
          compareStudents(a.original, b.original, [{ id: columnId, desc: false }]),
```

- [ ] **Step 6: Accept the props on the pupil page**

In `src/modules/student/page.tsx`, widen the signature only — the body is rewritten in Task 6:

```tsx
export function StudentPage({
  studentId,
}: {
  studentId: string;
  q?: string;
  classe?: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}) {
```

- [ ] **Step 7: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 8: Verify in a browser**

Run `yarn dev`. On `/students`, type a query and click a column header; confirm the URL grows `?q=…&sort=…&dir=…`. Click a pupil and confirm those params ride onto `/students/<id>?…`. Press Back and confirm the query and sort are still there. On a class roster with at least two groups, pick a group and sort a column; confirm the URL becomes `/classes/<id>/eleves?groupe=…&sort=…&dir=…`, reload, and confirm both survive.

- [ ] **Step 9: Commit**

```bash
git add src/router.ts src/app.tsx src/modules/class/students-page.tsx src/modules/students/page.tsx src/modules/plan/components/student-card.tsx src/modules/student/page.tsx
git commit -m "feat(students): a pupil URL carries the list it was opened from

The pupil page's arrows walk the list the teacher arrived from, so the list
has to be describable in a URL. Both list pages now hand their params to the
links they draw, and the class roster's group filter and sort move out of
React state into its own URL — it was the one list page not following the
rule the others do, and a pupil opened from a filtered roster had no list to
rebuild. Both tables are given \`compareStudents\` as their sortingFn so the
rows and the arrows cannot order the same pupils differently.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 6: The pupil page shell and its header

The page becomes an orchestrator: it loads the pupil, their class, their carnets, their séances and their records once, and hands them down. The header is the first block on it.

**Files:**
- Create: `src/modules/student/components/student-header.tsx`
- Modify: `src/modules/student/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `neighbours`, `studentSequence`, `ListStudent` (Task 4); `PhotoInput`, `PupilName`, `ConfirmButton`; `setStudentNotes`, `setStudentPhoto` from `@db/students`; `deleteStudent` from `@db/cascade`; `StudentForm` from `../class/components/student-form`.
- Produces: `StudentHeader({ student, schoolClass, listParams, neighbours, studentCount })`.

- [ ] **Step 1: Add the i18n keys**

Add to `src/i18n/locales/fr.json` under `student`:

```json
    "previous": "Élève précédent",
    "next": "Élève suivant",
    "position": "{{index}} / {{total}}",
    "confirmDelete": "Supprimer cet élève ?",
    "confirmDeleteBody": "Ses notes, sa présence, son comportement et sa place sont supprimés avec lui. Cette action est définitive.",
    "noCarnets": "Aucun carnet dans cette classe.",
```

and the same keys in `src/i18n/locales/en.json`:

```json
    "previous": "Previous pupil",
    "next": "Next pupil",
    "position": "{{index}} / {{total}}",
    "confirmDelete": "Delete this pupil?",
    "confirmDeleteBody": "Their marks, attendance, behaviour and seat are deleted with them. This cannot be undone.",
    "noCarnets": "No gradebook in this class.",
```

- [ ] **Step 2: Run the parity test to verify it passes**

Run: `yarn test src/i18n/locales/locales.test.ts`
Expected: PASS. If it fails, a key is in one file and not the other.

- [ ] **Step 3: Write the header component**

Create `src/modules/student/components/student-header.tsx`:

```tsx
import type { SchoolClass, Student } from "@db";
import { deleteStudent } from "@db/cascade";
import { useDb } from "@db/provider";
import { setStudentNotes, setStudentPhoto } from "@db/students";
import type { StudentListParams, StudentNeighbours } from "@domain/student-list";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { PhotoInput } from "../../design-system/components/photo-input";
import { PupilName } from "../../design-system/components/pupil-name";
import { StudentForm } from "../../class/components/student-form";

/**
 * Who this child is, and everything about the person rather than the record.
 *
 * The notes field sits open rather than behind a disclosure. It holds
 * accommodations — PAP, PPRE, tiers-temps — and an accommodation is the thing
 * that should change how every figure below it is read; a note consulted often
 * behind a triangle is a note nobody opens. The cost, that a conseil de classe
 * is a room with colleagues in it, is accepted in the design.
 *
 * The arrows are drawn only when this pupil is actually in a list. Reached from
 * a seat on the plan there is none, and drawing them would invent one.
 */
export function StudentHeader({
  student,
  schoolClass,
  studentCount,
  listParams,
  position,
}: {
  student: Student;
  schoolClass: SchoolClass | null;
  studentCount: number;
  listParams: StudentListParams;
  position: StudentNeighbours | null;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(student.notes ?? "");
  // Another surface can write these notes while this page is open — the card,
  // from a seat — and dexie-react-hooks keeps both live. Re-sync from the row
  // unless the teacher is typing here, or an incoming update stomps the draft.
  const notesFocused = useRef(false);
  useEffect(() => {
    if (!notesFocused.current) setNotes(student.notes ?? "");
  }, [student.notes]);

  const go = (studentId: string | null): void => {
    if (studentId === null) return;
    Router.push("Student", { studentId, ...listParams });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PhotoInput
            value={student.photo}
            onChange={(photo) => void setStudentPhoto(db, student.id, photo ?? null)}
          />
          <div className="flex min-w-0 flex-col">
            <span className="break-words font-semibold text-lg">
              <PupilName student={student} />
            </span>
            {schoolClass && (
              <Link to={Router.Class({ classId: schoolClass.id })} className="text-accent text-sm">
                {schoolClass.name}
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {position && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn"
                aria-label={t("student.previous")}
                disabled={position.previousId === null}
                onClick={() => go(position.previousId)}
              >
                ‹
              </button>
              <span className="text-sm text-text-muted tabular-nums">
                {t("student.position", { index: position.index, total: position.total })}
              </span>
              <button
                type="button"
                className="btn"
                aria-label={t("student.next")}
                disabled={position.nextId === null}
                onClick={() => go(position.nextId)}
              >
                ›
              </button>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
          <ConfirmButton
            danger
            label={t("common.delete")}
            confirmLabel={t("student.confirmDelete")}
            body={t("student.confirmDeleteBody")}
            onConfirm={async () => {
              const classId = student.classId;
              await deleteStudent(db, student.id);
              // A page cannot stay on a pupil who no longer exists, and this
              // is not a destination to come back to — `replace`, so Back does
              // not return to a dead URL.
              Router.replace("ClassStudents", { classId });
            }}
          />
        </div>
      </div>

      {editing && (
        // Keyed by the pupil: react-hook-form captures defaultValues at mount,
        // so without it stepping to the next pupil with the form open would
        // write one child's name onto another.
        <StudentForm
          key={student.id}
          classId={student.classId}
          student={student}
          studentCount={studentCount}
          onDone={() => setEditing(false)}
        />
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea
          className="field"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onFocus={() => {
            notesFocused.current = true;
          }}
          onBlur={() => {
            notesFocused.current = false;
            if (notes !== (student.notes ?? "")) void setStudentNotes(db, student.id, notes);
          }}
        />
        <span className="text-text-faint text-xs">{t("student.notesHint")}</span>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the page as an orchestrator**

Replace the whole of `src/modules/student/page.tsx` with:

```tsx
import { useDb } from "@db/provider";
import { sessionsForClass } from "@db/sessions";
import { neighbours, studentSequence } from "@domain/student-list";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { StudentHeader } from "./components/student-header";

/**
 * One pupil, across time.
 *
 * Every other surface in this app is class-major (the grid, the roster) or
 * séance-major (the card, the register). This is the transpose: one child, every
 * carnet, every lesson — the shape a conseil de classe needs, which is the
 * moment this page is built for.
 *
 * The page loads everything ONCE and hands it down, the way `ClassPage` does:
 * a child that re-queried would flash "Chargement…" over a pupil already on
 * screen every time a mark was committed.
 */
export function StudentPage({
  studentId,
  q,
  classe,
  groupe,
  sort,
  dir,
}: {
  studentId: string;
  q?: string;
  classe?: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const listParams = { q, classe, groupe, sort, dir };

  // An explicit null distinguishes "no such pupil" from "still loading":
  // useLiveQuery gives undefined for both, and the page would otherwise sit on
  // "Chargement…" forever for a pupil who has been deleted.
  const student = useLiveQuery(
    async () => (await db.students.get(studentId)) ?? null,
    [db, studentId],
  );

  const schoolClass = useLiveQuery(
    async () => (student ? ((await db.classes.get(student.classId)) ?? null) : null),
    [db, student],
  );

  const sessions = useLiveQuery(
    async () => (student ? await sessionsForClass(db, student.classId) : []),
    [db, student],
  );

  const classmates = useLiveQuery(
    async () => (student ? await db.students.where("classId").equals(student.classId).toArray() : []),
    [db, student],
  );

  // The set the arrows walk. `classe` may name another class entirely — a
  // teacher stepping through an unfiltered /students — so the candidates are
  // every pupil in the workspace, narrowed by the params rather than by this
  // pupil's class.
  const sequence = useLiveQuery(async () => {
    const [students, classes] = await Promise.all([
      db.students.orderBy("lastName").toArray(),
      db.classes.toArray(),
    ]);
    const names = new Map(classes.map((c) => [c.id, c.name]));
    const memberships = groupe === undefined ? [] : await db.groupMembers.toArray();
    return studentSequence(
      students.map((s) => ({ ...s, classLabel: names.get(s.classId) ?? "" })),
      memberships,
      { q, classe, groupe, sort, dir },
    );
  }, [db, q, classe, groupe, sort, dir]);

  if (
    student === undefined ||
    sessions === undefined ||
    classmates === undefined ||
    sequence === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (student === null) return <p className="text-text-muted">{t("student.notFound")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <StudentHeader
        student={student}
        schoolClass={schoolClass ?? null}
        studentCount={classmates.length}
        listParams={listParams}
        position={neighbours(sequence, student.id)}
      />
    </div>
  );
}
```

`sessions` is unused for one task; Task 8 consumes it. Biome will not complain about an unused local that is a hook result assigned to a `const` read by the loading guard — it is read there.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Verify in a browser**

Run `yarn dev`. From `/students`, sort by Prénom and open a pupil: the header shows the photo, the name surname-first in capitals, the class link, `‹ 3 / 360 ›` and the two buttons. Step forward and back and confirm the pupil changes and the params stay in the URL. Press Back four times and confirm it walks back through the pupils. Open a pupil from a seat on a class's plan (via the card's link) and confirm no arrows are drawn. Type in the notes field, click away, reload, and confirm it persisted. Open Modifier, change the first name, save. Finally delete a pupil you do not need and confirm the page lands on the class roster.

- [ ] **Step 7: Commit**

```bash
git add src/modules/student/page.tsx src/modules/student/components/student-header.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(student): the pupil page becomes a page about a pupil

It loads the pupil, their class, their classmates and their séances once and
hands them down, the way the class page does — a child that re-queried would
flash Chargement over a pupil already on screen on every commit. The header
carries the arrows through the list the teacher arrived from, drawn only when
this pupil is actually in one, and the notes field sits open because an
accommodation is what should change how everything below it is read.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 7: The carnets sections and the position bar

**Files:**
- Create: `src/modules/design-system/components/position-bar.tsx`
- Create: `src/modules/student/components/carnet-section.tsx`
- Modify: `src/modules/student/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `positionOnScale`, `lastMarkedPeriod` (Tasks 2–3); `studentAverage`, `classStats`, `AverageColumn`, `AverageGrade` from `@domain/gradebook/average`; `writeGrade` (Task 1), `setGradeNote`; `EditableCell`; `evaluateCalculation` from `@domain/gradebook/calculation`; `formatDecimal` from `@domain/gradebook/decimal`.
- Produces: `PositionBar({ position, valueLabel, description })`, `CarnetSection({ gradebook, subject, student })`.

- [ ] **Step 1: Add the i18n keys**

`fr.json`, under `student`:

```json
    "classAverage": "classe {{value}}",
    "positionDescription": "{{value}} sur une échelle de {{min}} à {{max}}, moyenne de la classe {{mean}}",
    "coefficient": "coef {{value}}",
    "noMark": "—",
```

`en.json`:

```json
    "classAverage": "class {{value}}",
    "positionDescription": "{{value}} on a scale from {{min}} to {{max}}, class average {{mean}}",
    "coefficient": "weight {{value}}",
    "noMark": "—",
```

- [ ] **Step 2: Write the position bar**

Create `src/modules/design-system/components/position-bar.tsx`:

```tsx
/**
 * Where one average sits in the class's spread.
 *
 * The first chart in this app, and hand-written inline SVG because it has to
 * be: a chart library from a CDN would break the no-network promise as surely
 * as an analytics call.
 *
 * It is never the only way to read the figures. `description` states the same
 * numbers in words and is what a screen reader gets; the bar is `aria-hidden`
 * decoration over it. Same rule the rubric levels follow — a label and a
 * colour, never a colour alone.
 */
export function PositionBar({
  fraction,
  meanFraction,
  minLabel,
  maxLabel,
  description,
}: {
  fraction: number;
  meanFraction: number;
  minLabel: string;
  maxLabel: string;
  description: string;
}) {
  const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="text-text-faint text-xs tabular-nums">{minLabel}</span>
        <svg
          className="h-3 flex-1"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          role="presentation"
        >
          <title>{description}</title>
          <line x1="0" y1="6" x2="100" y2="6" className="stroke-border" strokeWidth="2" />
          <line
            x1={meanFraction * 100}
            y1="1"
            x2={meanFraction * 100}
            y2="11"
            className="stroke-text-muted"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={fraction * 100} cy="6" r="5" className="fill-accent" />
        </svg>
        <span className="text-text-faint text-xs tabular-nums">{maxLabel}</span>
      </div>
      <span className="sr-only">{description}</span>
      <span className="sr-only">{pct(fraction)}</span>
    </div>
  );
}
```

- [ ] **Step 3: Write the carnet section**

Create `src/modules/student/components/carnet-section.tsx`:

```tsx
import type { Gradebook, Student, Subject } from "@db";
import { setGradeNote, writeGrade } from "@db/grades";
import { useDb } from "@db/provider";
import {
  type AverageColumn,
  type AverageGrade,
  classStats,
  studentAverage,
} from "@domain/gradebook/average";
import { evaluateCalculation } from "@domain/gradebook/calculation";
import { formatDecimal } from "@domain/gradebook/decimal";
import { lastMarkedPeriod, positionOnScale } from "@domain/student-summary";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EditableCell } from "../../design-system/components/editable-cell";
import { PositionBar } from "../../design-system/components/position-bar";
import { ToggleGroup, ToggleOption } from "../../design-system/components/primitives";

/**
 * One carnet, for one pupil.
 *
 * The period tabs are THIS carnet's own periods. Nothing on this page claims
 * that Maths Écrit's Trimestre 1 and Musique's Semestre 1 are the same span of
 * weeks, because nothing puts them under one control — a `Period` carries no
 * dates, so any such claim would be invented.
 *
 * Rows dispatch on `column.type` rather than assuming a numeric input. That is
 * what lets a `rubric` column arrive as one more case here instead of a new
 * section on this page.
 */
export function CarnetSection({
  gradebook,
  subject,
  student,
}: {
  gradebook: Gradebook;
  subject: Subject | undefined;
  student: Student;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  // Held as a period id, never an index: the tabs re-render whenever a mark is
  // committed, and an index would follow a period that moved.
  const [periodId, setPeriodId] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const [periods, columns, grades, classmates] = await Promise.all([
      db.periods.where("gradebookId").equals(gradebook.id).sortBy("order"),
      db.columns.where("gradebookId").equals(gradebook.id).sortBy("order"),
      db.grades.where("gradebookId").equals(gradebook.id).toArray(),
      db.students.where("classId").equals(gradebook.classId).toArray(),
    ]);
    return { periods, columns, grades, classmates };
  }, [db, gradebook.id, gradebook.classId]);

  if (!data) return null;

  const { periods, columns, grades, classmates } = data;
  const gradedColumnIds = grades.filter((g) => g.value !== undefined).map((g) => g.columnId);
  const activePeriodId =
    periodId !== null && periods.some((p) => p.id === periodId)
      ? periodId
      : lastMarkedPeriod(periods, columns, gradedColumnIds);

  const averageColumns: AverageColumn[] = columns.map((c) => ({
    id: c.id,
    type: c.type,
    weight: c.weight,
    max: c.max,
    periodId: c.periodId,
  }));

  // `studentAverage` takes the FULL column list plus a periodId and filters
  // internally: pre-filtering changes results silently, because the weights it
  // normalises against would come from a smaller set.
  const byStudent = new Map<string, AverageGrade[]>();
  for (const grade of grades) {
    if (grade.value === undefined) continue;
    const list = byStudent.get(grade.studentId) ?? [];
    list.push({ columnId: grade.columnId, value: grade.value });
    byStudent.set(grade.studentId, list);
  }

  const mine = studentAverage(byStudent.get(student.id) ?? [], averageColumns, activePeriodId ?? undefined);
  const classValues = classmates
    .map((mate) => studentAverage(byStudent.get(mate.id) ?? [], averageColumns, activePeriodId ?? undefined))
    .filter((value): value is number => value !== null);
  const stats = classStats(classValues);
  const position = mine === null ? null : positionOnScale(mine, classValues);

  const periodColumns = columns.filter((column) => column.periodId === activePeriodId);
  const gradeFor = (columnId: string) =>
    grades.find((g) => g.columnId === columnId && g.studentId === student.id);

  const decimal = (value: number): string => formatDecimal(value, i18n.language);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium">
          {subject && (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: subject.color }}
            />
          )}
          {gradebook.name}
        </h3>
        <span className="font-semibold tabular-nums">
          {mine === null ? t("student.noMark") : decimal(mine)}
          {stats && (
            <span className="ml-2 font-normal text-sm text-text-muted">
              {t("student.classAverage", { value: decimal(stats.mean) })}
            </span>
          )}
        </span>
      </div>

      {periods.length > 1 && (
        <ToggleGroup label={t("gradebook.period")}>
          {periods.map((period) => (
            <ToggleOption
              key={period.id}
              selected={period.id === activePeriodId}
              onSelect={() => setPeriodId(period.id)}
            >
              {period.name}
            </ToggleOption>
          ))}
        </ToggleGroup>
      )}

      {position && mine !== null && stats && (
        <PositionBar
          fraction={position.fraction}
          meanFraction={position.meanFraction}
          minLabel={decimal(position.min)}
          maxLabel={decimal(position.max)}
          description={t("student.positionDescription", {
            value: decimal(mine),
            min: decimal(position.min),
            max: decimal(position.max),
            mean: decimal(position.mean),
          })}
        />
      )}

      <ul className="flex flex-col gap-1">
        {periodColumns.map((column) => {
          const grade = gradeFor(column.id);
          const isCalculation = column.type === "calculation";
          // `evaluateCalculation(spec, sources, grades)` — the spec off the
          // column, and every numeric column of the carnet as the sources,
          // exactly as the grid builds them.
          const computed =
            isCalculation && column.calculation
              ? evaluateCalculation(
                  column.calculation,
                  columns.map((c) => ({ id: c.id, max: c.max, weight: c.weight })),
                  byStudent.get(student.id) ?? [],
                )
              : null;

          return (
            <li
              key={column.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className="break-words font-medium text-sm">{column.label}</span>
                <span className="text-text-faint text-xs">
                  {t("student.coefficient", { value: column.weight })}
                </span>
              </span>
              <EditableCell
                type={column.type}
                max={column.max}
                value={
                  isCalculation
                    ? computed === null
                      ? undefined
                      : { type: "numeric", value: computed }
                    : grade?.value
                }
                note={isCalculation ? undefined : grade?.note}
                // A calculation stores nothing: EditableCell renders the type
                // read-only, so neither callback can be reached.
                onChange={(next) =>
                  isCalculation
                    ? Promise.resolve()
                    : writeGrade(db, gradebook.id, column.id, student.id, next)
                }
                onNoteChange={(next) =>
                  isCalculation
                    ? Promise.resolve()
                    : setGradeNote(db, gradebook.id, column.id, student.id, next)
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Mount the sections on the page**

In `src/modules/student/page.tsx`, add the queries and render them after the header:

```tsx
  const carnets = useLiveQuery(async () => {
    if (!student) return [];
    const gradebooks = await db.gradebooks.where("classId").equals(student.classId).toArray();
    const subjects = await db.subjects.toArray();
    return gradebooks.map((gradebook) => ({
      gradebook,
      subject: subjects.find((s) => s.id === gradebook.subjectId),
    }));
  }, [db, student]);
```

Add `carnets === undefined` to the loading guard, then:

```tsx
      {carnets.length === 0 ? (
        <p className="text-sm text-text-faint">{t("student.noCarnets")}</p>
      ) : (
        carnets.map(({ gradebook, subject }) => (
          <CarnetSection
            key={gradebook.id}
            gradebook={gradebook}
            subject={subject}
            student={student}
          />
        ))
      )}
```

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Verify in a browser**

Run `yarn dev` and open a pupil in the demo school (which seeds sixteen classes and one carnet each). Confirm: the section opens on the last period holding a mark; switching period tabs changes the average, the class mean and the bar together; the dot sits where the number says it should; typing a mark and pressing Enter updates the average and the bar without a reload; clearing a mark leaves an existing note in place; a `calculation` column renders read-only. Then check a class with one pupil marked — the bar must be absent, not flat.

- [ ] **Step 7: Commit**

```bash
git add src/modules/design-system/components/position-bar.tsx src/modules/student/components/carnet-section.tsx src/modules/student/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(student): a carnet, its period, and where this pupil sits in it

Each carnet section carries its OWN period tabs — nothing claims that one
carnet's Trimestre 1 and another's Semestre 1 are the same weeks, because a
Period carries no dates and any such claim would be invented. The position
bar is the app's first chart: hand-written inline SVG, since a chart library
from a CDN would break the no-network promise, with the same figures in text
beside it and nothing drawn at all for a class of one. Rows dispatch on
column type, so a rubric column lands as one more case rather than a new
section.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 8: The Présence block

**Files:**
- Create: `src/modules/student/components/presence-block.tsx`
- Modify: `src/modules/student/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `attendanceSummary`, `groupSeancesByMonth`, `defaultOpenMonth` (Tasks 2–3); `toggleAttendance` from `@db/attendance`; `attendanceKey` from `@db`; `ATTENDANCE_VALUES`.
- Produces: `PresenceBlock({ student, sessions })`.

- [ ] **Step 1: Add the i18n keys**

`fr.json`, under `attendance`:

```json
    "initial": {
      "present": "P",
      "absent": "A",
      "late": "R",
      "excused": "E"
    },
    "notMarked": "non marqué",
```

`en.json`, under `attendance` — note `late` is **L**, which is why this is a key and never `value[0]`:

```json
    "initial": {
      "present": "P",
      "absent": "A",
      "late": "L",
      "excused": "E"
    },
    "notMarked": "not recorded",
```

`fr.json`, under `student`:

```json
    "assiduity": "Assiduité",
    "assiduityDetail": "$t(student.markedSeances, {\"count\": {{marked}} }) — $t(student.unjustified, {\"count\": {{unjustified}} })",
    "markedSeances_one": "{{count}} séance marquée",
    "markedSeances_other": "{{count}} séances marquées",
    "unjustified_one": "{{count}} absence non justifiée",
    "unjustified_other": "{{count}} absences non justifiées",
    "noSeances": "Aucune séance enregistrée pour cette classe.",
    "monthSeances_one": "{{count}} séance",
    "monthSeances_other": "{{count}} séances",
```

`en.json`:

```json
    "assiduity": "Attendance",
    "assiduityDetail": "$t(student.markedSeances, {\"count\": {{marked}} }) — $t(student.unjustified, {\"count\": {{unjustified}} })",
    "markedSeances_one": "{{count}} lesson recorded",
    "markedSeances_other": "{{count}} lessons recorded",
    "unjustified_one": "{{count}} unexcused absence",
    "unjustified_other": "{{count}} unexcused absences",
    "noSeances": "No lesson recorded for this class.",
    "monthSeances_one": "{{count}} lesson",
    "monthSeances_other": "{{count}} lessons"
```

If i18next's nesting syntax above proves fiddly, drop `assiduityDetail` and compose the two `$t` calls in the component with two `t()` calls joined by `" — "`. Do not invent a third phrasing.

- [ ] **Step 2: Write the block**

Create `src/modules/student/components/presence-block.tsx`:

```tsx
import { attendanceKey, type Session, type Student } from "@db";
import { toggleAttendance } from "@db/attendance";
import { useDb } from "@db/provider";
import { ATTENDANCE_VALUES, type AttendanceValue } from "@domain/attendance";
import {
  attendanceSummary,
  defaultOpenMonth,
  groupSeancesByMonth,
} from "@domain/student-summary";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * This pupil's attendance, lesson by lesson, editable in place.
 *
 * The séance IS the row: its date and hour are on screen, so the edit lands on
 * the lesson the teacher is pointing at. That is what makes this not the
 * "second, inline path" the invariant forbids — the register on a roster row
 * left the séance implicit, and a teacher could not see which lesson they were
 * marking.
 *
 * **No séance is ever created here.** Only lessons that already have a row can
 * be marked, so a page opened in December to read about September cannot file a
 * lesson nobody taught.
 *
 * A lesson nobody marked draws as a row with nothing pressed. `attendance.ts`
 * defines no default precisely so that reads as *not recorded* rather than as
 * *present*.
 */
export function PresenceBlock({ student, sessions }: { student: Student; sessions: Session[] }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const records = useLiveQuery(
    () => db.attendance.where({ studentId: student.id }).toArray(),
    [db, student.id],
  );

  const months = groupSeancesByMonth(sessions);
  // Held as a month key, never an index: the list regroups whenever a séance is
  // added elsewhere, and an index would open a different month.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = openKey ?? defaultOpenMonth(months, Date.now());

  if (records === undefined) return null;

  const sessionIds = new Set(sessions.map((session) => session.id));
  // Only this class's lessons count. A pupil moved between classes keeps rows
  // pointing at their old class's séances, and those are not this record.
  const mine = records.filter((record) => sessionIds.has(record.sessionId));
  const summary = attendanceSummary(mine);
  const valueOf = new Map(mine.map((record) => [record.sessionId, record.value]));

  const dayFormatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" });
  const hour = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}h${String(minutes % 60).padStart(2, "0")}`;

  const set = async (sessionId: string, value: AttendanceValue): Promise<void> => {
    await toggleAttendance(db, sessionId, student.id, value);
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm text-text-muted">{t("student.assiduity")}</h3>

      {summary.rate !== null && (
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-lg tabular-nums">
            {new Intl.NumberFormat(i18n.language, {
              style: "percent",
              maximumFractionDigits: 1,
            }).format(summary.rate)}
          </span>
          <span className="text-sm text-text-muted">
            {`${t("student.markedSeances", { count: summary.marked })} — ${t("student.unjustified", { count: summary.unjustified })}`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_VALUES.map((value) => (
          <div
            key={value}
            className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>{t(`attendance.${value}`)}</span>
            <span className="font-semibold tabular-nums">{summary.counts[value]}</span>
          </div>
        ))}
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-text-faint">{t("student.noSeances")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {months.map((month) => {
            const isOpen = month.key === open;
            const label = monthFormatter.format(new Date(month.year, month.month, 1));
            return (
              <li key={month.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  className="btn w-full justify-between text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey(isOpen ? "" : month.key)}
                >
                  <span>{label}</span>
                  <span className="text-text-muted">
                    {t("student.monthSeances", { count: month.sessions.length })}
                  </span>
                </button>

                {isOpen && (
                  <ul className="flex flex-col gap-1">
                    {month.sessions.map((session) => {
                      const current = valueOf.get(session.id);
                      return (
                        <li
                          key={session.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1"
                        >
                          <span className="text-sm tabular-nums">
                            {dayFormatter.format(session.date)} · {hour(session.startsAt)}
                          </span>
                          <div className="flex gap-1">
                            {ATTENDANCE_VALUES.map((value) => {
                              const selected = current === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  // The initial is a translated key, never
                                  // value[0]: English "late" is L, not R. The
                                  // full word is the accessible name and the
                                  // tooltip, and the state is carried by a
                                  // border as well as a fill — never colour
                                  // alone.
                                  className={`h-11 w-11 rounded-md border font-semibold text-sm ${
                                    selected
                                      ? "border-accent bg-accent text-white"
                                      : "border-border bg-bg text-text"
                                  }`}
                                  aria-pressed={selected}
                                  aria-label={t(`attendance.${value}`)}
                                  title={t(`attendance.${value}`)}
                                  onClick={() => void set(session.id, value)}
                                >
                                  {t(`attendance.initial.${value}`)}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

Note `setOpenKey(isOpen ? "" : month.key)`: `""` is "the teacher closed it", distinct from `null`, which is "nothing chosen yet, use the default". Collapsing the default-open month must not silently re-open it.

`attendanceKey` is imported above but only needed if you add a direct read; drop the import if `yarn lint` flags it.

- [ ] **Step 3: Mount it on the page**

In `src/modules/student/page.tsx`, after the carnets:

```tsx
      <PresenceBlock student={student} sessions={sessions} />
```

- [ ] **Step 4: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 5: Verify in a browser**

Run `yarn dev`. On a pupil in the seeded demo school: confirm the current month is expanded and older months are collapsed with counts; mark an absence on a lesson three months back and watch the assiduité figure and the counts move without a reload; tap the same button again and confirm it clears and the figure moves back; confirm an excused absence does not lower the figure while an unmarked absence does; confirm a lesson nobody marked shows four unpressed buttons. At 375px in device emulation, confirm each row is one line and every button is 44px. Finally, on a pupil in a class with no séance at all, confirm the counts show and no percentage is printed.

- [ ] **Step 6: Commit**

```bash
git add src/modules/student/components/presence-block.tsx src/modules/student/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(student): attendance is corrected on the lesson it belongs to

The séance is the row — its date and its hour are on screen — so an edit here
lands on the lesson the teacher is pointing at, which is what the invariant
against a second inline path was protecting. No séance is ever created from
this page: only lessons that already have a row can be marked. The figure is
called assiduité and not présence, because its numerator counts présent, en
retard and excusé, and it is not printed at all when nothing was marked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 9: The Comportement block, and `behaviour-range` goes

**Files:**
- Create: `src/modules/student/components/behaviour-block.tsx`
- Modify: `src/modules/student/page.tsx`
- Delete: `src/domain/behaviour-range.ts`, `src/domain/behaviour-range.test.ts`
- Modify: `src/i18n/locales/fr.json`, `en.json` (remove `behaviour.range`, `behaviour.rangeLabel`)

**Interfaces:**
- Consumes: `BEHAVIOUR_TYPES`, `BEHAVIOUR_COLORS`, `countByType` from `@domain/behaviour`; `deleteBehaviourEvent` from `@db/cascade`.
- Produces: `BehaviourBlock({ student, sessions })`.

- [ ] **Step 1: Write the block**

Create `src/modules/student/components/behaviour-block.tsx`:

```tsx
import type { Session, Student } from "@db";
import { deleteBehaviourEvent } from "@db/cascade";
import { useDb } from "@db/provider";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "@domain/behaviour";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * The complete behaviour record, and a delete.
 *
 * There is no range control: the counts and the timeline both cover everything.
 * At a December conseil the whole year is the trimestre, and by June a teacher
 * reading a full-year record is reading what actually happened.
 *
 * There is no ADD, either. A `BehaviourEvent` is append-only and belongs to the
 * moment it was observed; a page cannot add an observation to a lesson it was
 * not in. Deleting stays the only correction, as it has always been.
 */
export function BehaviourBlock({ student, sessions }: { student: Student; sessions: Session[] }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const events = useLiveQuery(
    () => db.behaviourEvents.where({ studentId: student.id }).reverse().sortBy("createdAt"),
    [db, student.id],
  );

  if (events === undefined) return null;

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const counts = countByType(events);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm text-text-muted">{t("behaviour.title")}</h3>

      <div className="flex flex-wrap gap-2">
        {BEHAVIOUR_TYPES.map((type) => (
          <div
            key={type}
            className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: BEHAVIOUR_COLORS[type] }}
              />
              {t(`behaviour.${type}`)}
            </span>
            <span className="font-semibold tabular-nums">{counts[type]}</span>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <span className="text-sm text-text-faint">{t("behaviour.none")}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((event) => {
            const session = sessionById.get(event.sessionId);
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: BEHAVIOUR_COLORS[event.type] }}
                  />
                  <span className="break-words">
                    {t(`behaviour.${event.type}`)}
                    {session ? ` — ${dateFormatter.format(session.date)}` : ""}
                    {event.comment ? ` — ${event.comment}` : ""}
                  </span>
                </span>
                <ConfirmButton
                  // Keyed by event id: an armed delete must not survive onto a
                  // neighbour when the list reorders under it.
                  key={event.id}
                  variant="link"
                  danger
                  label={t("common.delete")}
                  confirmLabel={t("behaviour.confirmDelete")}
                  onConfirm={() => deleteBehaviourEvent(db, event.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Mount it and drop the old imports**

In `src/modules/student/page.tsx`, after the Présence block:

```tsx
      <BehaviourBlock student={student} sessions={sessions} />
```

- [ ] **Step 3: Delete the range module and its keys**

```bash
git rm src/domain/behaviour-range.ts src/domain/behaviour-range.test.ts
```

Remove `"rangeLabel"` and the whole `"range"` object from the `behaviour` block of **both** `src/i18n/locales/fr.json` and `src/i18n/locales/en.json`.

- [ ] **Step 4: Verify nothing still references it**

Run: `grep -rn "behaviour-range\|BEHAVIOUR_RANGES\|rangeStart\|withinRange\|behaviour.range" src`
Expected: no output.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green, and the locales parity test passes with the keys gone from both files.

- [ ] **Step 6: Verify in a browser**

Run `yarn dev`, open a pupil with behaviour events, confirm the four counts and the full timeline with dates, and delete one event through the confirm dialog. Confirm no range selector is anywhere on the page.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(student): the behaviour record is complete, and has no range control

The counts and the timeline both cover everything. At a December conseil the
whole year is the trimestre, and by June a full-year record is what a teacher
is actually reading — so \`behaviour-range.ts\` and its selector go, reversing
BACKLOG #5's delivered filter. Nothing of its discipline is lost: \`addDays\`
already walks the calendar the way \`rangeStart\` did. There is still no add
here: a BehaviourEvent belongs to the moment it was observed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

### Task 10: Record the rulings

The docs in this repo carry the arguments, not just the facts. A reader who does not find the reasoning here will re-litigate it.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Add a CLAUDE.md section**

Insert a new section after *The class is the page* and before *The schedule predicts; it never pre-creates*:

```markdown
### The pupil page is a synthesis, and the séance is the row

`/students/:studentId` is built for one moment: the **conseil de classe**. Every
other surface is class-major (the grid, the roster) or séance-major (the card,
the register); this is the transpose, and the app had no such screen. See
`docs/superpowers/specs/2026-09-09-profs-student-synthesis-design.md`.

**There is no trimestre selector, and there must not be one.** A mark filters by
a `Period`, which carries no dates and belongs to a carnet; an absence filters
by a date. No control governs both honestly. Each carnet section carries its
OWN period tabs, opened on `lastMarkedPeriod` — the last period by order holding
a marked column — and Présence and Comportement carry no range control at all.
`behaviour-range.ts` was deleted with that second half; `docs/BACKLOG.md` #5
records the reversal. Giving `Period` dates stays rejected for the reason it
always was.

**A consequence, recorded rather than hidden:** `CarnetsPanel` on the class page
summarises the FIRST period by order, while this page opens on the last marked
one, so the two show different class means for one carnet. Each is labelled with
its period. Aligning them is a one-line change to `CarnetsPanel`.

**Attendance is editable here, and that is not the second inline path the
invariant forbids.** The forbidden thing is a register whose séance is implicit.
Here the séance IS the row — its date and its hour are on screen — so an edit
lands on the lesson the teacher is pointing at. **No séance is ever created from
this page**: only lessons that already have a row can be marked, so a page
opened in December to read about September cannot file a lesson. Behaviour stays
**delete-only**, because an event belongs to the moment it was observed.

**The figure is `assiduité`, never `présence`.** Its numerator counts présent,
en retard AND excusé — only an unjustified absence pulls it down — so under the
word *présence* a pupil absent half the term with a note from home would read
near 100 %. Its denominator is séances **marked**, because a séance is created
lazily and the app never knows lessons held. With nothing marked there is no
percentage at all: 0 % and 100 % are both claims about lessons nobody
registered.

**`P A R E` is a translated key, never `value[0]`** — English *late* is L. The
full word is the accessible name and the title, and the state is carried by a
border as well as a fill. The initials break this app's plain-language-label
convention knowingly: four French words at 44px do not fit a 375px row beside a
date and an hour, and the alternatives each cost the thing the block is for,
which is reading a month at a glance.

**`PositionBar` is the first chart in the app.** Hand-written inline SVG,
because a chart library from a CDN would break the no-network promise as surely
as an analytics call. It prints the same figures in text beside it, and
`positionOnScale` returns null under two values or for a spread with no width —
a point drawn as a scale is a lie about a class.

**The URL carries the LIST, not the pupil.** `/students/:studentId?q&classe&
groupe&sort&dir` describes the list the `‹ ›` arrows walk, rebuilt by
`studentSequence`; a page navigation cannot carry an array. Stepping uses
`Router.push` — the opposite of `/`'s week stepper and for the opposite reason:
walking a roster is a sequence of destinations. `compareStudents` is handed to
both tables as their `sortingFn`, so the rows and the arrows cannot order the
same pupils differently. This is why `/classes/:classId/eleves` finally carries
`?groupe&sort&dir`: it was the one list page keeping its filter in React state.

**`writeGrade` lives in `src/db/grades.ts`** and re-reads the row inside its
transaction. It was a local function in the grid page and a hand-copied block in
the fast-entry screen, and the copies had drifted — one re-read, one built its
`put` from a render-time snapshot and dropped a note written since. Three
surfaces write a mark now; one function does.
```

- [ ] **Step 2: Update the Known gaps list in CLAUDE.md**

Append to the *Known gaps* bullets:

```markdown
- The pupil page prints no report and copies nothing. `docs/BACKLOG.md`'s iDoceo
  #5 (*Student reports*) stays parked: the page is read on screen and the
  appréciation is typed where it legally lives, the same ruling the journal took
  against being a cahier de textes.
- Rubrics do not appear on the pupil page. Deferred to
  `2026-09-09-profs-rubric-as-column-design.md`, which dissolves
  `RubricAssessment` into a column; the carnet section already dispatches on
  `column.type`, so a `rubric` column lands there as one more case.
```

- [ ] **Step 3: Record the reversal in `docs/BACKLOG.md`**

At the end of the `## 5. Behaviour counts by period — delivered as counts by DATE` entry, append:

```markdown
**Reversed 2026-09-10.** The selector and `behaviour-range.ts` are gone. The
pupil page was rebuilt around the conseil de classe, where the whole year IS the
trimestre being read, and a control offering "les 30 derniers jours" beside a
carnet's own period tabs put two incompatible clocks on one screen — the very
thing this entry's ruling was about. The counts and the timeline now both cover
everything. Nothing of the discipline is lost: `addDays` in
`src/domain/calendar.ts` walks the calendar exactly as `rangeStart` did, for
`weekParity`'s reason, and its test still walks a year through both clock
changes. If a window is ever wanted again, it is `rangeStart` restored — not a
period mapping, which remains impossible for the reason above.
```

- [ ] **Step 4: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/BACKLOG.md
git commit -m "docs: record what the pupil page decided, and what it reversed

The rulings that will otherwise be re-litigated: why there is no trimestre
selector and must not be one, why editing attendance here is not the second
inline path the invariant forbids, why the figure is called assiduité, why
P/A/R/E is a translated key, and why the URL carries the list rather than the
pupil. BACKLOG #5's date-range selector is recorded as reversed rather than
quietly dropped, with the way back to it named.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj"
```

---

## Self-Review Notes

**Spec coverage.** Route and shell → Task 5. Header, Modifier/Supprimer, notes → Task 6. Carnets, period tabs, position bar, column dispatch → Task 7. Présence, assiduité, month grouping, P/A/R/E → Tasks 3 and 8. Comportement and the `behaviour-range` removal → Task 9. `writeGrade` extraction → Task 1. Domain work → Tasks 2–4. The four recorded costs and the rejected alternatives → Task 10.

**One thing the implementer must check rather than trust.** i18next's nested `$t` interpolation for `assiduityDetail` (Task 8, Step 1) — the component code in that task already composes the two `t()` calls directly, so the nested key is optional and can simply be dropped if it misbehaves.

**Known scope note.** `StudentForm` edits notes as well, so while it is open the page shows two editors for `Student.notes`. They write the same field and the form closes on save; accepted rather than worked around.
