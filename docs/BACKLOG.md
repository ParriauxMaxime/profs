# Backlog — post-v1

v1 is the gradebook (see `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md`).
This file holds what comes after, in priority order. Each entry gets its own
spec → plan → implementation cycle.

## 1. Grilles d'évaluation (rubrics) — highest value

**Status: delivered, phase 2B.** `src/modules/rubric` (`RubricsPage`,
`RubricAssessmentPage`, `RubricGrid`), `src/domain/rubric.ts`, `src/db/rubrics.ts`
and `src/db/cascade.ts`'s `deleteRubricAssessment`/`deleteRubricTemplate`.

A teacher enters a list of criteria and gets a double-entry table: students down
one axis, criteria across the other, each cell an acquisition level **1 to 4**.
It is used live, while assessing students — during an oral, a practical, a group
exercise — so the grid is a fast-entry surface first and a report second: large
tap targets (`LevelButtons`), one tap per level with the same tap clearing it,
no dialogs, no save button, phone-shape below `md` and a pinned-column matrix
above it.

What shipped, against the open questions this entry originally raised:
- **Standalone, not attached to a gradebook column.** A rubric assessment
  belongs to a gradebook and a period (for filtering) but a 1–4 level never
  converts to a mark out of 20 — see the invariant in `CLAUDE.md`.
- **Reusable via a template library.** `rubricTemplates` holds named criteria
  lists; `createAssessmentFromTemplate` copies them into a new assessment with
  fresh criterion ids, so editing a template later cannot rewrite a grid
  already graded.
- **The 1–4 scale renders as both a label and a colour** (non acquis / en
  cours d'acquisition / acquis / expert, from `RUBRIC_LEVEL_COLORS`), never
  colour alone.

What was deliberately **not** built:
- **Criterion weights.** `RubricCriterion` is `{ id, label }` — no weight
  field. Nothing downstream (mean, distribution) would have used one, and a
  weighted 1–4 scale reads as more precision than the levels actually carry.
- **Rubric-to-average conversion.** There is still no way, and no plan, to
  turn a rubric mean into something `studentAverage` reads. If this is ever
  wanted, it needs its own spec — silently blending a competency scale into a
  /20 average would misrepresent both.
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

Phase 2A ships exactly one `SeatingLayout` per class (created lazily on first
visit to the plan page). iDoceo's "a room can have several layouts (exam,
group work)" was explicitly deferred: it needs a layout switcher in the UI and
a decision on which layout attendance/behaviour attach to when more than one
exists for the same session. `deleteSeatingLayout` in `src/db/cascade.ts`
already supports removing one of several, so the schema is not the blocker —
the UI and the "which layout is active" question are.

## 5. Behaviour counts by period

The pupil page's behaviour counts (`countByType`) are deliberately computed
over **all** events, with no period filter, by design in phase 2A. A
teacher reporting "three warnings this trimestre" needs the count scoped to a
period, which requires deciding how a session (dated, not period-bound) maps
to a gradebook period. Left for a later pass rather than invented during
phase 2A.

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
and **4c — the planner** (a cross-class week view). Neither is specced.

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

