# Class Page on One Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the class page — header, séance selection, room, pupil card and panel — on one scrollless screen.

**Architecture:** A layout-only change. The header collapses to one band with a breadcrumb and an overflow menu; the séance strip becomes a day `<select>` plus that day's slots; the group filter leaves this page; the salle picker and the pupil card move into the right panel, where the card replaces the panel entirely; the unseated rail moves below the room and renders only when someone is unseated. Below `lg` the card is a bottom sheet instead. One new tested domain function and one new hook.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Dexie + `dexie-react-hooks`, Chicane router, i18next, Jest + `fake-indexeddb`, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-08-profs-class-page-layout-design.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN, no external font or image. This is a documented promise in `README.md` and `PRIVACY.md`.
- **`node` is not on the default PATH.** Prepend it before any yarn command:
  `export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"`
- **Validation gate, all four green before a task is done:**
  `yarn format && yarn lint && yarn typecheck && yarn test`
- **Every user-visible string goes through `t()`**, and every key must exist in **both** `src/i18n/locales/fr.json` and `en.json` — a parity test fails the build otherwise.
- **No `window.confirm`, `alert`, or any blocking browser dialog.** Destructive actions use `ConfirmButton` (two-step, in place).
- **44px minimum tap target** for anything touched mid-lesson — the `--control-min` token, already carried by `.btn` and `.field`.
- **Writes live in `src/db/`, never in a component.**
- **`PupilName` is the only place a pupil's name is composed.**
- **State bound to a record is anchored to that record's id, never to its position in a list.**
- **No schema change.** No `db.version()` bump, no `backup.ts` change, no `cascade.ts` change.
- **Identifiers are English; only translation values are French.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/domain/seance.ts` | + `teachingDays` — which days the day menu offers |
| `src/domain/seance.test.ts` | + its tests |
| `src/modules/shared/use-media-query.ts` | **new** — `matchMedia` behind `useSyncExternalStore` |
| `src/modules/class/components/seance-strip.tsx` | day `<select>` + that day's slots + inline delete |
| `src/modules/class/components/class-menu.tsx` | **new** — the `⋯` overflow menu (rename / delete) |
| `src/modules/class/page.tsx` | one-band header with breadcrumb; drop the group filter; drop `withNeighbours`; hand the panel to `PlanPage` |
| `src/modules/plan/page.tsx` | owns the two-column layout; salle picker in the panel; card replaces the panel or rises as a sheet; rail below the room, conditional |
| `src/i18n/locales/fr.json`, `en.json` | new keys, both files |

**One decision this plan makes that the spec left open.** The spec says the salle picker and the card move "into the right panel", and the right panel currently lives in `ClassPage`. But the card's `onMove` and `onUnseat` need `held`, `planId` and `unassign`, all local to `PlanPage`; lifting those into `ClassPage` would drag the whole placement gesture up with them.

So **`PlanPage` owns the two-column layout**, and `ClassPage` passes the note and the carnets down as a `panel` prop. What renders is exactly what the spec describes; only the JSX's home differs. The no-salle fallback in `ClassPage` keeps its own single-column layout, which is why `ClassPage` does not simply delegate everything.

---

### Task 1: `teachingDays` — the days the menu offers

**Files:**
- Modify: `src/domain/seance.ts` (append)
- Test: `src/domain/seance.test.ts` (append)

**Interfaces:**
- Consumes: `entriesForDay` from `@domain/schedule`, `nextDay` / `previousDay` from `@domain/calendar`.
- Produces: `teachingDays(entries, history, termStart, today, window): number[]` — local-midnight days, oldest first, each holding a séance or a scheduled lesson. Task 3 calls it.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/seance.test.ts`:

```ts
import { entriesForDay } from "./schedule";
import { nextDay, previousDay } from "./calendar";
import { resolveSlot, type Slot, slotsForDay, teachingDays } from "./seance";

describe("teachingDays", () => {
  const WINDOW = { backDays: 28, aheadDays: 14 };
  // A Monday, so `entry()`'s weekday: 1 lands on it.
  const MONDAY = 1_757_289_600_000;
  const dayEntry = (weekday: number) => ({
    weekday,
    startMinute: 600,
    endMinute: 655,
    weekCycle: "all" as const,
  });

  it("lists a day that holds only a séance", () => {
    const past = previousDay(MONDAY);
    expect(teachingDays([], [{ date: past }], null, MONDAY, WINDOW)).toEqual([past]);
  });

  it("lists a day that holds only a scheduled lesson", () => {
    // Weekday 1 is Monday, so today itself qualifies and so does next Monday.
    const days = teachingDays([dayEntry(1)], [], null, MONDAY, WINDOW);
    expect(days).toContain(MONDAY);
    expect(days.length).toBeGreaterThan(1);
  });

  it("lists a day holding both a séance and a lesson exactly once", () => {
    const days = teachingDays([dayEntry(1)], [{ date: MONDAY }], null, MONDAY, WINDOW);
    expect(days.filter((d) => d === MONDAY)).toHaveLength(1);
  });

  it("returns days oldest first", () => {
    const days = teachingDays([dayEntry(1)], [{ date: previousDay(MONDAY) }], null, MONDAY, WINDOW);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("excludes a séance older than the window", () => {
    let old = MONDAY;
    for (let i = 0; i < 40; i += 1) old = previousDay(old);
    expect(teachingDays([], [{ date: old }], null, MONDAY, WINDOW)).toEqual([]);
  });

  it("excludes a séance beyond the window ahead", () => {
    let far = MONDAY;
    for (let i = 0; i < 20; i += 1) far = nextDay(far);
    expect(teachingDays([], [{ date: far }], null, MONDAY, WINDOW)).toEqual([]);
  });

  /**
   * A/B parity is `entriesForDay`'s business, and this must not second-guess
   * it: a fortnightly lesson appears on its own weeks and no others.
   */
  it("respects A/B parity through entriesForDay", () => {
    const fortnightly = [{ weekday: 1, startMinute: 600, endMinute: 655, weekCycle: "A" as const }];
    const days = teachingDays(fortnightly, [], MONDAY, MONDAY, WINDOW);
    for (const day of days) {
      expect(entriesForDay(fortnightly, MONDAY, day).length).toBeGreaterThan(0);
    }
  });

  /**
   * The walk steps the CALENDAR. Adding 86_400_000 slides an hour at each DST
   * change and eventually repeats or skips a whole day — and a day menu wrong
   * by one looks exactly like a day menu that is right.
   */
  it("skips no day and repeats none across a DST change", () => {
    // 2026-03-29 is the spring-forward Sunday in Europe/Paris.
    const march = new Date(2026, 2, 20).setHours(0, 0, 0, 0);
    const days = teachingDays([dayEntry(1), dayEntry(2), dayEntry(3), dayEntry(4), dayEntry(5)], [], null, march, {
      backDays: 14,
      aheadDays: 14,
    });
    expect(new Set(days).size).toBe(days.length);
    for (const day of days) {
      expect(new Date(day).getHours()).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/domain/seance.test.ts
```

Expected: FAIL — `teachingDays is not a function` / TS2305 "has no exported member 'teachingDays'".

- [ ] **Step 3: Implement `teachingDays`**

Append to `src/domain/seance.ts`, and add the two imports at the top of the file:

```ts
import { nextDay, previousDay } from "./calendar";
import { entriesForDay, type ScheduleEntryLike } from "./schedule";
```

```ts
/**
 * The days the day menu offers: those holding a lesson, taught or predicted.
 *
 * The window is asymmetric on purpose — further back than forward — because
 * the past is where marking happens, while ahead only needs to reach the other
 * side of an A/B alternation to prepare next week.
 *
 * The walk steps the CALENDAR with `nextDay` / `previousDay` rather than adding
 * `86_400_000`, for the reason `weekParity` and `monthGrid` do: millisecond
 * arithmetic slides an hour at each DST change and eventually a whole day, and
 * a day menu wrong by one is indistinguishable from a correct one.
 *
 * It does NOT guarantee the day currently on screen is in the list — a day may
 * carry neither a séance nor a lesson and still be the one the URL names. The
 * caller unions it in, so the `<select>` never shows a value absent from its
 * own options.
 */
export function teachingDays(
  entries: readonly ScheduleEntryLike[],
  history: readonly { date: number }[],
  termStart: number | null,
  today: number,
  window: { backDays: number; aheadDays: number },
): number[] {
  const days = new Set<number>();

  let cursor = today;
  for (let i = 0; i <= window.aheadDays; i += 1) {
    if (entriesForDay(entries, termStart, cursor).length > 0) days.add(cursor);
    cursor = nextDay(cursor);
  }
  const last = previousDay(cursor);

  cursor = today;
  for (let i = 0; i < window.backDays; i += 1) {
    cursor = previousDay(cursor);
    if (entriesForDay(entries, termStart, cursor).length > 0) days.add(cursor);
  }
  const first = cursor;

  // Séances are bounded by the same window, so a term of history does not
  // become a menu nobody can scan.
  for (const session of history) {
    if (session.date >= first && session.date <= last) days.add(session.date);
  }

  return [...days].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test src/domain/seance.test.ts
```

Expected: PASS, existing `slotsForDay` and `resolveSlot` tests still green.

- [ ] **Step 5: Run the full gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/seance.ts src/domain/seance.test.ts
git commit -m "feat(seance): the days a lesson actually falls on"
```

---

### Task 2: `useMediaQuery`

**Files:**
- Create: `src/modules/shared/use-media-query.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): boolean`. Task 7 calls it with `"(min-width: 1024px)"`.

No test: this repo tests domain and `src/db`, not components, and this is a thin wrapper over a browser API.

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, the same shape
 * `DbProvider` uses for the active workspace: the first render already reads
 * the real value, so a layout that branches on width does not paint the wrong
 * branch and then correct itself.
 *
 * The server snapshot is `false`. There is no server here, but React asks for
 * one, and `false` means "the narrow layout" — the safe default, since it is
 * the branch that works at any width.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

- [ ] **Step 2: Run the gate and commit**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
git add src/modules/shared/use-media-query.ts
git commit -m "feat(shared): a hook for the width a layout branches on"
```

---

### Task 3: The séance row — a day menu, and only that day's slots

**Files:**
- Modify: `src/modules/class/components/seance-strip.tsx`
- Modify: `src/modules/class/page.tsx` (delete `withNeighbours`, `neighbourDay`, `NEIGHBOUR_SEARCH_DAYS`; pass the new props)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `teachingDays` (Task 1).
- Produces: `SeanceStrip` now takes `days: number[]` and `onSelectDay: (day: number) => void` in addition to its existing props, and `slots` is only the current day's.

- [ ] **Step 1: Add the i18n keys**

`fr.json`, under `seance`:

```json
"day": "Jour",
"today": "aujourd'hui"
```

`en.json`, under `seance`:

```json
"day": "Day",
"today": "today"
```

- [ ] **Step 2: Rewrite the strip's markup**

In `src/modules/class/components/seance-strip.tsx`, change the props block and the returned JSX. Keep the file's existing imports, `label`, `dayFormat` and `shortFormat`; `shortFormat` is now used by the `<option>` labels rather than by the slot buttons.

Props become:

```tsx
export function SeanceStrip({
  days,
  slots,
  current,
  canStart,
  className,
  onSelectDay,
  onSelect,
  onStart,
}: {
  /** Days offering a lesson, oldest first, always including the one on screen. */
  days: number[];
  /** The CURRENT day's slots, earliest first. */
  slots: Slot[];
  current: Slot | null;
  canStart: boolean;
  className?: string;
  onSelectDay: (day: number) => void;
  onSelect: (slot: Slot) => void;
  onStart: () => void;
}) {
```

And the returned JSX:

```tsx
  const today = startOfDay(Date.now());

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {/* The day is chosen, not stated — but the page still RESOLVES a day on
          its own, so this is how a teacher leaves today, never how they reach
          it. See the spec: a menu that gated the register is the one this
          replaced in the other direction. */}
      <label className="sr-only" htmlFor="seance-day">
        {t("seance.day")}
      </label>
      <select
        id="seance-day"
        className="field"
        style={{ width: "auto" }}
        value={current?.date ?? days[days.length - 1] ?? today}
        onChange={(e) => onSelectDay(Number(e.target.value))}
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {dayFormat.format(day)}
            {day === today ? ` — ${t("seance.today")}` : ""}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1">
        {slots.map((slot) => {
          const isCurrent =
            current !== null && slot.date === current.date && slot.startsAt === current.startsAt;
          return (
            <button
              // Anchored to the slot's day and time, never to its position in
              // the strip: the list reorders as séances are created.
              key={`${slot.date}-${slot.startsAt ?? "x"}`}
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              className={`btn ${isCurrent ? "border-accent text-accent" : ""}`}
              onClick={() => onSelect(slot)}
            >
              {label(slot)}
            </button>
          );
        })}
      </div>

      {canStart && (
        <button type="button" className="btn" onClick={onStart}>
          {t("seance.start")}
        </button>
      )}

      <span className="flex-1" />

      {current !== null && currentSessionId !== null ? (
        <ConfirmButton
          key={currentSessionId}
          variant="link"
          danger
          label={t("common.delete")}
          confirmLabel={t("seance.confirmDelete", { day: dayFormat.format(current.date) })}
          body={t("seance.confirmDeleteBody")}
          onConfirm={() => deleteSession(db, currentSessionId)}
        />
      ) : null}
    </div>
  );
```

Add `startOfDay` to the imports:

```ts
import { startOfDay } from "@db/sessions";
```

Remove the now-unused `shortFormat` line if Biome flags it, and drop the `h-9 min-h-9` from the slot buttons — the 44px floor is the point of `.btn`, and the old override put these under it.

- [ ] **Step 3: Wire the class page to it**

In `src/modules/class/page.tsx`:

Delete the functions `withNeighbours`, `neighbourDay` and the constant `NEIGHBOUR_SEARCH_DAYS` outright — the menu replaces them. Delete the now-unused `nextDay` / `previousDay` import if Biome flags it.

Add to the imports:

```ts
import { resolveSlot, type Slot, slotsForDay, teachingDays } from "@domain/seance";
```

Replace the `stripSlots` line:

```ts
  // Was `withNeighbours(...)`: the strip no longer smuggles other days in
  // beside this one's, because the day menu names them.
  const dayOptions = (() => {
    const days = teachingDays(lesson.entries, lesson.history, termStart, startOfDay(Date.now()), {
      backDays: 28,
      aheadDays: 14,
    });
    // The day on screen must be an option, or the select shows a value it does
    // not offer — a day with no lesson at all is still reachable by URL.
    return days.includes(lesson.day) ? days : [...days, lesson.day].sort((a, b) => a - b);
  })();
```

Add the day handler beside `selectSlot`:

```ts
  const selectDay = useCallback(
    (day: number): void => {
      // No `at`: `resolveSlot` falls back to the day's first lesson, which is
      // what choosing a day means.
      Router.push("Class", { classId, date: String(day) });
    },
    [classId],
  );
```

And the element:

```tsx
      <SeanceStrip
        days={dayOptions}
        slots={slots}
        current={slot}
        canStart={slotSessionId === null || !hasUntimedSeance}
        className="border-border border-b pb-3"
        onSelectDay={selectDay}
        onSelect={selectSlot}
        onStart={() => void startSeance()}
      />
```

- [ ] **Step 4: Run the gate**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: PASS. The i18n parity test covers the two new keys.

- [ ] **Step 5: Commit**

```bash
git add src/modules/class/components/seance-strip.tsx src/modules/class/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(class): a day you choose, and only that day's lessons"
```

---

### Task 4: The header — a breadcrumb, and two buttons behind a menu

**Files:**
- Create: `src/modules/class/components/class-menu.tsx`
- Modify: `src/modules/class/page.tsx` (the header block)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `Modal` from `../../design-system/components/modal`, `ConfirmButton`.
- Produces: `<ClassMenu schoolClass onRename onDeleted />`.

- [ ] **Step 1: Add the i18n keys**

`fr.json`, under `class`:

```json
"actions": "Actions de la classe",
"openActions": "Autres actions"
```

`en.json`, under `class`:

```json
"actions": "Class actions",
"openActions": "More actions"
```

- [ ] **Step 2: Write the menu component**

Create `src/modules/class/components/class-menu.tsx`:

```tsx
import type { SchoolClass } from "@db";
import { deleteClass } from "@db/cascade";
import { useDb } from "@db/provider";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { Modal } from "../../design-system/components/modal";

/**
 * Renommer and Supprimer, one deliberate tap further away.
 *
 * They used to sit on the lesson screen as two full-size buttons, which put
 * "Supprimer la classe" one mis-tap from the confirm step of destroying a term
 * of marks — on the screen used one-handed with a class in front of you. They
 * are rare actions; they can afford the extra tap.
 *
 * `Modal` rather than a popover: the focus trap, Escape, the backdrop and the
 * scroll lock are already written once, and this repo does not want a second
 * copy of that list.
 */
export function ClassMenu({
  schoolClass,
  onRename,
}: {
  schoolClass: SchoolClass;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("class.openActions")}
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        placement="center"
        returnFocusTo={buttonRef}
      >
        <h3 className="m-0">{t("class.actions")}</h3>
        <button
          type="button"
          className="btn w-full"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
        >
          {t("class.rename")}
        </button>
        <ConfirmButton
          danger
          label={t("class.deleteClass")}
          confirmLabel={t("class.confirmDeleteClass")}
          body={t("class.confirmDeleteClassBody")}
          onConfirm={async () => {
            await deleteClass(db, schoolClass.id);
            // The class page cannot survive its own class: without this the
            // route would render "Classe introuvable" instead of going back to
            // a list the teacher can act on.
            Router.push("Home");
          }}
        />
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Replace the header block in the class page**

In `src/modules/class/page.tsx`, replace the whole outer header `<div className="flex flex-wrap items-center justify-between gap-2">…</div>` — from `<h2>` through the closing tag after the `ConfirmButton` — with:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {/* The page had no way back to the list except the drawer. */}
          <Link to={Router.Classes()} className="text-accent text-sm">
            {t("nav.classes")}
          </Link>
          <span className="text-sm text-text-faint">/</span>
          <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
          <span className="text-sm text-text-muted">
            {schoolClass.level ? `${schoolClass.level} · ` : ""}
            {t("dashboard.studentCount", { count: students.length })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={Router.ClassStudents({ classId })} className="text-accent text-sm">
            {t("class.tab.students")}
          </Link>
          <Link to={Router.ClassDiary({ classId })} className="text-accent text-sm">
            {t("class.tab.diary")}
          </Link>
          <ClassMenu schoolClass={schoolClass} onRename={() => setRenaming(true)} />
        </div>
      </div>
```

Add the import:

```ts
import { ClassMenu } from "./components/class-menu";
```

Remove the now-unused `ConfirmButton` and `deleteClass` imports from `page.tsx` if Biome flags them — they moved into `ClassMenu`.

- [ ] **Step 4: Run the gate**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/class/components/class-menu.tsx src/modules/class/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(class): a breadcrumb, and the class delete one tap further off"
```

---

### Task 5: The group filter leaves this page

**Files:**
- Modify: `src/modules/class/page.tsx`
- Modify: `src/modules/plan/page.tsx`

**Interfaces:**
- Produces: `PlanPage` no longer accepts `memberships` or `selectedGroupId`.

`GroupFilter`, `filterByGroup` and `resolveGroupSelection` all stay — `class/students-page.tsx` and `gradebook/page.tsx` still use them.

- [ ] **Step 1: Strip the filter out of the class page**

In `src/modules/class/page.tsx`, delete:

- the `selectedGroupId` state declaration and its comment,
- the `groupId` line (`const groupId = resolveGroupSelection(...)`) and its comment,
- the `<GroupFilter … />` element and the comment block above it,
- the `GroupFilter` import,
- `resolveGroupSelection` from the `@domain/group` import (keep `filterByGroup`, still used by the roster fallback).

Change the roster fallback's filtered call to the unfiltered list:

```tsx
              <RosterRegister
                students={students}
                attendance={attendanceRecords ?? []}
                onOpen={setSelectedStudentId}
              />
```

If `filterByGroup` is then unused in this file, drop the import entirely and let Biome confirm.

The `groups` and `memberships` live queries **stay**: `groups` still gates nothing here but `memberships` is no longer passed down, so delete the `memberships` live query too, and remove `memberships` from the `PlanPage` element. Keep `groups` only if something still reads it — if not, delete that query as well and remove `groups === undefined` from the loading guard.

- [ ] **Step 2: Strip the props out of the plan page**

In `src/modules/plan/page.tsx`:

- Remove `memberships` and `selectedGroupId` from the props type and the destructuring.
- Remove the `filterByGroup` import and the `GroupMember` type import.
- Replace the filtered list with the plain one:

```ts
  const unseatedStudents = students.filter((s) => !seatedIds.has(s.id));
```

and use `unseatedStudents` where `visibleUnseated` was used, deleting the `visibleUnseated` line.

- [ ] **Step 3: Run the gate**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: PASS. `src/domain/group.test.ts` still green — the domain is untouched.

- [ ] **Step 4: Commit**

```bash
git add src/modules/class/page.tsx src/modules/plan/page.tsx
git commit -m "feat(class): drop the group filter from the lesson screen"
```

---

### Task 6: The plan owns its layout — salle picker in the panel, rail below the room

**Files:**
- Modify: `src/modules/plan/page.tsx`
- Modify: `src/modules/class/page.tsx` (pass `panel`, drop the two-column wrapper around `PlanPage`)

**Interfaces:**
- Produces: `PlanPage` accepts `panel: React.ReactNode` — what the right panel shows when no pupil card is open.

- [ ] **Step 1: Give `PlanPage` the panel prop and the two-column layout**

In `src/modules/plan/page.tsx`, add to the props type and destructuring:

```ts
  /** What the right panel holds when no pupil card is open. */
  panel: React.ReactNode;
```

Replace the whole `return (…)` block with:

```tsx
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
        <RoomCanvas
          room={room}
          desks={desks}
          emptyHint={t("plan.emptyRoom")}
          renderPlace={/* unchanged — keep the existing function */}
          placeProps={/* unchanged — keep the existing function */}
        />

        {/* Below the room and only when it has something to say. A band that
            appeared ABOVE would push the desks down the moment a pupil is
            unseated, moving them under a hand that is mid-gesture. */}
        {unseatedStudents.length > 0 && (
          <StudentRail
            students={unseatedStudents}
            held={held}
            onHold={(studentId) =>
              setHeld((current) =>
                current?.studentId === studentId && current.fromDeskId === null
                  ? null
                  : { studentId, fromDeskId: null },
              )
            }
          />
        )}
      </div>

      <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">{t("plan.room")}</span>
          <select
            className="field"
            style={{ width: "auto" }}
            value={room.id}
            onChange={(e) => selectRoom(e.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Link className="text-accent text-sm" to={Router.Rooms()}>
            {t("plan.manageRooms")}
          </Link>
        </div>
        {panel}
      </div>
    </div>
  );
```

Task 7 replaces the panel's contents when a card is open; leave that alone for now.

- [ ] **Step 2: Hand the panel down from the class page**

In `src/modules/class/page.tsx`, the current structure is a `lg:flex-row` wrapper holding the plan on the left and the note + carnets on the right. The plan now owns that split, so build the panel once and give it to whichever branch renders:

```tsx
  const panel = (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
          {t("diary.entryLabel")}
        </h3>
        <SeanceNote
          key={noteKey}
          sessionId={slotSessionId}
          text={session?.note ?? ""}
          onEnsureSession={ensureSeance}
        />
      </div>
      {books !== undefined && (
        <CarnetsPanel
          schoolClass={schoolClass}
          gradebooks={books.gradebooks}
          subjects={books.subjects}
        />
      )}
    </>
  );
```

Then replace the `<div className="flex flex-col gap-4 lg:flex-row lg:items-start">…</div>` wrapper and everything in it with:

```tsx
      {hasRoom ? (
        <PlanPage
          classId={classId}
          students={students}
          session={session}
          onRecord={ensureSeance}
          panel={panel}
        />
      ) : (
        // No salle in the workspace: the plan has nowhere to draw, but the
        // register does not depend on one. This branch keeps its own single
        // column — there is no room to sit beside.
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
            <RosterRegister
              students={students}
              attendance={attendanceRecords ?? []}
              onOpen={setSelectedStudentId}
            />
            {selectedStudentId !== null &&
              (() => {
                const student = students.find((s) => s.id === selectedStudentId);
                if (!student) return null;
                return (
                  <StudentCard
                    key={student.id}
                    student={student}
                    session={session}
                    onRecord={ensureSeance}
                    onClose={() => setSelectedStudentId(null)}
                  />
                );
              })()}
          </div>
          <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">{panel}</div>
        </div>
      )}
```

- [ ] **Step 3: Run the gate**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/plan/page.tsx src/modules/class/page.tsx
git commit -m "feat(plan): the salle beside the room, and a rail only when it matters"
```

---

### Task 7: The pupil card takes the panel, or rises as a sheet

**Files:**
- Modify: `src/modules/plan/page.tsx`

**Interfaces:**
- Consumes: `useMediaQuery` (Task 2), `Modal` from the design system.

- [ ] **Step 1: Add the imports and the width branch**

In `src/modules/plan/page.tsx`:

```ts
import { Modal } from "../design-system/components/modal";
import { useMediaQuery } from "../shared/use-media-query";
```

Inside the component, beside the other state:

```ts
  // `lg`, matching the Tailwind breakpoint the layout below branches on. One
  // card is mounted at a time: rendering both and hiding one with CSS would
  // mean two sets of live queries, two notes drafts racing each other's blur
  // write, and a hidden Modal running its focus-trap effects.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // The desk that opened the card, so closing the sheet returns focus there
  // rather than dumping a keyboard user at the top of the document.
  const openerRef = useRef<HTMLElement | null>(null);
```

- [ ] **Step 2: Record the opener when a card is opened**

In `placeProps`, both handlers currently end with `if (studentId) setSelectedStudentId(studentId);`. Change both to capture the element first:

```ts
                onClick: (e) => {
                  if (held) {
                    void onPlace(desk);
                    return;
                  }
                  if (studentId) {
                    openerRef.current = e.currentTarget as HTMLElement;
                    setSelectedStudentId(studentId);
                  }
                },
                onKeyDown: (e) => {
                  if (e.key !== " " && e.key !== "Enter") return;
                  e.preventDefault();
                  if (held) {
                    void onPlace(desk);
                    return;
                  }
                  if (studentId) {
                    openerRef.current = e.currentTarget as HTMLElement;
                    setSelectedStudentId(studentId);
                  }
                },
```

- [ ] **Step 3: Build the card once and place it by width**

Above the `return`, after `deskOf` is defined:

```tsx
  const selectedStudent =
    selectedStudentId === null ? null : (byId.get(selectedStudentId) ?? null);

  const card =
    selectedStudent === null ? null : (
      <StudentCard
        key={selectedStudent.id}
        student={selectedStudent}
        session={session}
        onRecord={onRecord}
        onClose={() => setSelectedStudentId(null)}
        onMove={() => {
          const deskId = deskOf(selectedStudent.id);
          setSelectedStudentId(null);
          setHeld({ studentId: selectedStudent.id, fromDeskId: deskId });
        }}
        onUnseat={
          deskOf(selectedStudent.id) === null
            ? undefined
            : () => {
                setSelectedStudentId(null);
                void unassign(db, planId, selectedStudent.id);
              }
        }
      />
    );
```

Then in the panel column, swap its contents when the card is open on a wide screen:

```tsx
      <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        {isWide && card !== null ? (
          // The card REPLACES the panel rather than pushing it down: a panel
          // that grows by 600px moves the note being written off screen, which
          // is the failure this whole change is about.
          card
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-muted">{t("plan.room")}</span>
              <select
                className="field"
                style={{ width: "auto" }}
                value={room.id}
                onChange={(e) => selectRoom(e.target.value)}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <Link className="text-accent text-sm" to={Router.Rooms()}>
                {t("plan.manageRooms")}
              </Link>
            </div>
            {panel}
          </>
        )}
      </div>
```

And after the closing `</div>` of the two-column wrapper, still inside the outer element, the narrow-screen sheet:

```tsx
      {/* Below `lg` there is no column to take over, and a card appended under
          the room is the bug being fixed. `Modal` already caps at 88vh, scrolls
          inside itself, locks body scroll, traps Tab and closes on Escape or
          backdrop. Not `Sheet`: it draws its own title-and-close header and the
          card already has one. */}
      {!isWide && (
        <Modal
          open={card !== null}
          onClose={() => setSelectedStudentId(null)}
          placement="bottom"
          returnFocusTo={openerRef}
        >
          {card}
        </Modal>
      )}
```

The outer element must now be a fragment or a wrapping `div` holding both the two-column layout and the modal — wrap the existing `<div className="flex flex-col gap-4 lg:flex-row lg:items-start">…</div>` and the `<Modal>` in a `<>…</>`.

- [ ] **Step 4: Delete the old trailing card block**

Remove the `{selectedStudentId !== null && (() => { … })()}` IIFE that used to render the card at the end of the plan's column. It is now `card`.

- [ ] **Step 5: Run the gate**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/plan/page.tsx
git commit -m "feat(plan): the pupil card takes the panel, or rises as a sheet"
```

---

### Task 8: Verify in a real browser

**Files:** none — this task changes nothing unless it finds a defect.

This repo has deliberately no component tests; UI is verified by driving Chrome against `yarn dev` on port 3000.

- [ ] **Step 1: Start the dev server**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn dev
```

- [ ] **Step 2: Measure, at ~1440 wide**

Open a class with a salle and pupils. In the console:

```js
({ viewport: innerHeight, page: document.documentElement.scrollHeight })
```

Click a seated pupil, measure again. **The page height must not change.** The card must appear in the right panel with the salle picker, note and carnets gone.

- [ ] **Step 3: Check the gestures at ~1440**

1. `Déplacer` closes the card; tapping another desk moves the pupil.
2. `Retirer de sa place` unseats them; the rail appears **below** the room.
3. Re-seat them from the rail; the rail disappears.
4. Closing the card brings the salle picker, note and carnets back.

- [ ] **Step 4: Repeat at ~700 wide**

The card must rise as a bottom sheet over the room, capped and scrolling inside itself. Escape closes it. A backdrop click closes it. After closing, focus is on the desk that opened it — check with `document.activeElement`.

- [ ] **Step 5: Check the séance row writes nothing**

```js
// before
(await indexedDB.databases()).map(d => d.name)
```

With the page open, change the day in the menu, then count séances for the class in the console via the app's Dexie instance, or simply confirm no new row appears in Réglages → export. Opening a day and changing day must create **no** `Session`. Only a mark, a behaviour event, a note, or "Commencer une séance" may.

- [ ] **Step 6: Check the header**

`Classes` navigates to the list. `⋯` opens, Escape closes it, focus returns to the `⋯` button, and `Supprimer la classe` still needs its second tap.

- [ ] **Step 7: Record the result**

Note the before/after page heights in the final report. The spec's baseline was 1364px of page in a 574px viewport, with the card taking it to 1996px.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| The day menu is a shortcut, not a gate | 1, 3 |
| The group filter leaves this page | 5 |
| The pupil card takes the panel, never the page | 2, 7 |
| The rail appears only when it has something to say | 6 |
| The header: breadcrumb + overflow menu | 4 |
| `teachingDays` + tests | 1 |
| `useMediaQuery` | 2 |
| i18n both files | 3, 4 |
| Verification | 8 |

**Type consistency:** `teachingDays` is defined in Task 1 with `window: { backDays, aheadDays }` and called in Task 3 with `{ backDays: 28, aheadDays: 14 }`. `useMediaQuery(query: string): boolean` is defined in Task 2 and called in Task 7. `PlanPage`'s `panel` prop is added in Task 6 and consumed in Task 7. `SeanceStrip`'s `days` / `onSelectDay` are added in Task 3 on both sides at once.

**Ordering note:** Task 5 must land before Task 6, because Task 6 rewrites the `PlanPage` element that Task 5 removes props from. Task 6 before Task 7, because Task 7 edits the panel column Task 6 creates.
