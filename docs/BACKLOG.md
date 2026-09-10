# Backlog — post-v1

v1 is the gradebook (see `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md`).
This file holds what comes after, in priority order. Each entry gets its own
spec → plan → implementation cycle.

## 1. Grilles d'évaluation (rubrics) — highest value

**Status: delivered, phase 2B, then moved from a standalone screen onto the
carnet.** `src/modules/rubric` (`RubricColumnPage`, `RubricGrid`,
`RubricCellButton`), `src/domain/rubric.ts`, `src/db/criterion-levels.ts` and
`src/db/cascade.ts`'s `deleteRubricTemplate`.

A teacher enters a list of criteria and gets a double-entry table: students down
one axis, criteria across the other, each cell an acquisition level **1 to 4**.
It is used live, while assessing students — during an oral, a practical, a group
exercise — so the grid is a fast-entry surface first and a report second: large
tap targets (`LevelButtons`), one tap per level with the same tap clearing it,
no dialogs, no save button, phone-shape below `md` and a pinned-column matrix
above it.

What shipped, against the open questions this entry originally raised:
- **A grille is a gradebook column, not a screen beside one.** It started
  standalone — a `RubricAssessment` row reachable only through `Rubrics` /
  `Rubric`, sharing a gradebook and a period with the carnet but no other
  surface — and that was the wrong place for it: a teacher is already looking
  at the grid when they want to assess, and a grille reached at `class →
  carnet → Grilles → the assessment` was four taps from the lesson it graded.
  `RubricAssessment` no longer exists; a grille is a `GradeColumn` of `type:
  "rubric"`, its criteria embedded in the column the way `calculation`'s spec
  already was, and its levels their own rows in `criterionLevels` — reached
  through the same two doors a numeric column already had: the cell opens one
  pupil, the header opens the class matrix at `/gradebooks/:gradebookId/rubric/:columnId`.
  A 1–4 level still never converts to a mark out of 20 — see the invariant in
  `CLAUDE.md` — and moving the row did not change that.
- **Reusable via a template library.** `rubricTemplates` holds named criteria
  lists; `setColumnCriteria` copies them into a column's `criteria` with
  fresh criterion ids, so editing a template later cannot rewrite a grid
  already graded.
- **The 1–4 scale renders as both a label and a colour** (non acquis / en
  cours d'acquisition / acquis / expert, from `RUBRIC_LEVEL_COLORS`), never
  colour alone.

What was deliberately **not** built:
- **Criterion weights.** `RubricCriterion` is `{ id, label }` — no weight
  field. Nothing downstream (mean, distribution) would have used one, and a
  weighted 1–4 scale reads as more precision than the levels actually carry.
- **Rubric-to-average conversion.** There is still no way to turn a rubric
  mean into something `studentAverage` reads, and the column move was built
  to leave that true: `isNumericColumn("rubric")` is `false`, so nothing on a
  bulletin moved as a result of it. An opt-in barème — a teacher stating a
  level-to-mark conversion and letting a grille count toward the moyenne — has
  been designed for and deliberately not built; if it is ever wanted it needs
  its own spec, since silently blending a competency scale into a /20 average
  would misrepresent both.
- **Cross-class rubric reporting.** Templates are shared across the workspace,
  but there is no view aggregating rubric results across classes or across
  assessments — each assessment's means and distributions are read on its own
  page only.

## 2. Plan de classe (seating chart) with trombinoscope

**Status: delivered, phase 2A.** One seating layout per class (`src/modules/plan`),
photos shown in the seat, tap-to-seat/unseat. A single layout per class shipped —
see the deferred multiple-layouts entry below for what was cut.

A spatial layout of the room, showing each student's photo where they sit.

- Drag students into seats; a room can have several layouts (exam, group work).
- Photos come from the device, stay in IndexedDB as blobs, and are never uploaded —
  this is the most privacy-sensitive data in the app and needs its own section in
  `PRIVACY.md`, plus a clear delete path.
- Per-student notes visible from the plan: **accommodations and needs** (handicap,
  PAP, PPRE, tiers-temps, placement constraints). Sensitive personal data — likely
  special-category under GDPR — so the spec must cover how it is displayed (not
  over a shoulder), exported, and wiped.
- The seating chart is also the fastest surface for taking attendance and for the
  sanctions below, so those three features share a data model and probably ship close together.

## 3. Historique des sanctions (behaviour log)

**Status: delivered, phase 2A.** Append-only `BehaviourEvent` rows, four types
(`green`/`yellow`/`red`/`note`), logged one tap from the seating plan's pupil
card, with counts and a full timeline on the pupil page
(`src/modules/student`). A period filter on the counts was deliberately left
out — see below.

A visual, per-student behaviour history using football-card semantics:
**yellow card = avertissement, red card = mot dans le carnet**, with room for
other event types.

- Every event is timestamped and belongs to a session, so the history reads as a
  timeline per student and per class.
- Entry must be one tap from wherever the teacher already is — the seating chart
  or the grid — because it happens mid-lesson.
- Aggregates matter: "three yellows this trimestre" is the thing a teacher reports
  to a parent or a CPE.
- Same privacy weight as the accommodation notes: disciplinary records about minors.

## 4. Multiple seating layouts per class

**Status: delivered, phase 8.** `listLayouts` / `createLayout` / `renameLayout`
in `src/db/seating.ts`, `LayoutBar` in `src/modules/plan/components/`, and the
selection in `src/domain/active-layout.ts`.

The blocker this entry named — "which layout attendance/behaviour attach to
when more than one exists for the same session" — dissolved rather than being
answered. **A layout is a view, never a record.** Attendance is already keyed
`[sessionId+studentId]` and a `BehaviourEvent` already carries a `sessionId`,
so neither has ever referred to a layout; switching rooms mid-lesson changes
where a pupil is drawn, not what was recorded. That is the same invariant
phase 2A set when it refused attendance as a column type.

Decisions taken while building it:

- **The selection is device-local**, in `localStorage` keyed by class, not a
  field on `SchoolClass`. A selection is not a property of the school: two
  devices would fight over it, and a backup would carry one device's view onto
  another. It is held as an id and resolved through `resolveActiveLayout`, so a
  deleted room falls back to the first instead of retargeting onto its
  neighbour.
- **The first room stays unnamed.** `getOrCreateLayout` runs before anybody has
  named anything, and a translated default written into the row would be a
  stored label that stops matching the interface language. The UI renders
  `plan.layouts.unnamed`.
- **The picker only appears once there are two.** One room is not a choice.
- **Rename and delete live in layout-edit mode**, not beside the picker: the
  lesson's gesture is placing pupils, and a delete within reach during a lesson
  is a mis-tap that costs an arrangement. The last room is never deletable —
  the class would be handed a fresh default on the next render, so the delete
  would read as "reset" while destroying the arrangement.

## 4b. Named, reusable rooms

**Status: delivered, phase 8.** `rooms` table (v9), `src/db/rooms.ts`,
`SavedRoomsBar` in the plan's layout-edit mode, and `RoomSection` in Réglages.

The question this entry said needed deciding — "what happens to a room's
occupants when it is detached from one class and attached to another" — needed
no new answer, because **a saved room is a user-defined template**. Applying
one goes through the same `applyTemplate` the four built-in templates use, so
`reseat` pours the seated pupils into the new positions in reading order and
hands back whoever no longer fits as overflow, before the write. The stamp
confirm names that count.

Consequences of that framing, all inherited rather than invented:

- **A saved room stamps and ceases to exist.** Nothing on a `SeatingLayout`
  records that it came from "Salle 204", so editing the saved room later cannot
  reach a class already stamped from it, and deleting it changes no
  arrangement. Same ruling as the built-in templates, for the same reason: a
  live link cannot say whether a table dragged out of the arrangement should
  follow a later edit. A test asserts the layout holds no reference back.
- **A room stores positions and no pupils.** Those pupil ids do not exist in
  another class; storing one would be storing a dangling reference. A test
  asserts a seated pupil's id does not appear in the saved row.
- **`positions` is embedded, not its own table** — the `RubricAssessment.criteria`
  precedent. A position is never queried or deleted on its own and is always
  read whole. A seat, written one cell at a time, is what earns a table.
- **Saving happens in the plan, managing in Réglages.** There is nothing to
  *create* in Réglages, since a room with no tables is a shape nobody drew.

## 5. Behaviour counts by period — delivered as counts by DATE

**Status: delivered, phase 8**, and deliberately not as this entry asked.
`src/domain/behaviour-range.ts`, with the selector on the pupil page.

This entry said the blocker was "deciding how a session (dated, not
period-bound) maps to a gradebook period". That mapping was not made, because
it cannot be made honestly. A `Period` is `{ id, gradebookId, name, order }` —
it carries **no dates** — and it belongs to a gradebook, so a class with three
gradebooks has three period calendars that need not agree, while a `Session` is
simply dated. Any mapping would be invented.

Giving `Period` dates was the alternative and was rejected: periods are what
`studentAverage` filters a bulletin by, and making them mean a span of time as
well as a set of columns would change marking everywhere in order to put a
filter on one count. The blast radius is not worth it, and the failure mode —
a silently wrong bulletin — is the one this app cannot afford.

So the counts filter by **date**, over three windows that need no boundary
anyone invented: everything (the default, so the page keeps the behaviour it
had), the last 30 days, and since the term anchor the app already keeps in
`localStorage` for A/B week parity. "Ce trimestre" is deliberately absent:
nothing in the app knows when a trimestre ends, and a guess printed beside a
count of red cards is worse than an honest "depuis la rentrée".

Two details worth keeping:

- **The bound walks the calendar, never `30 * 86_400_000`.** Subtracting
  milliseconds is an hour out after each clock change and, from a morning,
  lands on the day *before* the intended one — silently dropping a day of
  events from a count a teacher may repeat to a parent. A test walks 400 days,
  both clock changes included, and asserts the bound is local midnight exactly
  30 calendar days back, making no assumption about the suite's timezone. Same
  discipline as `weekParity` and `monthGrid`.
- **Only the counts are filtered; the timeline below stays complete.** A
  behaviour log is a record of what was observed when, and hiding entries from
  it would be a different claim than summarising a window of them.

## Source

Feature requests from a practising teacher (relayed by Maxime, 2026-09-01),
describing what they actually use iDoceo for.

---

# iDoceo feature gap analysis

Source: `https://idoceo.net/index.php/en/instructions/quick-start` (read 2026-09-01),
cross-referenced against what `profs` ships after v1 and phase 2.

## Already covered

| iDoceo feature | Where it lives here |
|---|---|
| Classes with their own student list | `SchoolClass` + `/classes/:classId` |
| Gradebook columns, per-type cell editors | `COLUMN_TYPES`, `EditableCell` |
| Tabs/pages for terms | `Period`, per gradebook |
| Attendance | Session-based, phase 2A — deliberately NOT a column type |
| Seating plan | Phase 2A |
| Student photos | Phase 2A |
| Rubrics (1–4 grids) | Phase 2B |
| CSV import, paste from clipboard | v1 `csv.ts` + paste textarea |
| Backup & restore | v1 JSON export/import |
| Averages and weighting | v1 `average.ts` |

## Incompatible with this project — will not be built

- **Google Classroom integration.** Requires network calls to a third party and
  would send minors' names and grades off-device. `README.md` and `PRIVACY.md`
  promise in writing that nothing leaves the device. This is not a scheduling
  question; it contradicts the product.
- **Class sharing between users.** Same reason. The nearest thing that stays
  honest is the existing JSON export, which the teacher moves themselves.

Any future demand here needs a product decision first, not an implementation.

## Missing, ranked by value against cost

### 1. Cell annotations — delivered, phase 3
**Status: delivered, phase 3.** `Grade.note?: string` — already in the v1
schema — is now written and read: the grid cell and the fast-entry screen both
carry a note field beside the mark, with a corner marker (never colour alone)
on an annotated cell and the note reachable through the cell's `title` and
accessible name too. A note is independent of the mark — clearing one never
clears the other — and a grade row with neither a value nor a note is never
stored (see the invariant in `CLAUDE.md`). No schema change, as expected;
`PRIVACY.md` now documents that a note, like `Student.notes`, is free text
included in the JSON export.

### 2. Calculation columns — delivered, phase 3
**Status: delivered, phase 3.** `src/domain/gradebook/calculation.ts`
(`evaluateCalculation`) plus a `calculation` column type wired into the DB and
the grid. The open questions above were resolved as: a small fixed set of
aggregate kinds — `mean`, `sum`, `bestOf`, `count` — over a chosen set of
plain numeric columns, not a formula language; and a calculation may **not**
reference another calculation, so no cycle can exist and there is no
evaluation order to define. The column stores nothing — its value is derived
on read from the source columns' grades — so it never enters `studentAverage`
(`isNumericColumn` stays false for it) and `average.ts` itself was not
touched. Deleting a source column prunes it out of every calculation that
referenced it, in the same transaction as the delete (`deleteColumn` in
`src/db/cascade.ts`), so a calculation can never silently point at a column
that no longer exists.

### 3. Student groups — delivered, phase 3
**Status: delivered, phase 3.** `StudentGroup` and `GroupMember` tables
(`src/db/cascade.ts`'s `deleteGroup`, `src/domain/group.ts`'s
`filterByGroup`), reusable as a filter on the gradebook grid. A group is a way
of selecting and viewing pupils, never a thing that can hold a grade — deleting
one removes only the group and its memberships, never a student.

### 4. Class duplication and templates
"Same structure, new year" is a teacher's September. Duplicating a class with
its columns and periods but no grades, and saving a class as a template, are
both mechanical given the cascade work already done.

### 5. Student reports — PARKED (Maxime, 2026-09-01)
Out of scope for now. Kept here with its open questions rather than deleted.

Per-pupil printable summary: grades, average, attendance, behaviour, rubrics.
High value and the natural consumer of everything phase 2 adds. Must be
print/HTML — no external service, no upload.

### 6. Resources manager — PARKED (Maxime, 2026-09-01)
Out of scope for now. The storage-budget question below stays unanswered.

Files, audio, images attached to a class, a pupil, or a cell. Stored as Blobs in
IndexedDB. Needs a storage-budget answer first: photos already push at quota,
and video would blow it. Ship only with a size cap and a visible usage figure.

### 7. Timetable, diary, planner — WANTED, needs its own brainstorm (Maxime, 2026-09-01)
iDoceo's schedule drives its diary and planner. This was an explicit v1
non-goal. Phase 2's `Session` is the seed of it — a session is already a lesson
on a date — so a timetable becomes "generate the sessions for the term".
Largest item here; deserves its own spec.

### 8. Small wins
Class icon/colour on the dashboard; copy/move a cell, column, or pupil between
classes; full-screen grid; XLS import beside CSV (a parser dependency — weigh
it against the no-network, small-bundle posture).

## Decisions taken 2026-09-01

- **Build next, as "Plan C", in this order:** cell annotations (#1), student
  groups (#3), calculation columns (#2). Groups land before calculations so an
  aggregate scoped to a group does not force a rework.
- **Cross-device stays JSON export/import.** This is the answer, not a gap. No
  sync, no account, no third-party integration. A future session should not
  re-open this as missing functionality.
- **#5 and #6 are parked**, not rejected.
- **#7 is wanted** and gets its own spec cycle. Note for whoever writes it:
  phase 2's `Session` is already a lesson on a date, so a timetable is largely
  "generate the term's sessions". That also means the timetable would take over
  ownership of session lifecycle from the current lazy get-or-create, which is
  the main thing its spec has to settle.
- **Open question for #2, defaulting to "no" unless overridden:** may a
  calculation column reference another calculation column? Allowing it requires
  cycle detection; forbidding it keeps the first version simple.

## The journal and the calendar — delivered, phase 4b (2026-09-02)

**Status: done.** One free-text entry per class per day (`diaryEntries`, keyed
`[classId+date]`), read through `/diary` in agenda, week and month views, with
a class filter and search across the period.

Deliberately **not** a cahier de textes: that record is legally mandated in
France and must be consultable by pupils, parents and the chef
d'établissement, which an app with no network cannot be. The product says so
in as many words on the page itself.

**4c is folded in, not dropped.** "Cross-class week view" is this page with the
class filter off and the week view on. A separate planner would have been a
second calendar rendering the same tables.

What remains unbuilt from the original item 7: nothing. Attachments were never
part of it — see #6, still parked.

## Navigation — delivered, phase 4a (2026-09-02)

**Status: done.** The top bar is gone. A floating hamburger at the top left
opens a drawer holding six destinations — Aujourd'hui, Classes, Carnets,
Élèves, Emploi du temps, Réglages — and the old dashboard split into
`/classes` and `/gradebooks`, with `/students` added for cross-class pupil
search. Reaching the current lesson is now one gesture from anywhere: `/` is
Today.

The recurring timetable shipped with it (`scheduleEntries`, A/B weeks derived
from a term-start anchor). What remains of the original "timetable, diary,
planner" request is **4b — the diary** (what happened, objectives, homework)
and **4c — the planner** (a cross-class week view). Both were delivered by
phase 4b, which folded 4c into the same calendar — see the entry above.

The brainstorm that produced this, kept for its reasoning:

## Navigation — the original brainstorm (Maxime, 2026-09-02)

The top bar carries **Accueil** and **Réglages** and nothing else. Everything a
teacher does daily is reached by navigating down from the dashboard: a class,
then its plan; or a class, then a gradebook, then a column. Reaching today's
lesson from a cold start is three navigations, and it is the single most
frequent thing the app is opened for.

What the brainstorm has to settle, rather than just adding menu items:

- **Is the primary object a class, a gradebook, or a session?** The answer
  decides the shape. Phase 2 made a session a first-class row, which makes
  "today" addressable for the first time — a nav could open straight into the
  current lesson.
- **What does the app open on?** A dashboard listing everything is the current
  answer and it is the wrong one for a teacher walking into a room. "Your next
  lesson" or "the class you were last in" are both defensible.
- **Direct access to classes and gradebooks** — a switcher in the bar, a
  command palette, or a persistent sidebar. A phone held one-handed rules out
  some of these.
- **Mobile shape.** The current bar is desktop-first. A bottom tab bar is the
  native phone idiom and reaches the thumb; a hamburger does not.
- **Does the timetable (backlog item 7) subsume this?** A timetable knows which
  lesson is now. If it is coming, navigation should be designed to receive it
  rather than be rebuilt around it.

Related: item 7 (timetable/diary/planner), which would generate the sessions a
"today" view would show.

## Technical debt — phase 2A inline writes (recorded and discharged 2026-09-02)

**Status: done.** Every write named below now lives in `src/db/` as a named,
unit-tested function: `seating.ts` (`getOrCreateLayout`, `seatStudent`,
`moveSeat`, `clearSeat`, `makeSeat`, `makeGap`, `resizeLayout`),
`attendance.ts` (`setAttendance`, `clearAttendance`, `toggleAttendance`),
`behaviour.ts` (`logBehaviour`), `students.ts` (`setStudentPhoto`,
`setStudentNotes`), `gradebooks.ts` (`createGradebookWithPeriods`) and
`workspace.ts` (`wipeWorkspace`). 28 new tests.

The extraction paid for itself immediately. `onWipe` in Réglages cleared a
hand-written list of **seven** tables — the seven that existed in v1 — so the
ten added since survived "Supprimer toutes les données": sessions, attendance,
behaviour events (including their free-text comments about named children),
the seating plan, all three rubric tables, groups and their memberships.
`PRIVACY.md` states the erase takes the whole workspace, so this was a broken
written promise, not a rough edge. `wipeWorkspace` reads the list off
`db.tables`, which covers the next `db.version(...)` the day it is declared.

Still inline, and deliberately left: five single-table v1-era writes in
`class/components/csv-import.tsx`, `class/components/student-form.tsx` and
`gradebook/components/period-bar.tsx`. They predate phase 2A, are each one
`add`/`update` with no transaction and no invariant spanning tables, and were
not in the recorded scope. Worth folding in the next time one of those forms
is touched.

## Technical debt — a failed `db.open()` (recorded and discharged 2026-09-08)

**Status: done.** `src/main.tsx` catches the rejection and renders
`RecoveryShell` (`src/modules/recovery/shell.tsx`); the branch it takes comes
from `classifyOpenFailure` in `src/domain/recovery.ts`.

The four questions this entry said had to be settled first, and how they were:

- **What does the fallback offer?** Reload always, and the discard only where
  losing the data could help — `corrupt` and `quota`. A transient failure
  (`DatabaseClosedError`, `VersionError`) offers reload alone, because inviting
  a teacher to delete on a blip destroys a term of marks that was never at
  risk. `unsupported` (a private window denying IndexedDB) offers reload too,
  since the fix happens in the browser and then needs one.
- **Can it export first?** No, and it does not try. An export needs the
  database open, which is the thing that just failed, and a partial dump would
  look like a backup while restoring short.
- **Which errors are recoverable?** `classifyOpenFailure` maps them, and the
  mapping is tested. The important half is the default: anything unrecognised
  is `corrupt`, which is the branch that offers a way out. A future Dexie
  error name nobody anticipated lands on the recoverable side, not on a dead
  end.
- **Where does it live?** A second, smaller shell, not a route. It renders
  without `DbProvider`, without the router and without any `useLiveQuery`. It
  reads the workspace registry from `localStorage`, so it can still name the
  school. i18n is safe to use: `import "@i18n"` runs synchronously at the top
  of `main.tsx`, before `initWorkspace`.

Two decisions taken while building it, neither of them in the original entry:

- **The discard deletes the database and keeps the registry entry.** The
  workspace returns on the next boot with its name and year and no data, which
  is what "disposable, not migrated" was always supposed to mean. Removing the
  registry entry as well would turn a recoverable schema into a lost school.
  Other workspaces are untouched, and the panel says so.
- **`initWorkspace` now opens the database explicitly.** It did not before:
  `seedIfEmpty` returns immediately for an already-seeded workspace without
  touching it, so on every boot after the very first, nothing in `initWorkspace`
  opened anything and an open failure surfaced later inside a `useLiveQuery` —
  past the only place that handles it. This was the real gap; the missing
  `.catch` was only the visible half.

The standing rule that schema changes are disposable, not migrated, is now
enforced by a test rather than by review: `src/domain/recovery.test.ts` asserts
that an `UpgradeError` — what a primary-key change throws — always offers the
discard, and that an unknown error name does too.

Still open: a failure *after* React has mounted. `DbProvider` opens lazily, so
a database that dies mid-session surfaces inside a `useLiveQuery` rather than
at boot. That is a different shape of problem (the app is up, the screens
exist, a route to Réglages is reachable) and wants its own entry if it bites.
