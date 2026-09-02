# profs — Phase 4a: schedule and navigation (design)

**Date:** 2026-09-02
**Status:** Approved, ready for implementation planning
**Follows:** phase 3 (annotations, groups, calculation columns)

## What This Is

Two things a teacher needs before anything else in the morning: **knowing which
lessons are today**, and **getting anywhere in the app in one gesture**.

Today the top bar carries Accueil and Réglages, and reaching the current lesson
from a cold start takes three navigations. That is the app's single most
frequent action and its worst path.

This is the first of three sub-projects decomposed from "timetable, diary,
planner":

| | Scope | This spec |
|---|---|---|
| **4a** | Recurring schedule, Today, navigation | yes |
| **4b** | Diary — what happened, objectives, homework | later |
| **4c** | Planner — cross-class week view | later |

**Attachments stay out of all three.** That is the resources manager, parked at
backlog #6 with its storage-budget question unanswered: photos already press on
IndexedDB quota and video would blow it. Adding files through the diary's back
door would smuggle in a decision we deliberately deferred.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two
themes via `data-theme`.

## Goals

- Opening the app answers "what am I doing now", not "what exists".
- A teacher declares their timetable once and stops navigating to find a class.
- Every destination is one gesture away from anywhere.

## Non-Goals

- Lesson content of any kind — notes, objectives, homework, attachments. That
  is 4b, and mixing it in here would turn a navigation change into a new
  product area.
- Arbitrary n-day rotations. French secondary runs weekly with A/B alternation;
  a day-1-to-day-10 cycle would cost every teacher complexity in the editor for
  a case this audience rarely has.
- Pre-creating sessions from the schedule. See the ruling below.
- Sharing or publishing a timetable. Still no network.

## The two rulings that shape everything

### The schedule predicts; it never pre-creates

A **schedule entry** is a recurring intention: "3°B Maths, Monday 10h–11h,
week A". A **session** is a record that a lesson actually happened, and it
already carries attendance and behaviour from phase 2.

Today lists scheduled lessons. Opening one calls the existing
`getOrCreateTodaySession`, so a `Session` row appears **only when the teacher
starts recording**.

The alternative — materialising a session per scheduled lesson — was rejected
because every holiday, strike, cancellation and sick day would leave an empty
session in a pupil's timeline, and attendance history would fill with lessons
that never occurred. Phase 2's session lifecycle is left exactly as built and
tested.

Consequence: Today merges two lists — scheduled-but-not-started, and
started-but-unscheduled (a lesson the teacher opened ad hoc, or a cover class).
Both are real and both must appear.

### A/B weeks are modelled, and parity is derived

A schedule entry declares `weekCycle`: `all`, `A`, or `B`. Parity for a given
date is **computed** from a term start date the teacher sets once — there is no
stored calendar of weeks to drift out of date.

`weekParity` is the most dangerous function in this phase. Wrong by one, it
shows the wrong lessons *for a whole week*, silently and plausibly. It is pure,
lives in `src/domain/schedule.ts`, and carries the heaviest test coverage here:
DST boundaries, year ends, the term start day itself, and dates before the term
start (which return no lessons rather than a negative parity).

## Data Model

Added to phase 3's tables. Schema moves to `version(5)`; existing data remains
disposable, so no upgrade callback.

```
ScheduleEntry  id, classId, subjectId?, gradebookId?, weekday, startMinute,
               endMinute, weekCycle, room?, createdAt, updatedAt
```

- `weekday` is 1–7, Monday to Sunday (ISO), stored as a number.
- `startMinute` / `endMinute` are minutes from midnight, not strings. A time is
  arithmetic — sorting, overlap detection and duration are all trivial on
  integers and all fiddly on `"10:05"`.
- `weekCycle` is a raw domain string from an `as const` list, translated only
  for display, like every other stored enum in this codebase.
- `gradebookId` is optional: a lesson usually maps to one, and Today can then
  offer the grid directly, but a class with no gradebook yet must still be
  schedulable.

The **term start** is a workspace setting, not a table: one date, stored
alongside the locale preference. It anchors parity and nothing else.

## Modules and Routes

### Navigation

The top bar is **removed**. In its place:

- A **floating hamburger button**, fixed at the top left, over the content. It
  respects the iOS safe-area inset so it clears a notch, and every page gains
  top padding so nothing sits beneath it.
- A **drawer** sliding from the left, holding all five destinations and the app
  name in its header.

Destinations: **Aujourd'hui · Classes · Carnets · Élèves · Réglages**.

The drawer is not a dialog, but it takes the same discipline: Escape closes it,
focus moves into it on open and returns to the button on close, focus is
trapped while it is open, and the backdrop is click-to-close. `window.confirm`
and friends remain banned everywhere.

### Routes

| Route | Purpose |
|---|---|
| `/` | **Today** — the day's lessons, scheduled and ad hoc |
| `/classes` | Class list (the current dashboard's class half) |
| `/gradebooks` | Flat gradebook list — the trip you make marking at home |
| `/students` | Pupil search across every class |
| `/schedule` | The timetable editor |
| `/settings` | Réglages, gaining the term start date |

Existing routes are unchanged. The current dashboard is split: its classes go
to `/classes`, its gradebooks to `/gradebooks`.

`/gradebooks` and `/students` exist because they are the second and third most
common entry points — marking a pile of copies, and looking a child up before a
parents' evening — and both currently require drilling through a class.

### Domain

`src/domain/schedule.ts`, pure, no React and no Dexie:

- `WEEK_CYCLES = ["all", "A", "B"] as const`
- `weekParity(termStart, date)` → `"A" | "B"`
- `entriesForDate(entries, termStart, date)` → entries running that day,
  sorted by `startMinute`
- `formatTimeRange(startMinute, endMinute, locale)`
- `overlaps(a, b)` → whether two entries on the same weekday and cycle collide

Overlap is surfaced as a warning in the editor, never a refusal: a teacher may
legitimately record two things at once, and this app does not know better than
they do about their own week.

## Today

For the current date, Today shows:

1. **Scheduled lessons** — from `entriesForDate`, each showing time, class,
   subject and room. Tapping opens the class plan and creates the session.
2. **Sessions already started today** that no schedule entry matches — a cover
   class, or a lesson opened before the timetable existed.

A lesson that is both scheduled and started appears once, showing that it is
under way.

Empty states are directions, not decoration:

- No schedule at all → an invitation to build one, linking to `/schedule`.
- Schedule exists, nothing today → says so plainly, e.g. a weekend or a holiday.

Ordering is by `startMinute`; the next lesson is emphasised.

## Deletion

`src/db/cascade.ts` gains:

- `deleteScheduleEntry` — single table, but it lives there because every delete
  does.
- `deleteClass` — additionally, its schedule entries.
- `deleteGradebook` — clears `gradebookId` on entries referencing it rather
  than deleting the entry. The lesson still happens; it just no longer points
  at a gradebook. Deleting a gradebook must never delete a teacher's timetable.

That last one is the subtle cascade of this phase and gets its own tests.

## Testing

Unchanged posture: domain and `src/db` are TDD against `fake-indexeddb`; no
component tests; UI verified by driving a real browser.

Specific to this phase:

- `weekParity` gets exhaustive tests — term start day, first and second week,
  a date before term start, across a DST change, across a year boundary.
- `entriesForDate` excludes the wrong cycle and sorts by start time.
- Cascade tests assert zero orphans and a surviving neighbour, plus the
  gradebook case: the entry survives with `gradebookId` cleared.
- A test proves Today's merge shows a scheduled-and-started lesson exactly once.

Validation gate: `yarn format && yarn lint && yarn typecheck && yarn test`.

## Execution

One plan. Order: domain and schema, then schedule operations and cascades, then
the timetable editor, then navigation and the route split, then Today last —
Today is the payoff and wants everything else in place beneath it.
