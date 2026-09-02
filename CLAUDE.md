# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`profs` is a local-only gradebook PWA for teachers — an open-source subset of iDoceo. Everything lives in the browser's IndexedDB. There is no backend, no account, and **no network request of any kind**.

That last point is a product requirement, not a preference: the app holds the names and grades of minors, and `README.md` / `PRIVACY.md` promise in writing that nothing leaves the device. Introducing a `fetch`, a CDN font, an analytics call, or an external image would break a documented claim. If a task seems to need one, stop and raise it.

## Commands

```bash
yarn dev         # rspack dev server on :3000
yarn build       # production build into dist/
yarn preview     # serve dist/ (uses npx serve)
yarn format      # biome check --fix .
yarn lint        # biome check .
yarn typecheck   # tsc --noEmit
yarn test        # jest
```

**Validation gate — all four must be green before any change is considered done:**
`yarn format && yarn lint && yarn typecheck && yarn test`

Run a single suite or test:

```bash
yarn test src/domain/gradebook/average.test.ts
yarn test -t "normalises a /100 column"
```

## Architecture

Three layers, and the boundaries are enforced by review:

**`src/domain/`** — pure logic. No React, no Dexie, no I/O. This is the only place with real unit tests, and it is where the rules that must not drift live: column types and grade-value parsing/formatting (`gradebook/grade.ts`, `gradebook/column.ts`), weighted averages and class statistics (`gradebook/average.ts`), CSV roster parsing (`gradebook/csv.ts`), decimal formatting and parsing (`gradebook/decimal.ts`), default period names (`gradebook/period.ts`), the default gradebook name (`gradebook/naming.ts`), the subject colour palette (`subject.ts`), accent-insensitive search (`search.ts`), and the workspace registry (`workspaces.ts`). Domain constants use the `as const` array + derived type pattern; they never get inlined into a component — the palette and the period names live here precisely because a component once held them.

Two decimal formatters, and picking the wrong one is a data bug: `formatDecimal` rounds to two decimals and is for **display**; `formatDecimalExact` preserves full stored precision and is for **seeding an editor**, so that opening a cell and committing it unchanged cannot silently rewrite the value. Both take the app's locale, never the browser's.

**`src/db/`** — Dexie. `openWorkspaceDb(workspaceId)` opens `profs-<id>`; each workspace is its own database. Nineteen tables across five `db.version(...).stores({...})` calls: `version(2)` declares the original seven (`classes`, `students`, `subjects`, `gradebooks`, `periods`, `columns`, `grades`) together with five added in phase 2A for the classroom features — `sessions` (one row per lesson), `attendance` (keyed `[sessionId+studentId]`), `behaviourEvents` (append-only observations, `classId` denormalised for a one-index class timeline), `seatingLayouts` (one room per class), and `seats` (keyed `[layoutId+row+col]`); `version(3)` adds three more for phase 2B's rubrics: `rubricTemplates` (a reusable named list of criteria), `rubricAssessments` (one graded instance, owning a copy of its criteria — see below), and `rubricScores` (one 1–4 level per criterion per pupil, keyed `[assessmentId+criterionId+studentId]`); `version(4)` adds phase 3's two group tables — `studentGroups` (a named subset of a class) and `groupMembers` (keyed `[groupId+studentId]`), a way of selecting and viewing pupils for filtering and seating, never a thing that holds a grade; `version(5)` adds phase 4a's `scheduleEntries` — the recurring weekly timetable; `version(6)` adds phase 4b's `diaryEntries` (keyed `[classId+date]`), the journal. `provider.tsx` exposes `useDb()`; `init.ts` runs once before first render; `seed.ts` creates the demo school; `backup.ts` does JSON export/import; `cascade.ts` owns every multi-table delete (see below).

Rubric criteria are embedded in `RubricAssessment.criteria` (an array of `{ id, label }`), but a score is its own table row. A criterion has no independent existence worth tracking outside the assessment it belongs to — it is never queried, listed, or deleted except through its assessment — so embedding it avoids a join for something that is always read as a whole. A score, by contrast, is written and cleared one cell at a time from the live grid, which is exactly what a compound-key table is for. `createAssessmentFromTemplate` copies a template's criteria with **fresh** `crypto.randomUUID()` ids rather than reusing the template's: two assessments built from the same template must not share criterion ids, or a score written against one would be silently readable from the other, and improving the template later would have no way to reach a grid already graded.

A `Seat` row encodes three states, and they must stay distinct: no row at all for a `[layoutId, row, col]` is a **gap** (an aisle or a doorway — nothing can ever be placed there), a row with `studentId: null` is an **empty seat**, and a row with a `studentId` is an **occupied** one. Treating "no row" and "null studentId" as the same thing loses the gap.

The seating plan's gesture is pick-up-then-place, not drag: the teacher first holds a pupil — from the rail, or from an already-seated pupil — and then taps a seat. `resolveDrop` in `src/domain/seating.ts` is the single pure rule for what that tap means, so it lives in one tested function rather than a click handler: a pupil held from the rail always *seats* (displacing whoever already occupies the target, who returns to the rail), a pupil held from a seat always *swaps* with the target (which degrades to a plain move when the target is empty), and a gap is never a valid target. A bare tap on a seated pupil still opens their pupil card — that stays the gesture of the lesson itself, attendance and behaviour — so picking that pupil up instead goes through the card's `Déplacer` button, or through a bare tap while in layout-edit mode.

**`src/modules/<name>/page.tsx`** — one page per route, with module-local `components/`. `design-system/` holds shared UI, `shared/` the layout. There is no `src/routes/` folder — each module owns its page. Components read the database through `useLiveQuery` and hold UI state only.

Routes (`src/router.ts`, Chicane): `/` (**Today**), `/classes`, `/gradebooks`, `/students`, `/schedule`, `/diary`, `/classes/:classId`, `/classes/:classId/plan`, `/students/:studentId`, `/gradebooks/:gradebookId`, `/gradebooks/:gradebookId/entry/:columnId`, `/gradebooks/:gradebookId/rubrics`, `/gradebooks/:gradebookId/rubrics/:assessmentId`, `/settings`.

### The schedule predicts; it never pre-creates

A `ScheduleEntry` is a recurring **intention** — "3°B Maths, Monday 10h, week
A". A `Session` is a record that a lesson actually happened, and it carries the
attendance and behaviour. Today lists scheduled lessons; opening one calls the
existing `getOrCreateTodaySession`, so a session row appears only when the
teacher starts recording.

Materialising a session per scheduled lesson was rejected and must stay
rejected: every holiday, strike, cancellation and sick day would leave an empty
session in a pupil's timeline, and attendance history would fill with lessons
that never occurred. The consequence is that Today merges two lists —
scheduled-but-not-started and started-but-unscheduled — and a lesson that is
both must render **once**.

A/B week parity is **derived** from a term-start date, never stored, so there
is no calendar of weeks to drift. The anchor lives in `localStorage`
(`src/domain/term.ts`, key `profs-term-start`) beside the theme rather than in
a table: it describes this device's workspace, has no relations, and Today must
know which week it is before the database opens.

`weekParity` in `src/domain/schedule.ts` is the most dangerous function in the
app. Wrong by one, it shows the wrong lessons for a whole week, silently and
plausibly enough that a teacher blames themselves. It counts whole ISO weeks
with both ends normalised to local midnight — raw timestamp arithmetic drifts
an hour at each DST change and eventually flips a week. Beyond the DST and
year-boundary spot checks, a test walks 400 days and asserts parity flips only
on Mondays, 57 times; a one-day slip leaves the spot checks passing. Times are
minutes from midnight, never `"10:05"`. Overlap is a warning the editor shows,
never a refusal — a teacher may legitimately have two things at once.

### The journal is not a cahier de textes

France has required a **cahier de textes numérique** since circulaire 2010-136:
per lesson it carries the contenu de la séance and the travail à faire, and it
must be consultable by pupils, parents and the chef d'établissement. It lives
in Pronote or the ENT.

This app has no network and cannot be that record. The distinction is kept by
the **naming** — the feature is a Journal, and no field is named after an
official one. There is deliberately no on-screen disclaimer: one was written
and removed, because a teacher who installed a local-only app does not need
telling it is not the ENT, and the line read as defensive. `PRIVACY.md` and
`README.md` carry the statement in full, which is where it belongs.
A teacher who believed this discharged a legal obligation would be worse off
than one who never installed it. Do not add a Pronote-shaped export, due
dates, or a travail-à-faire field without reopening that question.

`DiaryEntry` is keyed `[classId+date]` and carries **no `sessionId`**, and that
absence is load-bearing. An entry is writable before the lesson happens; had
the text lived on `Session`, writing next Thursday's plan would create a
session for a lesson nobody taught and quietly undo the ruling above. The two
are joined at read time only. A test counts sessions before and after writing
a future entry.

One entry per class per day, not per lesson slot: keying on a start time would
pin text to a clock, so moving a lesson from 10h to 11h would make its entry
match no lesson and vanish. A class taught twice in one day shares an entry,
which is accepted.

`deleteScheduleEntry` deliberately does **not** touch the journal — the lesson
happened, and taking it off next term's timetable must not erase what was
written about it. Same shape as `deleteGradebook` unlinking rather than
deleting.

`monthGrid` in `src/domain/calendar.ts` is the calendar's `weekParity`: a grid
wrong by one day still looks exactly like a calendar, and nobody checks a
calendar against another calendar. Its test walks every month of two years.
Nothing here adds days by arithmetic — `nextDay` walks the calendar, because
`+ 86_400_000` is wrong at each DST change and eventually a whole day out.

### Navigation

There is no top bar. `AdminLayout` renders one floating hamburger fixed at the
top left (44px, safe-area inset) and `AppDrawer`, which holds every
destination: Aujourd'hui, Classes, Carnets, Élèves, Emploi du temps, Journal, Réglages.
The drawer is not a `<dialog>` — blocking dialogs are banned here — so it
implements the discipline by hand: Escape closes, focus moves in on open and
returns to the button on close, Tab is trapped, the backdrop closes on click,
body scroll is locked, and the panel carries `inert` when closed so a
translated-off drawer is not silently in the tab order. Anything added to it
keeps all of that.

Above the destinations sits `WorkspaceSwitcher`, which changes which
établissement is open. It is not a destination, and it is deliberately not
inside the `<nav>`; its buttons are still trapped, because the trap queries the
panel rather than the nav. With one école it collapses to a line of text — a
switcher with nothing to switch to is a control that does nothing, sitting
above the navigation used every lesson.

### One workspace per school, and switching between them

A `Workspace` (`src/domain/workspaces.ts`) is one school-year: a name, a year,
and its own database. The registry lives in `localStorage` because
`DbProvider` must know which database to open before any database is open.
Switching writes the active id and nothing else — the provider re-opens on it
through `useSyncExternalStore`, and **every** `useLiveQuery` in the app takes
`db` in its dependency array, which is what makes a switch re-read the whole
app without a reload. A live query that forgets `db` keeps rendering the
previous school's pupils; that is the failure mode to watch for when adding one.

Création goes through `createWorkspace`, never `addWorkspace`: it marks the new
workspace **seeded** immediately. `initWorkspace` runs `seedIfEmpty` on the
active workspace at every boot, so a school a teacher created would otherwise
be handed the demo school's classes and pupils on the next reload. Only
`ensureDefaultWorkspace` leaves the marker unset, because the demo data
introduces an empty app rather than filling in a real school.

Deleting takes both halves, and both are required: `removeWorkspace` drops the
registry entry, and `deleteWorkspaceDb` deletes `profs-<id>`. The entry alone
is not the deletion `PRIVACY.md` promises — the pupils' names would still be in
IndexedDB, invisible and unreachable. Deleting the last workspace is allowed;
the replacement is created **before** the removal, never after, because for the
instant in between `activeWorkspaceId()` would be null and the provider has
nothing to open. Boot's `ensureDefaultWorkspace` cannot cover that gap.

Management (create, rename, delete) lives in Réglages rather than the drawer: a
teacher changes school far more often than they create one, and a destructive
delete does not belong in the navigation.

### Invariants worth knowing before you touch anything

- **Grades use the compound primary key `[gradebookId+columnId+studentId]`.** That is the whole point of the schema: editing one cell is a single-row `put`, and clearing it is a single-row `delete`. Never read-modify-write a collection of grades. Build the key with `gradeKey()` — it is the only constructor.
- **Averages are computed on read, never stored.** A stored average goes stale the moment a weight changes. `studentAverage` takes the FULL column list plus a `periodId` and filters internally — passing an already-filtered list changes results silently.
- **Every numeric column is normalised to /20 by its own `max`** before weighting, so a /100 test and a /20 test can be averaged together. Only numeric columns count toward an average; the other five types never do.
- **Three distinct input outcomes, and they must stay distinct**: blank input *clears* the cell (deletes the row), a valid value *stores*, and an invalid one (unparseable, negative, above the column's `max`) is *refused* — nothing is written and the existing mark survives, with the bad input left visible so it can be corrected. Both the grid cell and the fast-entry screen implement this; `isBlankInput` and `parseGradeValue` in `domain/gradebook/grade.ts` are the shared rule.
- **`Grade.note?: string` is in use as of phase 3** — a free-text annotation on a cell, independent of `value`. A note can exist before a mark does ("absent, à rattraper"), so `value` is optional too. The invariant that must hold at every write site: a grade row with **neither** a `value` nor a `note` must never be stored — `writeGrade` in the gradebook page and `setGradeNote` in `src/db/grades.ts` both delete the row outright rather than leave an empty husk. A note is free text a teacher can put anything in; like `Student.notes`, it is included in the JSON export (`PRIVACY.md` says so).
- **A `calculation` column stores nothing.** Its value — `mean`, `sum`, `bestOf`, or `count` over a chosen set of numeric columns — is derived on read by `evaluateCalculation` (`src/domain/gradebook/calculation.ts`), never written as a grade row. This is deliberate, not an optimisation: French marking already expresses weighting through `column.weight`, so a calculation feeding `studentAverage` would duplicate that mechanism while risking a silently wrong bulletin — the one failure this app cannot afford. `isNumericColumn` stays false for `calculation`, `parseGradeValue` refuses it, and `EditableCell` renders it read-only, so a teacher can never type a stored value into a cell the next render would discard. A calculation may not reference another calculation, so no cycle can exist. `deleteColumn` (`src/db/cascade.ts`) prunes a deleted column's id out of every calculation's `sourceColumnIds` in the same transaction — otherwise a calculation would silently change meaning while still rendering a plausible number.
- **Attendance and other stored values are raw domain strings.** Only the *display* is translated (`gradebook.attendance.*`). Never persist a translated label.
- **Attendance is a property of a session, not a gradebook column type.** A lesson happened on a date to a class, and that fact must not be recordable in two places. Phase 1's column types never included attendance for this reason, and phase 2A did not add one — attendance lives in the `attendance` table, keyed to a `Session`, and is set from the seating plan's pupil card.
- **Behaviour events are append-only.** A `BehaviourEvent` is never edited in place — `deleteBehaviourEvent` in `cascade.ts` is the only correction available, and a new observation is always a new row. This is deliberate: a behaviour log is a record of what was observed when, not a mutable field.
- **A class holds at most `MAX_STUDENTS_PER_CLASS` (100) pupils.** The ceiling is enforced at every write site that can grow a roster — `student-form.tsx`, `csv-import.tsx`, and `parseBackup` — rather than inlined into one of them, since a rule only one of three sites knows is a rule the other two don't have. `parseBackup` refuses an over-capacity file whole, and does so before `importWorkspace`'s transaction clears every table, so a refusal costs the teacher nothing.
- **Rubrics never feed an average.** A `RubricLevel` (1–4) is not a mark out of 20, and no conversion between the two scales exists deliberately (`docs/BACKLOG.md` #1). `gradebook/average.ts` was not touched to build rubrics and still only sums the numeric columns it always did — `studentAverage`, `classStats` and `RubricScore` share no code path. The means and distributions in the rubric grid (`domain/rubric.ts`: `studentMean`, `criterionMean`, `levelDistribution`) are for reading a grid, never for a bulletin, and the grid says so in the UI.

### Conventions that will trip you up

- **Never `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use a two-step in-place confirm: first click arms, second click acts, with a cancel beside it.
- **Typography and the ruled surface.** The app is set in **Luciole** (CC BY 4.0), bundled under `src/assets/fonts/` and emitted as a hashed asset — never fetched, because a font CDN would break the no-network promise as surely as an analytics call. It is sans-only, so heading hierarchy comes from weight and size, not from a serif switch; do not reintroduce Georgia. Attribution lives in `README.md` and the licence travels with the files.

  `.carreaux` in `global.css` is the squared writing surface — petits carreaux, the 5mm grid used from collège onward, which is this app's audience — and it is applied to **exactly one element**: the journal textarea. Ruling was tried app-wide in an earlier pass and cut for reading as texture.

  Three things make it work and all three must survive any edit. `line-height` equals two grid squares. `padding-top` subtracts the baseline offset (`calc(2rem - 1.2425em)`) so the first baseline lands *on* a line rather than floating above it — matching the pitch alone is not enough, because text centres itself in its line box. And the grid is sized in **`rem`, never `mm`**.

  That last one is not cosmetic. Séyès was built first, in millimetres, and could not render: its 8mm band is 30.234px and its 2mm subdivision 7.547px, so consecutive lines land at fractional offsets of 0, .547, .094, .641, .188 and each antialiases differently — the ruling visibly shimmers, and the 0.2mm rule is 0.75px wide and can never be crisp at all. A `rem` grid puts every line on a whole pixel at any integer root size. If you are ever tempted to make this dimensionally faithful again, that is the wall you will hit.

  Measured: text 16.1:1 against its ground in copie and 15.3:1 in ardoise, the grid 1.4:1 and 1.5:1 — present, never competing. Do not extend `.carreaux` to another surface without redoing that measurement.

- **i18n:** `fr` is both the default and the fallback, `en` alongside. Every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `en.json` — a parity test fails the build otherwise. Plurals use i18next v4 suffixes (`_one` / `_other`). Never pass an interpolation variable named `count` unless you actually want plural resolution.
- **Pupils are shown surname first and in capitals** — "BERNARD Adam" — through `PupilName` in `design-system/components/`, which is the only place a pupil's name is composed. Render a name any other way and it will drift: the app previously did it at eleven call sites and three of them fell out of convention. `format="surname"` is the narrow-cell form (the seat tile), and it drops the letter-spacing the full form uses, because at 10px tracking buys no legibility and costs the width capitals have already eaten.

  In a French school a pupil is called by their surname, the roster sorts by it, and the capitals disambiguate the two halves — a pupil called Marie Claire is otherwise indistinguishable from one called Claire Marie.

  **The capitals are CSS, never `toUpperCase()`.** Transforming the string would put a name nobody is called into the DOM, and from there into the accessible name (some screen readers spell all-caps out letter by letter), into copy-paste, and potentially into a comparison. The stored value stays as the teacher typed it, so export, CSV and search are unaffected — verified: searching lowercase "bernard" still matches a row rendering BERNARD. CSS `uppercase` also keeps French accents (NGUYÊN, ÉLOÏSE), which a locale-sensitive `toUpperCase()` would not guarantee.
- **Naming:** identifiers are English; only translation values are French. `class` is reserved, so the row type is `SchoolClass` while the table stays `classes`. The column row type is `GradeColumn`, never `Column` — that collides with TanStack Table's export.
- **Navigation** uses Chicane `<Link to={Router.X({...})}>`. A raw `<a href>` causes a full page reload.
- **State bound to a record must be anchored to that record's identity, never to its position.** This codebase has produced the same bug three times, in three disguises, and every instance risked writing to or deleting the wrong student:
  - A form bound to a record needs a `key` that changes with the record — `react-hook-form` captures `defaultValues` at mount, so without one, switching the edit target writes one student's values onto another.
  - A row-local armed/confirm state needs the table's React key to be the record id. TanStack Table's `row.id` defaults to the **row index**, so `DataTable` takes a `getRowId` and callers must pass it; otherwise sorting or searching while a delete is armed retargets it onto whoever now sits at that index.
  - A control acting on a *selected* record (the period delete beside the switcher) needs a `key` on that selection, or changing the selection while armed destroys the newly selected one.
  - The seating plan's `held` pupil is anchored to a pupil id (when held from the rail) or a seat's `[row, col]` coordinates (when held from a seat), never a rail index — the rail reorders on every placement, so an index-held selection would retarget onto whoever slid into that slot.
  - The pupil card selected from the seating plan takes `key={student.id}`, for the same reason as the student edit form: switching the selected pupil must reset the card's local draft state (notes, behaviour comment) rather than carrying it onto the next pupil.
  - The rubric grid's selected criterion (`RubricGrid` in `src/modules/rubric/grid.tsx`) is held as a criterion **id**, never its index in the list. If a criterion is edited or deleted elsewhere while the grid is open, an id that no longer matches falls back to the first criterion rather than silently pointing at whatever criterion now occupies that position.
  When you add any armed, staged, or draft state, ask what happens if the underlying list reorders or the selection changes underneath it.
- IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.

### Schema changes are disposable, not migrated

The Dexie schema is declared as a single `db.version(2).stores({...})` with no upgrade callback. Phase 2A's five new tables did not get a migration from phase 1 data: there is nothing to migrate, since attendance and behaviour didn't exist before, and any stray v1 test data is treated as garbage the "supprimer toutes les données" wipe in Réglages already handles. `backup.ts` follows the same posture — a v1 backup file is rejected outright by `WorkspaceBackup`'s schema check, not upgraded, since importing it half-populated (gradebooks but no sessions) would be worse than refusing it. The rule for the next schema change: add a table or a field, bump the version, do not write an upgrade function — a stale workspace gets wiped, not migrated.

You do **not** need to touch `wipeWorkspace` or the backup's clear list when adding a table: both read `db.tables`. You **do** need to add the table to `backup.ts` by hand — the export builds a literal — and to seed a row for it into the wipe test and the schema table-list test. Those two will fail until you do; that is the guard, not an oversight.

The backup case has its own guard because it was missed once: `diaryEntries` was absent from export and import for a whole commit while every backup test passed. The double-import test compares row counts across two imports, so a table missing from the backup *entirely* keeps its count on both passes and looks healthy — it only ever caught a table written but not cleared. Two tests in `backup.test.ts` now close that: one asserts the export carries an array for every table in `db.tables`, the other seeds, exports, wipes, re-imports and asserts every table's count survives. `onWipe` once cleared a hand-written list of seven tables, so the ten added after v1 survived "supprimer toutes les données" while `PRIVACY.md` promised the erase took the whole workspace.

### The demo school seeds exactly once

`seedIfEmpty(db, workspaceId)` gates on a marker in `localStorage` (`profs-seeded-workspaces`), not on the tables being empty. That is deliberate: wiping all data in Réglages must stay wiped, because `PRIVACY.md` promises the erase is permanent, and gating on emptiness resurrected the demo school on the next reload.

Consequence when developing: once a workspace has been seeded, emptying the tables will **not** bring the demo data back. To get it back, remove that key from `localStorage` and reload.

### Testing posture

Domain and `src/db` modules are TDD, tested against `fake-indexeddb` (`import "fake-indexeddb/auto"` at the top of the suite). Jest runs in the `node` environment, so `jest.setup.js` supplies a `localStorage` shim that the workspace registry and the seed marker need. **There are deliberately no component tests** (matching the sibling `open-setlist` project) — UI is verified by reading and by driving a real browser against `yarn dev` on port 3000. That is also why blocking dialogs are banned: they freeze that automation.

When you change UI, prove the flow rather than asserting it. If you cannot drive a browser, a throwaway Node script exercising the real `src/db` code against `fake-indexeddb` through the whole lifecycle catches wiring errors before review does.

### Deleting things

Every multi-table delete lives in `src/db/cascade.ts` (`deleteStudent`, `deleteColumn`, `deletePeriod`, `deleteGradebook`, `deleteClass`, phase 2A's `deleteSession` and `deleteSeatingLayout`, and phase 2B's `deleteRubricAssessment` and `deleteRubricTemplate`), each one a single `rw` transaction covering every table it touches. `deleteBehaviourEvent` is single-table but lives here too, so every delete is in one place. `setCriteria` in `src/db/rubrics.ts` is the same pattern at a finer grain: replacing an assessment's criteria list drops the `rubricScores` of any criterion that didn't survive, in one transaction, beside the write rather than as an inline component delete. If you find yourself writing a multi-table delete inline in a component, stop and add it there with tests instead — an orphaned grade row is invisible in the UI, never averaged, and survives export/import.

`deleteGradebook` is the exception that **unlinks** rather than cascades: it
clears `gradebookId` on every schedule entry pointing at it and leaves the
entry standing. The lesson still happens; it just no longer opens onto a grid.
Deleting a gradebook must never delete part of a teacher's timetable.

`deleteSubject` is the exception that **refuses** rather than cascades: it returns `{ deleted: false, reason: "in-use", gradebookCount }` and writes nothing when a gradebook still references the subject. Destroying gradebooks as a side effect of removing a subject is too much to do implicitly.

Destructive actions in the UI go through `ConfirmButton` (two-step, in place). Its confirm label should say what else goes — the column delete names its grades, the class delete names its students and their grades, the period delete names the period.

## Known v1 gaps

- No sync of any kind. JSON export/import in Réglages is the only way to move data between devices, and it omits student photos (they are `Blob`s and cannot survive `JSON.stringify`) — both documents say so, and any change here must keep them accurate. `Student.notes` — which can carry accommodations such as PAP, PPRE, tiers-temps — has no such exclusion and **is** included in the export; `PRIVACY.md` says so explicitly.
- Behaviour counts on the pupil page are over all events, with no period filter (`docs/BACKLOG.md` #5) — a deliberate phase 2A scope cut, not an oversight.
- Only one seating layout per class (`docs/BACKLOG.md` #4) — the schema supports several, the UI to switch between them doesn't exist yet.
- A gradebook cannot be renamed after creation, and periods cannot be reordered.
- `src/modules/classes/page.tsx` imports `ClassForm` from the class module. That crosses the module boundary this file otherwise describes; it is an accepted exception rather than an oversight, since both screens create classes. It moved here when the dashboard split into `/classes` and `/gradebooks`.
- The timetable is weekly with A/B alternation only — no arbitrary n-day rotation. French secondary runs weekly, and a day-1-to-day-10 cycle would cost every teacher complexity in the editor for a case this audience rarely has.
- The journal is one free-text box per class per day — no objectives, homework or competency fields. Structure was considered and rejected: the writing happens mid-lesson or at 21h, and search compensates. What was scoped as phase 4c (a cross-class week view) is `/diary` with the class filter off and the week view on; a second calendar over the same tables was not worth keeping in sync.
- Attachments do not exist and are not a small addition: they are the resources manager, parked with its storage-budget question unanswered, and the journal is exactly the back door they would arrive through.
- The seating plan has no drag and drop, and no fill mode with automatic arrangements — both were deliberately deferred rather than forgotten.

## Reference

- `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md` — the v1 design and its rationale
- `docs/superpowers/plans/2026-09-01-profs-gradebook-v1.md` — the implementation plan it was built from
- `docs/superpowers/specs/2026-09-02-profs-phase4a-schedule-navigation.md` — the schedule and navigation design, and the two rulings behind it
- `docs/superpowers/specs/2026-09-02-profs-phase4b-diary-calendar.md` — the journal and the calendar, and why it is not a cahier de textes
- `docs/BACKLOG.md` — post-v1 features requested by a practising teacher, with the privacy questions each one raises
- `../open-setlist/` — the sibling project this stack was copied from; when a pattern here is unclear, its equivalent file is usually the answer
