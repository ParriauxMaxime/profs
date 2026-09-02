# profs — Phase 4b: the journal and the calendar (design)

**Date:** 2026-09-02
**Status:** Approved, ready for implementation planning
**Follows:** phase 4a (`2026-09-02-profs-phase4a-schedule-navigation.md`, shipped)

## What This Is

A **journal de bord**: one free-text entry per class per day, read through a
calendar.

This is the second of the three sub-projects decomposed from "timetable, diary,
planner". It **absorbs the third**:

| | Scope | Status |
|---|---|---|
| **4a** | Recurring schedule, Today, navigation | shipped |
| **4b** | Journal, and the calendar that reads it | this spec |
| ~~4c~~ | ~~Planner — cross-class week view~~ | folded into 4b, see below |

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two
themes via `data-theme`.

## The name, and why it is not "cahier de textes"

France has required a **cahier de textes numérique** since circulaire 2010-136.
Per lesson it must carry the *contenu de la séance* and the *travail à faire*
with its due date, and it must be consultable by pupils, parents and the chef
d'établissement. It lives in Pronote or the ENT.

`profs` has no network. It cannot be that record, cannot be consulted by
anyone, and must not imply otherwise — a teacher who believed this app
discharged a legal obligation would be worse off than one who never installed
it.

So the UI says **Journal**, `README.md` and `PRIVACY.md` say plainly that it is
a private log which does not replace Pronote, and no field in it is named after
an official one. The phrase "cahier de textes" appears nowhere in the product.

## Goals

- Answer "where did we get to with 3°B?" without leaving the app or
  remembering.
- Give the year a readable shape: what was taught, when.
- Let a lesson be written about before it happens, without inventing a lesson
  that did not.

## Non-Goals

- **Attachments of any kind.** That is the resources manager, parked at backlog
  #6 with its storage-budget question unanswered: photos already press on the
  IndexedDB quota and video would blow it. The journal is the obvious back door
  for it, which is exactly why the door stays shut here.
- **Structured fields** — no separate objectives, homework, or competency
  boxes. One box was chosen deliberately; see the ruling below.
- **Anything resembling compliance.** No export shaped for Pronote, no
  copy-to-clipboard flow mirroring official fields, no due dates.
- A "last lesson" panel on the class plan. It is the continuity case that lost
  to the calendar, it costs almost nothing to add later, and adding it now
  would be a second reading surface before the first has been used.

## The rulings that shape everything

### The journal never touches `Session`

A future lesson has no `Session`, and must not gain one. 4a ruled that the
schedule **predicts and never pre-creates**, precisely so that every holiday,
strike, cancellation and sick day leaves no empty session in a pupil's
timeline.

A journal entry is writable whether or not the lesson has happened. Had the
text lived on `Session`, writing next Thursday's plan would create a session
for a lesson that has not occurred, and that ruling would die quietly — the
symptom appearing weeks later as attendance history full of lessons nobody
taught.

So `DiaryEntry` is its own table with no `sessionId`. The two are joined at
**read time only**, by class and date, and neither owns the other.

### One entry per class per day

Keyed `[classId+date]`, `date` being local midnight exactly as `Session.date`
already is.

The alternative — keying on the lesson's start time — was rejected because it
pins an entry to a clock: move a lesson from 10h to 11h in the timetable and
the 10h entry matches no lesson and silently vanishes from the calendar. A
private log must not lose text because a timetable was rearranged.

The cost is real and accepted: a class taught **twice in one day shares one
entry**. This is rare in French secondary, and for a log written as "mardi,
3°B: on a fait les fractions" it is arguably the right unit anyway.

### One free-text box, not fields

Chosen over structured entry because the writing happens either mid-lesson with
thirty pupils in the room or at 21h on the sofa, and every field is one more
thing to tab past. Search compensates for the lost structure, which is why
search ships **in this phase** rather than after it.

### 4c is a filter, not a project

"Cross-class week view" is this page with the class filter off and the week
mode on. A separate planner would be a second calendar to keep in sync with
this one, rendering the same lessons from the same tables. `docs/BACKLOG.md`
records 4c as folded in rather than dropped.

## Data Model

Added to phase 4a's eighteen tables. Schema moves to `version(6)`; existing
data remains disposable, so no upgrade callback.

```
DiaryEntry   [classId+date] (compound), text, createdAt, updatedAt
```

Compound key for the reason every other compound key here exists: writing one
day's entry is a single-row `put`, clearing it a single-row `delete`, and it is
never read-modify-written as a collection.

**The empty-husk invariant**, matching `Grade.note` and `Student.notes`: an
entry whose text is blank after trimming is **deleted**, never stored. An empty
row is invisible in the calendar, rides along in every export forever, and
makes "does this day have an entry?" answer wrongly.

## Domain

`src/domain/calendar.ts`, pure — no React, no Dexie.

`startOfIsoWeek` **already exists** as a private helper in
`src/domain/schedule.ts`, where `weekParity` depends on it. It is exported from
there and imported here rather than copied: two implementations of Monday-first
week normalisation would be two chances to get it wrong, and one of them
already carries the A/B parity of the whole year.

- `weekDays(ms)` → the seven local midnights of that ISO week
- `monthGrid(year, month)` → six weeks of seven days, Monday-first, each day
  marked as belonging to this month or spilling from an adjacent one
- `agendaDays(lessons, entries, from, to)` → only the days carrying a lesson or
  an entry, chronological, empty days omitted

`monthGrid` is this phase's `weekParity`: the function whose failure is silent
and plausible. Month boundaries, Monday-first weeks, and a month beginning on a
Sunday are exactly where an off-by-one lives, and a wrong grid still looks like
a calendar.

It gets the same treatment weekParity got. Beyond spot checks, a test walks
**every month of 2026 and 2027** and asserts, for each grid: it starts on a
Monday, it contains every day of that month exactly once, its days are
consecutive with no gap or duplicate, and it is 42 days long. A single-day slip
survives any smaller test.

Both ends of every span are normalised to local midnight before comparison, for
the reason 4a documents: raw timestamp arithmetic drifts an hour at each
daylight-saving change and eventually crosses a day boundary.

## Database

`src/db/diary.ts`, all named, exported and unit-tested against
`fake-indexeddb`:

- `setDiaryEntry(db, classId, date, text)` — normalises `date` to local
  midnight, trims, and deletes rather than storing blank
- `clearDiaryEntry(db, classId, date)`
- `diaryForClass(db, classId)`
- `diaryInRange(db, from, to)` — what the calendar reads, across all classes

Named `diary*` rather than `entriesFor*`: `src/db/schedule.ts` already exports
`entriesForClass` for schedule entries, and two functions of that name in two
db modules would be read wrong at a glance in exactly the place — a calendar
joining both — where the mistake is hardest to see.

Components hold no write logic. This is settled practice since phase 2B, and
phase 2A's exception was discharged in `73d58ff`; there is no longer a
precedent to copy.

## Surfaces

One route, `/diary`, in the drawer as **Journal** — a seventh destination.

Three view modes on one page:

| Mode | Shape |
|---|---|
| **Agenda** (default) | Chronological list, one block per day that has a lesson or an entry, empty days omitted. The only mode that works one-handed. |
| **Week** | Seven day columns. With the class filter off, this is the former 4c. |
| **Month** | A month grid, a day tapped to read or write. The term's shape at a glance. |

A class filter defaulting to **all classes**. A search field filtering the
agenda to days whose text matches, reusing `fuzzyMatchAny` from
`@domain/search` — accent-insensitive, as everywhere else.

Each day shows its lessons from the timetable (`entriesForDate`, already
built), any ad-hoc `Session` that no lesson matches, and its entry. A day
carrying an entry is marked as such in week and month modes, where the text
itself does not fit.

Writing is a textarea, saved on blur, with the same three outcomes the rest of
the app uses: text stores, blank clears, and nothing is ever half-written.

## Deletion

`src/db/cascade.ts` gains:

- `deleteDiaryEntry` — single-table, but it lives there because every delete
  does.
- `deleteClass` — additionally, its diary entries.

**`deleteScheduleEntry` does NOT touch the journal**, and gets a test saying
so. The lesson happened; removing it from next term's timetable must not erase
what was written about it. This is the same shape as 4a's `deleteGradebook`
unlink and is the subtle cascade of this phase.

## Backup and privacy

Backup moves to `version: 6`, carrying `diaryEntries` and rejecting 5 outright
rather than upgrading it — the rule since v2, for the reason a half-populated
import is worse than a refused one.

Neither `wipeWorkspace` nor the backup's clear list needs changing: both read
`db.tables`. The wipe test and the schema table-list test **will** fail until a
`diaryEntries` row is seeded into them, and that failure is the guard working,
not an oversight.

`PRIVACY.md` gains the journal explicitly: free text that may name pupils,
included in the JSON export, never leaving the device — the treatment
`Student.notes` and `Grade.note` already have. `README.md` gains the journal
and states it does not replace Pronote.

## Testing

Unchanged posture: domain and `src/db` are TDD against `fake-indexeddb`; there
are deliberately no component tests; UI is verified by driving a real browser.

Specific to this phase:

- `monthGrid` walked across every month of two years, as described above.
- `agendaDays` omits empty days and keeps order.
- Setting blank text deletes the row; a row with neither text nor a reason to
  exist is never stored.
- Writing an entry for a future date creates **no** `Session` — asserted by
  counting sessions before and after.
- `deleteClass` leaves no orphan entry; `deleteScheduleEntry` leaves the
  journal untouched.
- The double-import guard extends to the new table automatically, since it
  iterates `db.tables`.

Validation gate: `yarn format && yarn lint && yarn typecheck && yarn test`.

## Execution

One plan, roughly six tasks. Order: the calendar domain first, since it carries
the phase's only silent-failure risk; then the schema and the journal's
writes; then cascades and backup; then the page with its three modes; then
search and the class filter; documentation last.
