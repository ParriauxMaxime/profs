# Phase 4a Implementation Plan — schedule and navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening `profs` answers "what am I doing now" instead of "what exists", and every destination is one gesture away.

**Architecture:** A `scheduleEntries` table at Dexie `version(5)` holding recurring weekly lessons with A/B week cycles. Week parity is *derived* from a term-start date, never stored. The schedule **predicts**; sessions are still created lazily on first use, so phase 2's session lifecycle is untouched. Navigation drops the top bar for a floating hamburger and a left drawer.

**Tech Stack:** React 19, TypeScript strict, Dexie 4 + dexie-react-hooks, `@swan-io/chicane`, Tailwind v4, i18next, zod, Jest + ts-jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-02-profs-phase4a-schedule-navigation.md`

---

## Global Constraints

Every one of these was learned the hard way in an earlier phase. They are not style preferences.

- **No network request of any kind.** No `fetch`, no CDN font, no external image, no analytics. `README.md` and `PRIVACY.md` promise in writing that nothing leaves the device, and the app holds names and grades of minors.
- **No `window.confirm`, `alert`, `prompt`, or blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use the two-step in-place `ConfirmButton`.
- **Components hold NO database write logic.** Every write is a named, exported, unit-tested function in `src/db/`. If an operation does not exist, add it there with a test — never inline a `put`, `delete` or `db.transaction` in a component. (Phase 2A predates this rule and is recorded as debt in `docs/BACKLOG.md`; do not copy its pattern.)
- **`src/domain/gradebook/average.ts` must stay byte-identical.** Check `git diff --stat` before every commit. Nothing in this phase touches marking.
- **`src/domain/` is pure:** no React, no Dexie, no I/O. Importing a TYPE from `@db/types` is fine.
- **Every multi-table delete lives in `src/db/cascade.ts`**, each a single `rw` transaction listing EVERY table its body touches. Dexie throws at runtime, not compile time, if one is missing.
- **Compound-key rows are never read-modify-written as a collection.**
- **State bound to a record is anchored to that record's identity, never its position.** Every armed/staged/draft state gets a `key` on the record id. This codebase has produced that bug five times, in five disguises: a form without a key, an index-keyed table row, a control acting on a changing selection, an armed seat, and a note draft outliving its pupil.
- **i18n:** every user-visible string through `t()`; every key in BOTH `src/i18n/locales/fr.json` and `en.json` — a parity test fails the build. `fr` is default and fallback. Plurals use i18next v4 suffixes (`_one`/`_other`); only pass a variable named `count` when plural resolution is actually wanted.
- **Stored values are raw domain strings, never translated labels.**
- **Dates and times shown to a user are formatted with the app locale** (`i18n.language` / `loadLocale()`), never the browser default. A US-format date shipped into the French UI once already.
- **Forms:** `<form onSubmit>` so Enter submits, `autoFocus` on the first field, Escape cancels via `src/modules/shared/use-escape.ts`, every non-submitting button explicitly `type="button"` (a bare button in a form defaults to submit — this turns Cancel into Save), errors carry `role="alert"` and the offending input `aria-invalid`.
- **Tap targets at least 44px**, from `--control-min` in `src/styles/global.css`. Use the primitives in `src/modules/design-system/components/primitives.tsx` — `ActionButton`, `ToggleGroup`, `ToggleOption`, `SeatTile`, `Chip`. Callers never override the height.
- **Two themes** (`copie` light, `ardoise` dark) via `data-theme` on the document element. Never hardcode a colour that only works on one; use the tokens. **A semantic fill carries a paired foreground token** — white is not a safe default: white on mid-tone amber measured 2.28:1 against a 4.5:1 AA requirement.
- **Navigation uses Chicane `<Link to={Router.X({...})}>`.** A raw `<a href>` causes a full page reload.
- **`useLiveQuery` returns `undefined` for both "loading" and "absent".** Resolve absent to an explicit `null` and render a not-found state, as `src/modules/class/page.tsx` does. A page once sat on "Chargement…" forever for a deleted record.
- IDs from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.
- **Validation gate — all four green plus `yarn build`, before every commit:** `yarn format && yarn lint && yarn typecheck && yarn test`
- **No component tests.** Domain and `src/db` are TDD against `fake-indexeddb` (`import "fake-indexeddb/auto";` first line). UI is verified by driving a real browser against `yarn dev` on port 3000.
- **One agent holds the working tree at a time**, or each gets its own git worktree. Concurrent agents in one checkout raced the git index and cost work twice in this project. Stage explicit paths; never `git add -A` or `git add .`.

## Current state at the start of this phase

- Schema is at `db.version(4)`. Tables: `classes`, `students`, `subjects`, `gradebooks`, `periods`, `columns`, `grades`, `sessions`, `attendance`, `behaviourEvents`, `seatingLayouts`, `seats`, `rubricTemplates`, `rubricAssessments`, `rubricScores`, `studentGroups`, `groupMembers`. Backup is at `version: 4`.
- `src/db/sessions.ts` — `startOfDay`, `createSession`, `getOrCreateTodaySession` (transactional), `sessionsForClass`.
- `src/i18n/index.ts` — `LOCALES`, `loadLocale()`, `saveLocale()`, both backed by `localStorage`. The term-start setting follows this pattern.
- `src/modules/shared/use-theme.ts` — theme choice in `localStorage`, applied as `data-theme`.
- Existing routes: `Home` `/`, `Class` `/classes/:classId`, `Plan` `/classes/:classId/plan`, `Student` `/students/:studentId`, `Gradebook` `/gradebooks/:gradebookId`, `Entry` `/gradebooks/:gradebookId/entry/:columnId`, `Rubrics`, `Rubric`, `Settings` `/settings`, `Design` `/design`.
- `src/modules/shared/components/admin-layout.tsx` holds the top bar being removed.

---

## File Structure

**Created**
- `src/domain/schedule.ts`, `src/domain/schedule.test.ts`
- `src/db/schedule.ts`, `src/db/schedule.test.ts`
- `src/modules/shared/components/app-drawer.tsx`
- `src/modules/schedule/page.tsx`, `src/modules/schedule/components/entry-form.tsx`
- `src/modules/today/page.tsx`
- `src/modules/classes/page.tsx`, `src/modules/gradebooks/page.tsx`, `src/modules/students/page.tsx`

**Modified**
- `src/db/types.ts`, `src/db/index.ts`, `src/db/cascade.ts` (+ tests), `src/db/backup.ts` (+ tests), `src/db/seed.ts`
- `src/i18n/index.ts` (term start), `src/modules/settings/page.tsx`
- `src/router.ts`, `src/app.tsx`, `src/modules/shared/components/admin-layout.tsx`
- `src/modules/dashboard/page.tsx` (split, then removed)
- both locale files, `CLAUDE.md`, `README.md`

---

### Task 1: The schedule domain

**Files:** create `src/domain/schedule.ts`, `src/domain/schedule.test.ts`

**Interfaces produced:** `WEEK_CYCLES`, `WeekCycle`, `WeekParity`, `ScheduleEntryLike`, `weekParity`, `entriesForDate`, `formatTimeRange`, `overlaps`, `minutesToHm`, `hmToMinutes`.

This is the highest-risk task in the phase. `weekParity` wrong by one shows the wrong lessons for a whole week, silently and plausibly enough that a teacher blames themselves.

- [ ] **Step 1: Write the failing test** — `src/domain/schedule.test.ts`

```ts
import {
  entriesForDate,
  formatTimeRange,
  hmToMinutes,
  minutesToHm,
  overlaps,
  weekParity,
  WEEK_CYCLES,
} from "./schedule";

const TERM_START = new Date(2026, 8, 1).getTime(); // Tuesday 1 September 2026

describe("WEEK_CYCLES", () => {
  it("is all, A, B", () => {
    expect(WEEK_CYCLES).toEqual(["all", "A", "B"]);
  });
});

describe("weekParity", () => {
  it("makes the term's first week A", () => {
    expect(weekParity(TERM_START, new Date(2026, 8, 1).getTime())).toBe("A");
    expect(weekParity(TERM_START, new Date(2026, 8, 6).getTime())).toBe("A");
  });

  it("makes the second week B", () => {
    // Monday 7 September is the start of week two.
    expect(weekParity(TERM_START, new Date(2026, 8, 7).getTime())).toBe("B");
    expect(weekParity(TERM_START, new Date(2026, 8, 13).getTime())).toBe("B");
  });

  it("alternates onward", () => {
    expect(weekParity(TERM_START, new Date(2026, 8, 14).getTime())).toBe("A");
    expect(weekParity(TERM_START, new Date(2026, 8, 21).getTime())).toBe("B");
  });

  it("treats the week as starting on Monday, not on the term-start weekday", () => {
    // Term starts Tuesday; the Monday BEFORE it is not week two.
    expect(weekParity(TERM_START, new Date(2026, 7, 31).getTime())).toBe("A");
  });

  it("survives a DST change", () => {
    // Europe/Paris moves on 25 October 2026. Parity must not slip.
    const before = weekParity(TERM_START, new Date(2026, 9, 19).getTime());
    const after = weekParity(TERM_START, new Date(2026, 9, 26).getTime());
    expect(before).not.toBe(after);
  });

  it("survives a year boundary", () => {
    const dec = weekParity(TERM_START, new Date(2026, 11, 28).getTime());
    const jan = weekParity(TERM_START, new Date(2027, 0, 4).getTime());
    expect(dec).not.toBe(jan);
  });
});

describe("entriesForDate", () => {
  const entries = [
    { id: "e1", weekday: 2, startMinute: 600, endMinute: 660, weekCycle: "all" as const },
    { id: "e2", weekday: 2, startMinute: 480, endMinute: 540, weekCycle: "A" as const },
    { id: "e3", weekday: 2, startMinute: 540, endMinute: 600, weekCycle: "B" as const },
    { id: "e4", weekday: 3, startMinute: 480, endMinute: 540, weekCycle: "all" as const },
  ];

  it("returns the day's entries for the active cycle, earliest first", () => {
    // Tuesday 1 September 2026 is weekday 2, week A.
    const found = entriesForDate(entries, TERM_START, new Date(2026, 8, 1).getTime());
    expect(found.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("swaps the cycle-specific entry in week B", () => {
    const found = entriesForDate(entries, TERM_START, new Date(2026, 8, 8).getTime());
    expect(found.map((e) => e.id)).toEqual(["e3", "e1"]);
  });

  it("returns nothing for a day with no entries", () => {
    expect(entriesForDate(entries, TERM_START, new Date(2026, 8, 5).getTime())).toEqual([]);
  });

  it("returns nothing before the term starts", () => {
    // A date before the anchor has no meaningful parity; showing week A's
    // lessons in August would be worse than showing none.
    expect(entriesForDate(entries, TERM_START, new Date(2026, 7, 25).getTime())).toEqual([]);
  });
});

describe("minutes helpers", () => {
  it("round-trips", () => {
    expect(minutesToHm(605)).toEqual({ hours: 10, minutes: 5 });
    expect(hmToMinutes(10, 5)).toBe(605);
  });

  it("formats a range in the app locale", () => {
    expect(formatTimeRange(600, 660, "fr")).toBe("10:00 – 11:00");
  });
});

describe("overlaps", () => {
  const base = { weekday: 2, startMinute: 600, endMinute: 660, weekCycle: "all" as const };

  it("detects a clash on the same day and cycle", () => {
    expect(overlaps(base, { ...base, startMinute: 630, endMinute: 690 })).toBe(true);
  });

  it("allows touching edges", () => {
    expect(overlaps(base, { ...base, startMinute: 660, endMinute: 720 })).toBe(false);
  });

  it("ignores a different weekday", () => {
    expect(overlaps(base, { ...base, weekday: 3 })).toBe(false);
  });

  it("ignores opposite cycles", () => {
    expect(
      overlaps({ ...base, weekCycle: "A" }, { ...base, weekCycle: "B" }),
    ).toBe(false);
  });

  it("clashes when one side runs every week", () => {
    expect(overlaps(base, { ...base, weekCycle: "A" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `yarn test src/domain/schedule.test.ts`, module not found.

- [ ] **Step 3: Implement `src/domain/schedule.ts`**

```ts
/**
 * The recurring weekly timetable.
 *
 * A schedule entry is a PREDICTION — "3°B Maths, Monday 10h, week A". It is
 * never a record that a lesson happened; that is a Session, created lazily
 * when a teacher actually starts recording. Keeping the two apart is what
 * stops every holiday and cancellation leaving an empty lesson in a pupil's
 * timeline.
 *
 * Week parity is DERIVED from a term-start date rather than stored, so there
 * is no calendar of weeks to drift out of date. `weekParity` is the most
 * dangerous function here: wrong by one, it shows the wrong lessons for a
 * whole week, and plausibly enough that nobody suspects the app.
 */

export const WEEK_CYCLES = ["all", "A", "B"] as const;

export type WeekCycle = (typeof WEEK_CYCLES)[number];

/** Which alternating week a date falls in. */
export type WeekParity = "A" | "B";

export interface ScheduleEntryLike {
  /** ISO weekday, 1 = Monday through 7 = Sunday. */
  weekday: number;
  /** Minutes from midnight. Times are arithmetic, so they are stored as such. */
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
}

const MS_PER_DAY = 86_400_000;

/** Local midnight of the Monday on or before `ms`. */
function startOfIsoWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  // getDay() is 0 for Sunday; ISO wants Monday first.
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (isoDay - 1));
  return d.getTime();
}

/**
 * Which alternating week a date falls in, counting from the term's first week.
 *
 * Counted in whole ISO weeks, not in days: the term may start mid-week, and
 * the Monday before it still belongs to week one. Both ends are normalised to
 * local midnight before subtracting, so a daylight-saving change — which makes
 * one week 23 or 25 hours long — cannot shift the count.
 */
export function weekParity(termStart: number, date: number): WeekParity {
  const weeks = Math.floor(
    (startOfIsoWeek(date) - startOfIsoWeek(termStart)) / (7 * MS_PER_DAY),
  );
  return weeks % 2 === 0 ? "A" : "B";
}

/** ISO weekday of a timestamp, 1 = Monday. */
export function isoWeekday(ms: number): number {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
}

/**
 * The entries running on a date, earliest first.
 *
 * A date before the term start returns nothing. Its parity would be negative
 * and arbitrary, and showing week A's lessons in August is worse than showing
 * none — an empty day is obviously empty; a wrong day is not.
 */
export function entriesForDate<T extends ScheduleEntryLike>(
  entries: T[],
  termStart: number,
  date: number,
): T[] {
  if (startOfIsoWeek(date) < startOfIsoWeek(termStart)) return [];

  const parity = weekParity(termStart, date);
  const weekday = isoWeekday(date);

  return entries
    .filter((e) => e.weekday === weekday)
    .filter((e) => e.weekCycle === "all" || e.weekCycle === parity)
    .sort((a, b) => a.startMinute - b.startMinute);
}

export function minutesToHm(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export function hmToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

/** A time range for display. The caller passes the app locale, never the browser's. */
export function formatTimeRange(startMinute: number, endMinute: number, locale: string): string {
  const fmt = (m: number): string => {
    const { hours, minutes } = minutesToHm(m);
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(2000, 0, 1, hours, minutes));
  };
  return `${fmt(startMinute)} – ${fmt(endMinute)}`;
}

/**
 * Whether two entries collide.
 *
 * Surfaced as a warning, never a refusal: a teacher may legitimately record
 * two things at once, and this app does not know their week better than they
 * do. Touching edges — one ending exactly as the next begins — is the normal
 * shape of a timetable and is not a clash.
 */
export function overlaps(a: ScheduleEntryLike, b: ScheduleEntryLike): boolean {
  if (a.weekday !== b.weekday) return false;
  const cyclesMeet =
    a.weekCycle === "all" || b.weekCycle === "all" || a.weekCycle === b.weekCycle;
  if (!cyclesMeet) return false;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}
```

- [ ] **Step 4: Run the tests.** Expected: all pass. If `formatTimeRange` differs in separator or padding under the Node ICU build, adjust the TEST to the platform's real output rather than hand-rolling formatting — the app locale must stay the source of truth.

- [ ] **Step 5: Commit** — `git add src/domain/schedule.ts src/domain/schedule.test.ts`, message `feat: add the recurring schedule domain`.

---

### Task 2: Schema v5, term start, and schedule operations

**Files:** modify `src/db/types.ts`, `src/db/index.ts`, `src/i18n/index.ts`, `src/modules/settings/page.tsx`, both locales; create `src/db/schedule.ts`, `src/db/schedule.test.ts`

**Interfaces produced:** `ScheduleEntry`; `saveScheduleEntry`, `entriesForClass`, `allEntries`; `loadTermStart`, `saveTermStart`.

- [ ] **Step 1: The row type** in `src/db/types.ts`

```ts
/**
 * One recurring lesson in the weekly timetable.
 *
 * `gradebookId` is optional: a lesson usually maps to one, and Today can then
 * offer the grid directly, but a class with no gradebook yet must still be
 * schedulable.
 */
export interface ScheduleEntry {
  id: string;
  classId: string;
  subjectId?: string;
  gradebookId?: string;
  /** ISO weekday, 1 = Monday. */
  weekday: number;
  startMinute: number;
  endMinute: number;
  weekCycle: WeekCycle;
  room?: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Schema v5** — add beside `version(4)`, listing only the new store:

```ts
  db.version(5).stores({
    scheduleEntries: "id, classId, weekday, gradebookId",
  });
```

- [ ] **Step 3: Term start**, following the existing locale pattern in `src/i18n/index.ts` — `loadTermStart(): number | null` and `saveTermStart(ms: number)`, backed by `localStorage` under `profs-term-start`. It is a device/workspace preference, not a row, and it must be readable before the database opens. Both wrapped in try/catch: a browser with site data blocked still has to render. Unit-test load/save/round-trip and the null default.

- [ ] **Step 4: `src/db/schedule.ts`** — `saveScheduleEntry(db, input)` creating or updating (validating `endMinute > startMinute` and refusing otherwise), `entriesForClass(db, classId)`, `allEntries(db)`. Tests against `fake-indexeddb`, including that a zero-length or inverted range is refused and nothing is written.

- [ ] **Step 5: Settings** gains a term-start date input, labelled so it is obvious what it anchors (`settings.termStart`, `settings.termStartHint` — "Sert à calculer les semaines A et B"). Until it is set, the schedule editor still works but Today explains that A/B weeks need it.

- [ ] **Step 6:** Gate, then commit.

---

### Task 3: Cascades, backup v5, seed

**Files:** modify `src/db/cascade.ts` (+ tests), `src/db/backup.ts` (+ tests), `src/db/seed.ts`

- [ ] **Step 1: Write the failing cascade tests.** Three cases:
  - `deleteScheduleEntry` removes exactly that entry.
  - `deleteClass` takes its schedule entries, and leaves another class's alone.
  - **`deleteGradebook` CLEARS `gradebookId` on entries referencing it, and does NOT delete the entry.** The lesson still happens; it just no longer points at a gradebook. Deleting a gradebook must never delete part of a teacher's timetable. Assert the entry survives with `gradebookId` undefined, and that an entry pointing at a different gradebook is untouched.

- [ ] **Step 2: Implement**, remembering every table the body touches must be in the transaction list.

- [ ] **Step 3: Backup to `version: 5`**, rejecting 4, carrying `scheduleEntries`. Add the double-import test asserting identical row counts after a second import — that is what catches a table added to the writes but not the clear list.

- [ ] **Step 4: Seed** a plausible week for the demo school: four or five entries across the two classes, at least one `A` and one `B` so the alternation is visible, using the existing deterministic LCG. Seed a term start too, or the demo shows nothing.

- [ ] **Step 5:** Gate, then commit.

---

### Task 4: The timetable editor

**Files:** create `src/modules/schedule/page.tsx`, `src/modules/schedule/components/entry-form.tsx`; modify `src/router.ts`, `src/app.tsx`, both locales

Requirements:

- Route `Schedule` at `/schedule`, wired into `app.tsx`'s `useRoute` array, the `AppRoute` union, and the switch. **The route array is multi-line and formatted — edit it as such**; a single-line search-and-replace has already missed it once.
- The week is shown as seven day columns (or a stacked list below `md`), each listing its entries in time order, with the cycle marked.
- An entry is created and edited through `EntryForm`: class, subject, gradebook, weekday, start and end time, cycle, room. Times are entered as `<input type="time">` and converted with `hmToMinutes` — the stored value is minutes, never a string.
- The form is keyed by its caller on the entry id (or `"new"`), follows the forms convention above, and refuses an end time at or before the start with `role="alert"`.
- **Overlaps warn, never block.** Show which entry it clashes with, and let the teacher save anyway.
- Delete via `ConfirmButton`, keyed on the entry id.
- Empty state directs to creating the first entry.

- [ ] Browser verification: create two entries that clash and confirm the warning appears and saving still works; create an `A` and a `B` entry on the same slot and confirm both save; reload and confirm everything persists.

---

### Task 5: Navigation — floating hamburger and drawer

**Files:** create `src/modules/shared/components/app-drawer.tsx`; modify `src/modules/shared/components/admin-layout.tsx`, `src/router.ts`, `src/app.tsx`, `src/modules/dashboard/page.tsx`; create `src/modules/classes/page.tsx`, `src/modules/gradebooks/page.tsx`, `src/modules/students/page.tsx`; both locales

**The top bar is removed entirely.** In its place:

- A **floating hamburger button**, `position: fixed`, top left, above the content. It respects the iOS safe area (`env(safe-area-inset-top)`), is at least 44px, and has an accessible name (`nav.openMenu`).
- Every page gains top padding so nothing sits beneath the button.
- A **drawer** sliding from the left with the app name in its header and five destinations: **Aujourd'hui · Classes · Carnets · Élèves · Réglages**.

The drawer is not a dialog, but it takes the same discipline: Escape closes it (reuse `use-escape.ts`), focus moves into it on open and returns to the hamburger on close, focus is trapped while open, the backdrop closes on click, and the current destination is marked `aria-current="page"`. Body scroll is locked while it is open.

Route split, all wired into `app.tsx`:

| Route | Page |
|---|---|
| `/` | `TodayPage` (Task 6; a placeholder here) |
| `/classes` | `ClassesPage` — the class half of the old dashboard |
| `/gradebooks` | `GradebooksPage` — flat list, straight to a grid |
| `/students` | `StudentsPage` — search across every class, reusing `@domain/search` |
| `/schedule` | the Task 4 editor |

`src/modules/dashboard/page.tsx` is removed once its two halves have moved. Note that `dashboard/page.tsx` imports `ClassForm` across a module boundary — an accepted exception recorded in `CLAUDE.md`; preserve that arrangement in `ClassesPage` and keep the note accurate.

- [ ] Browser verification at a 375px viewport: the hamburger does not cover content, the drawer opens and closes by button, backdrop and Escape, focus returns to the button, tabbing while open never leaves the drawer, and every destination navigates without a full page reload.

---

### Task 6: Today

**Files:** rewrite `src/modules/today/page.tsx`; modify both locales

Today merges two lists for the current date:

1. **Scheduled lessons** — `entriesForDate(allEntries, termStart, Date.now())`, each showing the time range, class, subject and room. Tapping opens the class plan, which creates the session through the existing `getOrCreateTodaySession`.
2. **Sessions already started today** that no schedule entry matches — a cover class, or a lesson opened before the timetable existed.

A lesson that is both scheduled and started appears **once**, marked as under way. Order by `startMinute`; sessions with no scheduled time sort last. Emphasise the next lesson by comparing against the current minute.

Empty states are directions, not decoration:

- No term start → explain that A/B weeks need one, linking to Réglages.
- No entries at all → invite building a timetable, linking to `/schedule`.
- Entries exist but none today → say so plainly (a weekend, a holiday).

- [ ] Browser verification: with the seeded timetable, confirm today's lessons appear in time order and match what the schedule editor shows for that weekday and cycle; open one and confirm exactly one session is created (check `sessions` count in IndexedDB before and after, and again after re-opening — it must not create a second); confirm a scheduled-and-started lesson appears once, not twice.

---

### Task 7: Documentation

- `CLAUDE.md`: the `scheduleEntries` table and the term-start setting; that the schedule predicts and never pre-creates a session, and why; that `weekParity` is derived and is the phase's dangerous function; the `deleteGradebook` clears-rather-than-deletes cascade; the navigation change.
- `README.md`: the timetable and Today.
- `docs/BACKLOG.md`: mark the navigation entry delivered; leave 4b (diary) and 4c (planner) as the remaining sub-projects, and leave the parked items and the phase 2A debt entry intact.

- [ ] Commit.

---

## Self-Review

**Spec coverage.** A/B weeks derived from a term anchor (T1, T2); schedule predicts, session created lazily (T6, and nothing in T1–T3 writes a session); minutes not strings (T1, T4); overlap warns rather than refuses (T1, T4); floating hamburger and drawer with the five destinations (T5); the route split including `/gradebooks` and `/students` (T5); Today merging both lists and showing a dual-status lesson once (T6); the `deleteGradebook` clears-not-deletes cascade (T3).

**Placeholders.** Tasks 4, 5 and 6 specify UI behaviour with named browser verifications rather than transcribed markup — the posture used through phases 2 and 3, which caught defects reliably. The domain and database layers, where a mistake corrupts data silently, carry complete code and tests.

**Type consistency.** `WeekCycle` is defined once in `@domain/schedule` and imported by `db/types.ts`, never redeclared. `ScheduleEntryLike` exists so the domain functions do not depend on the DB row's `id` or timestamps. `weekday` is ISO 1–7 everywhere, and `isoWeekday` is the only place `Date.getDay()`'s Sunday-is-zero is converted.

**The hazard worth naming.** `weekParity` is the one function here whose failure is silent and total: wrong by one and every day of every other week shows the wrong lessons. It is pure, it is tested across DST and a year boundary, and it normalises both ends to local midnight before subtracting — a subtraction on raw timestamps would drift by an hour twice a year and eventually flip a week.
