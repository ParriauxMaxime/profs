# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

`profs` is a local-only gradebook PWA for teachers — an open-source subset of iDoceo. Everything lives in the browser's IndexedDB. There is no backend, no account, and **no network request of any kind**.

That is a product requirement, not a preference: the app holds the names and grades of minors, and `README.md` / `PRIVACY.md` promise in writing that nothing leaves the device. A `fetch`, a CDN font, an analytics call or an external image would break a documented claim. If a task seems to need one, stop and raise it.

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

**Validation gate — all four must be green before any change is done:**
`yarn format && yarn lint && yarn typecheck && yarn test`

```bash
yarn test src/domain/gradebook/average.test.ts
yarn test -t "normalises a /100 column"
```

## Architecture

Three layers, and review enforces the boundaries.

**`src/domain/`** — pure logic. No React, no Dexie, no I/O. This is the only place with real unit tests, and where the rules that must not drift live: grade parsing and formatting, weighted averages and class statistics, CSV roster parsing, decimal handling, default period names, the subject palette, accent-insensitive search, the workspace registry, and the room geometry. Domain constants use the `as const` array + derived type pattern and never get inlined into a component — the palette and the period names live here precisely because a component once held them.

Two decimal formatters, and picking the wrong one is a data bug. `formatDecimal` rounds to two decimals, for **display**. `formatDecimalExact` preserves full stored precision, for **seeding an editor**, so that opening a cell and committing it unchanged cannot silently rewrite the value. Both take the app's locale, never the browser's.

**`src/db/`** — Dexie. `openWorkspaceDb(workspaceId)` opens `profs-<id>`; each workspace is its own database. Nineteen tables across `db.version(2)` through `version(8)` — read `src/db/index.ts` for the current shape rather than a list here. `provider.tsx` exposes `useDb()`; `init.ts` runs once before first render; `seed.ts` creates the demo school; `backup.ts` does JSON export/import; `cascade.ts` owns every multi-table delete.

Rubric criteria are embedded in `RubricAssessment.criteria`, but a score is its own row. A criterion is never queried, listed or deleted except through its assessment, so embedding avoids a join for something always read whole; a score is written and cleared one cell at a time, which is what a compound key is for. `createAssessmentFromTemplate` copies criteria with **fresh** UUIDs: shared ids would make a score written against one assessment silently readable from another, and improving a template later could never reach a grid already graded.

**`src/modules/<name>/page.tsx`** — one page per route, with module-local `components/`. `design-system/` holds shared UI, `shared/` the layout. There is no `src/routes/` folder. Components read the database through `useLiveQuery` and hold UI state only. Routes live in `src/router.ts` (Chicane).

### The room: a salle, and a class in it

A **salle** is physical. It belongs to the établissement, holds tables and no
pupils, and exists whether or not 3°B is in it. A **plan de table** is one class
poured into a salle. Moving Adam away from Lucas mid-lesson is neither — it is
the lesson.

That split is the whole design, and it exists because the previous room served
three activities behind two modes. *Modifier le plan* reads as "who sits where"
but turned on **furniture** editing, and did so by redefining a tap on a pupil
to mean "pick up the table underneath them". Same pixel, same tile, two
objects. Every other complication followed: three `Held` kinds, three hint
sentences, two near-identical corner buttons, floor tiles meaning *add* or
*move* or nothing depending on invisible state.

So furniture lives on `/salles/:roomId` with **no pupils drawn**, and the class
tab holds pupils with **no furniture drawn**. Each screen then has one mode,
because on each a tap has only one thing it could mean. Do not put a furniture
control back on the class tab.

**Four stores.** `Room` (id, name, width, height) is the salle; `Desk` (id,
roomId, x, y) is one place and carries no occupant; `SeatingPlan` is one class
in one salle; `Assignment` is `[planId+deskId] → studentId`, keyed exactly as
`Grade` is. `Desk` rather than `Table` because a Dexie store named `tables`
would shadow `db.tables`, which `wipeWorkspace` and the backup's clear list both
read — the same reason `SchoolClass` is not `class`.

**Three unique indexes carry rules that used to live only in careful code.**
`&[roomId+x+y]` — no two desks share a point. `&[classId+roomId]` — one plan per
class per salle, so `getOrCreatePlan` need not be trusted to keep it.
`&[planId+studentId]` — one pupil is never in two chairs, and this one is
load-bearing: seating an already-seated pupil **throws** unless the write clears
their old row first, so `applyPlacement` deletes before it puts. Tests assert
the DATABASE refuses each, not merely that our code avoids it; without them the
ordering is untested ceremony a reader could reverse.

**One placement rule.** `resolvePlacement(held, target)` where `held` is
`{ studentId, fromDeskId: string | null }`: whoever occupies the target goes
where the held pupil came from. From a desk they swap; from the rail, "there" is
the rail, so displacement is the general rule with an empty origin rather than a
case of its own. An empty target degrades it to a move with no branch. There is
one hint sentence, because there is one rule.

**A tap on a pupil opens their card. Always.** That is the gesture of the lesson
— attendance and behaviour — and it has no exceptions now. *Déplacer* is the
card's primary action, above the register, because mid-lesson rearrangement is
frequent and has no other path. *Retirer de sa place* replaces the old `↩` and
reads as an action on a person rather than a symbol on a tile.

**Merging is a rendering, never a datum.** Two desks exactly `TABLE` apart draw
as one continuous surface, so *tables de deux*, *îlots* and a *fer à cheval* all
fall out of adjacency. `tableGroups` finds the components; `freeEdges` borders
each place only where no sibling abuts, which is what gives a horseshoe its
opening — outlining a group's bounding box paints the aisle solid. If the merge
changed capacity, "is this one table or two" would become a question the
assignment model has to answer, and it would answer it wrong every time a desk
moved.

**Adjacency was always legal.** `overlaps` tests `|dx| < TABLE`, so touching
desks have always passed `canPlace`. What kept them apart was the generators
stepping by `PITCH` between every DESK. Air belongs between GROUPS: `AISLE`
between tables in a row, `ROW_GAP` between rows. A consequence worth knowing —
the old `îlots` template did not make islands, it made 2×N spaced desks.

**`frame` keeps two units of margin, not one.** With one, a fully stamped room
has zero placeable squares — `canPlace` refuses anything within `TABLE` on both
axes and candidates step by `TABLE` — so "Ajouter une table" has nowhere to go.

**The arc is a parabola, not a circle.** It used to derive a radius from an
angular span with seats spaced ALONG the arc, which meant ten seats needed an
enormous radius: ~1580px wide and two units deep at every setting, with `curve`
barely moving the width. Seats now step by `PITCH` on X and bow on Y, so width
is `(perRow - 1) * PITCH + TABLE` — the same as a straight row — and `curve` is
the depth of the bow, which is what a teacher means by it. This is also why
`ARC_SPACING` and its sqrt(2) derivation are gone: neighbours differ by `PITCH`
on X, and a per-axis test clears on X alone whatever the bow does to Y.

**A template stamps and ceases to exist**, unchanged from before, and so does a
preset. Nothing records that a salle "is an arc". `applyShape` destroys the
tables and spares the ARRANGEMENT: each plan's pupils are poured back in reading
order, and whoever no longer fits is reported as `overflow` per plan **before**
the write — a salle is shared, so a stamp reseats every class taught in it.

**Drag is primary on the salle editor; tap is kept as its equivalent.** This
departs from the no-drag ruling deliberately. That ruling was written for the
plan a teacher taps mid-lesson; the salle editor is used once, sitting down.
Keeping the tap path costs nothing (both share one `heldDeskId`), supplies the
keyboard equivalent, and is the only reason the screen can be verified at all —
a synthesised drag fires no HTML5 drag events. **The class tab has no drag.**

**Salles is a seventh drawer destination.** That looks like a violation of the
rule keeping workspace management out of the drawer and is not: that rule is
about *configuration*. Once furniture belongs to the établissement rather than
to a class, a salle is *content*, like Élèves.

`deleteRoom` **cascades rather than refuses**, unlike `deleteSubject`. Destroying
gradebooks as a side effect of removing a subject is too much to do implicitly;
an arrangement is rebuilt in a minute, and refusing would strand a salle behind
classes no longer taught. The `ConfirmButton` names the classes that lose one.
`deleteClass` takes its plans and leaves the salle standing. `deleteStudent`
deletes their assignments rather than emptying them — an assignment is the pair,
and there is no row left without the pupil.

`RoomCanvas` owns the floor, the scale, the board and the merged tables, and no
gesture beyond reporting where the floor was touched. Two layout facts it
earned the hard way: the element that MEASURES available width must be full
width while the one that draws the wall must be content-sized (one element
cannot be both, or the observed width becomes the room's own and the scale never
shrinks), and the scroll belongs on the measurer — below `MIN_SCALE` the room
deliberately stops shrinking, and a content-sized wall then pushes the rail off
the screen instead of scrolling.

### The class is the page

A teacher thinks in 3°B, not in carnets and rosters, so a class is **one page with four tabs** — Plan de table, Élèves, Carnets, Journal — with a route per tab (`src/modules/class/page.tsx` is the shell, `tabs/` holds the four). `ClassPage` loads the class, its pupils, its groups and their memberships **once** and passes them down as `ClassTabProps`; a tab that re-queried would flash "Chargement…" over a class already on screen. The grid stays a full-screen route outside the tabs, because a tab bar above a wide scrolling table costs vertical space on the one screen with none to spare.

Two selections live in the shell and must stay there: the **group filter** (filtering the roster to Groupe A and finding the plan unfiltered reads as a bug) and the **selected session**. The session is why a roster row can open the pupil card at all — attendance belongs to a lesson, so the card shows the register only when a session is selected, and says so when there is none. A second attendance path from the roster is exactly the duplication this design refused.

**`/gradebooks` — the flat list — was removed deliberately.** It had existed because reaching a grid meant going through a class; the judgement is that this treated a symptom, since the hop was expensive only while the class page was a dead end. A class carrying the register, the journal and the carnets is a destination, not a detour. Marking starts at Classes → the class → Carnets. Do not "fix" this back by accident: `docs/superpowers/specs/2026-09-02-profs-phase6-class-hub.md` carries the argument, and reversing it is cheap if it proves wrong.

The journal tab is `DiaryPage` with a `classId` prop that pins the class and hides the selector — not a second calendar over the same tables.

### The schedule predicts; it never pre-creates

A `ScheduleEntry` is a recurring **intention** — "3°B Maths, Monday 10h, week A". A `Session` records that a lesson happened, and carries the attendance and behaviour. Today lists scheduled lessons; opening one calls `getOrCreateTodaySession`, so a session row appears only when the teacher starts recording.

Materialising a session per scheduled lesson was rejected and must stay rejected: every holiday, strike, cancellation and sick day would leave an empty session in a pupil's timeline, filling attendance history with lessons that never occurred. The consequence is that Today merges two lists — scheduled-but-not-started and started-but-unscheduled — and a lesson that is both must render **once**.

A/B week parity is **derived** from a term-start date, never stored, so no calendar of weeks can drift. The anchor lives in `localStorage` (`src/domain/term.ts`, key `profs-term-start`) rather than a table: it describes this device's workspace, has no relations, and Today must know the week before the database opens.

`weekParity` in `src/domain/schedule.ts` is the most dangerous function in the app. Wrong by one, it shows the wrong lessons for a whole week — silently, and plausibly enough that a teacher blames themselves. It counts whole ISO weeks with both ends normalised to local midnight, because raw timestamp arithmetic drifts an hour at each DST change and eventually flips a week. Beyond the DST and year-boundary spot checks, a test walks 400 days and asserts parity flips only on Mondays, 57 times; a one-day slip leaves the spot checks passing. Times are minutes from midnight, never `"10:05"`. Overlap warns, never refuses — a teacher may legitimately have two things at once.

### The journal is not a cahier de textes

France has required a **cahier de textes numérique** since circulaire 2010-136: per lesson it carries the contenu de la séance and the travail à faire, and pupils, parents and the chef d'établissement must be able to consult it. It lives in Pronote or the ENT.

This app has no network and cannot be that record. **Naming** keeps the distinction — the feature is a Journal, and no field is named after an official one. There is deliberately no on-screen disclaimer: a teacher who installed a local-only app does not need telling it is not the ENT, and the line read as defensive. `PRIVACY.md` and `README.md` carry the statement, which is where it belongs. A teacher who believed this discharged a legal obligation would be worse off than one who never installed it. Do not add a Pronote-shaped export, due dates, or a travail-à-faire field without reopening that question.

`DiaryEntry` is keyed `[classId+date]` and carries **no `sessionId`**; that absence is load-bearing. An entry is writable before the lesson happens, so had the text lived on `Session`, writing next Thursday's plan would create a session for a lesson nobody taught and quietly undo the ruling above. The two join at read time only, and a test counts sessions before and after writing a future entry.

One entry per class per day, not per lesson slot: keying on a start time would pin text to a clock, so moving a lesson from 10h to 11h would make its entry match no lesson and vanish. A class taught twice in one day shares an entry, which is accepted.

`deleteScheduleEntry` deliberately leaves the journal alone — the lesson happened, and taking it off next term's timetable must not erase what was written about it.

`monthGrid` in `src/domain/calendar.ts` is the calendar's `weekParity`: a grid wrong by one day still looks exactly like a calendar, and nobody checks a calendar against another calendar. Its test walks every month of two years. Nothing here adds days by arithmetic — `nextDay` walks the calendar, because `+ 86_400_000` is wrong at each DST change and eventually a whole day out.

### Navigation

There is no top bar. `AdminLayout` renders one floating hamburger at the top left (44px, safe-area inset) and `AppDrawer`, which holds every destination: Aujourd'hui, Classes, Élèves, Emploi du temps, Journal, Réglages. Carnets is absent — a carnet is reached through its class.

The drawer is not a `<dialog>`, since blocking dialogs are banned here, so it implements the discipline by hand: Escape closes, focus moves in on open and returns to the button on close, Tab is trapped, the backdrop closes on click, body scroll is locked, and the panel carries `inert` when closed so a translated-off drawer never sits silently in the tab order. Anything added to it keeps all of that.

`WorkspaceSwitcher` sits above the destinations and changes which établissement is open. It is not a destination and deliberately not inside the `<nav>`; its buttons are still trapped, because the trap queries the panel rather than the nav. With one école it collapses to a line of text — a switcher with nothing to switch to is a control that does nothing, sitting above the navigation used every lesson.

### One workspace per school

A `Workspace` (`src/domain/workspaces.ts`) is one school-year: a name, a year, and its own database. The registry lives in `localStorage` because `DbProvider` must know which database to open before any database is open. Switching writes the active id and nothing else — the provider re-opens on it through `useSyncExternalStore`, and **every** `useLiveQuery` in the app takes `db` in its dependency array, which is what makes a switch re-read the whole app without a reload. A live query that forgets `db` keeps rendering the previous school's pupils; watch for that when adding one.

Creation goes through `createWorkspace`, never `addWorkspace`: it marks the new workspace **seeded** immediately. `initWorkspace` runs `seedIfEmpty` at every boot, so a school a teacher created would otherwise be handed the demo school's classes on the next reload. Only `ensureDefaultWorkspace` leaves the marker unset, because the demo data introduces an empty app rather than filling in a real school.

Deleting takes both halves: `removeWorkspace` drops the registry entry, and `deleteWorkspaceDb` deletes `profs-<id>`. The entry alone is not the deletion `PRIVACY.md` promises — the pupils' names would still sit in IndexedDB, invisible and unreachable. Deleting the last workspace is allowed, and the replacement is created **before** the removal, because in the instant between them `activeWorkspaceId()` would be null and the provider would have nothing to open.

Management (create, rename, delete) lives in Réglages rather than the drawer: a teacher changes school far more often than they create one, and a destructive delete does not belong in the navigation.

### Invariants worth knowing before you touch anything

- **Grades use the compound primary key `[gradebookId+columnId+studentId]`.** That is the whole point of the schema: editing one cell is a single-row `put`, clearing it a single-row `delete`. Never read-modify-write a collection of grades. Build the key with `gradeKey()` — the only constructor.
- **Averages are computed on read, never stored.** A stored average goes stale the moment a weight changes. `studentAverage` takes the FULL column list plus a `periodId` and filters internally — passing an already-filtered list changes results silently.
- **Every numeric column is normalised to /20 by its own `max`** before weighting, so a /100 test and a /20 test can be averaged together. Only numeric columns count toward an average.
- **Three distinct input outcomes, and they must stay distinct**: blank *clears* the cell (deletes the row), a valid value *stores*, and an invalid one (unparseable, negative, above `max`) is *refused* — nothing is written, the existing mark survives, and the bad input stays visible for correction. Both the grid cell and the fast-entry screen implement this; `isBlankInput` and `parseGradeValue` in `domain/gradebook/grade.ts` are the shared rule.
- **A grade row with neither a `value` nor a `note` must never be stored.** `Grade.note` is free text independent of `value`, and a note can exist before a mark does ("absent, à rattraper"), so both are optional — but `writeGrade` and `setGradeNote` (`src/db/grades.ts`) delete the row outright rather than leave an empty husk. Like `Student.notes`, a note is included in the JSON export, and `PRIVACY.md` says so.
- **A `calculation` column stores nothing.** Its value — `mean`, `sum`, `bestOf` or `count` over chosen numeric columns — is derived on read by `evaluateCalculation`, never written as a grade row. This is deliberate: French marking already expresses weighting through `column.weight`, so a calculation feeding `studentAverage` would duplicate that mechanism while risking a silently wrong bulletin, the one failure this app cannot afford. `isNumericColumn` stays false for it, `parseGradeValue` refuses it, and `EditableCell` renders it read-only. A calculation may not reference another, so no cycle can exist. `deleteColumn` prunes the deleted id out of every `sourceColumnIds` in the same transaction — otherwise a calculation would change meaning while still rendering a plausible number.
- **Stored values are raw domain strings.** Only the *display* is translated (`gradebook.attendance.*`). Never persist a translated label.
- **Attendance is a property of a session, not a gradebook column type.** A lesson happened on a date to a class, and that fact must not be recordable in two places. Attendance lives in the `attendance` table, keyed to a `Session`, and is set from the seating plan's pupil card.
- **Behaviour events are append-only.** A `BehaviourEvent` is never edited in place — `deleteBehaviourEvent` is the only correction, and a new observation is always a new row. A behaviour log records what was observed when; it is not a mutable field.
- **A class holds at most `MAX_STUDENTS_PER_CLASS` (100) pupils.** Every write site that can grow a roster enforces the ceiling — `student-form.tsx`, `csv-import.tsx` and `parseBackup` — since a rule only one of three sites knows is a rule the other two don't have. `parseBackup` refuses an over-capacity file whole, and does so before `importWorkspace` clears every table, so a refusal costs the teacher nothing.
- **Rubrics never feed an average.** A `RubricLevel` (1–4) is not a mark out of 20, and no conversion exists deliberately (`docs/BACKLOG.md` #1). `studentAverage`, `classStats` and `RubricScore` share no code path. The means and distributions in `domain/rubric.ts` are for reading a grid, never for a bulletin, and the grid says so in the UI.

### Conventions that will trip you up

- **Never `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use a two-step in-place confirm: first click arms, second acts, with a cancel beside it.
- **Typography.** The app is set in **Luciole** (CC BY 4.0), bundled under `src/assets/fonts/` and emitted as a hashed asset — never fetched, because a font CDN would break the no-network promise as surely as an analytics call. It is sans-only, so heading hierarchy comes from weight and size; do not reintroduce Georgia.

  `.carreaux` in `global.css` is the squared writing surface — petits carreaux, the 5mm grid used from collège onward — applied to **exactly one element**, the journal textarea. Ruling was tried app-wide and cut for reading as texture.

  Three things make it work and all three must survive any edit. `line-height` equals two grid squares. `padding-top` subtracts the baseline offset (`calc(2rem - 1.2425em)`) so the first baseline lands *on* a line rather than floating above it, since matching the pitch alone leaves text centred in its line box. And the grid is sized in **`rem`, never `mm`** — a millimetre Séyès grid lands consecutive lines on fractional pixel offsets that each antialias differently, so the ruling visibly shimmers, and its 0.2mm rule can never be crisp at all. A `rem` grid puts every line on a whole pixel at any integer root size.

  Measured: text 16.1:1 against its ground in copie and 15.3:1 in ardoise, the grid 1.4:1 and 1.5:1 — present, never competing. Do not extend `.carreaux` to another surface without redoing that measurement.
- **i18n:** `fr` is both default and fallback, `en` alongside. Every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `en.json` — a parity test fails the build otherwise. Plurals use i18next v4 suffixes (`_one` / `_other`). Never pass an interpolation variable named `count` unless you want plural resolution.
- **Pupils are shown surname first and in capitals** — "BERNARD Adam" — through `PupilName` in `design-system/components/`, the only place a pupil's name is composed. Render a name any other way and it will drift: the app previously did it at eleven call sites and three fell out of convention. `format="surname"` is the narrow-cell form (the seat tile) and drops the letter-spacing, because at 10px tracking buys no legibility and costs width the capitals already ate. In a French school a pupil is called by their surname, the roster sorts by it, and the capitals disambiguate the halves — Marie Claire is otherwise indistinguishable from Claire Marie.

  **The capitals are CSS, never `toUpperCase()`.** Transforming the string would put a name nobody is called into the DOM, and from there into the accessible name (some screen readers spell all-caps out letter by letter), into copy-paste, and potentially into a comparison. The stored value stays as typed, so export, CSV and search are unaffected — searching lowercase "bernard" still matches a row rendering BERNARD. CSS `uppercase` also keeps French accents (NGUYÊN, ÉLOÏSE), which a locale-sensitive `toUpperCase()` would not guarantee.
- **Naming:** identifiers are English; only translation values are French. `class` is reserved, so the row type is `SchoolClass` while the table stays `classes`. The column row type is `GradeColumn`, never `Column` — that collides with TanStack Table's export.
- **Navigation** uses Chicane `<Link to={Router.X({...})}>`. A raw `<a href>` causes a full page reload.
- **State bound to a record must be anchored to that record's identity, never to its position.** This codebase has produced the same bug in several disguises, and every instance risked writing to or deleting the wrong pupil:
  - A form bound to a record needs a `key` that changes with the record — `react-hook-form` captures `defaultValues` at mount, so without one, switching the edit target writes one pupil's values onto another.
  - A row-local armed state needs the table's React key to be the record id. TanStack Table's `row.id` defaults to the **row index**, so `DataTable` takes a `getRowId` and callers must pass it; otherwise sorting while a delete is armed retargets it onto whoever now sits at that index.
  - The same applies to a control acting on a *selected* record, to the seating plan's `held` value (a pupil id or a table id, never a rail index or a position), to the pupil card's `key={student.id}`, and to the rubric grid's selected criterion id.

  When you add any armed, staged or draft state, ask what happens if the underlying list reorders or the selection changes underneath it.
- IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.

### Schema changes are disposable, not migrated

The Dexie schema is a chain of `db.version(...).stores({...})` bumps with no upgrade callbacks, and that is deliberate. There is nothing to migrate — a stale workspace gets wiped by "supprimer toutes les données" in Réglages, not upgraded. `backup.ts` takes the same posture: a v1 file is rejected outright by `WorkspaceBackup`'s schema check, since importing it half-populated would be worse than refusing it. **The rule: add a table or a field, bump the version, write no upgrade function.**

That rule had only ever been exercised by bumps that *added* a table, and it does not cover a changed primary key. Dexie refuses one outright, throwing `UpgradeError: Not yet support for changing primary key` while opening the database; `init.ts` has no catch, so every teacher with an existing workspace would hit a blank screen — not wiped, **bricked**, with their data still in IndexedDB and no route to the wipe in Réglages. The sanctioned way is two versions, not one: drop the store to `null` in its own version (`db.version(7).stores({ seats: null, seatingLayouts: null })`), then declare the new shape in the version after.

`seatingLayouts` was dropped alongside `seats`, and the reason generalises: **a store whose SHAPE changed must be dropped even when its key did not.** Its key was still `id`, so Dexie would have carried a v6 room forward untouched, feeding `rows`/`cols` into code reading `width`/`height`. That row is worse than a crash: `layout.width * UNIT_PX` is `NaN`, the room renders at `transform: scale(NaN)`, `floorSlots` produces nothing, and `addTable` refuses every placement — a silently broken screen, and a backup taken in that window exports the zombie row intact, since the schema is `{id}.loose()`.

Two regression tests in `src/db/index.test.ts` build a real v2→v6 database with `fake-indexeddb` and open it with current code. **This seam is the blind spot: nothing else in the suite runs new code against an old row.** Every schema change from here wants such a test, one per store whose shape moved.

You do **not** need to touch `wipeWorkspace` or the backup's clear list when adding a table — both read `db.tables`. You **do** need to add it to `backup.ts` by hand, since the export builds a literal, and to seed a row for it into the wipe test and the schema table-list test. Those two will fail until you do; that is the guard, not an oversight. The backup case earned its own guard the hard way: `diaryEntries` was missing from export and import for a whole commit while every backup test passed, because the double-import test compares row counts across two imports and a table missing *entirely* keeps its count on both passes.

### A database that will not open must never be a blank page

`src/main.tsx` catches `initWorkspace()` rejecting and renders `RecoveryShell`
(`src/modules/recovery/shell.tsx`) instead of the app. Without that catch the
promise never reaches `render`, React never mounts, and the teacher gets a
blank page — with their pupils still in IndexedDB and no route to the wipe in
Réglages, to the export, or to the workspace switcher, because none of those
screens exist until React has mounted. The app is the only copy of the data.

`classifyOpenFailure` (`src/domain/recovery.ts`) picks the branch, and **the
default is the recoverable one**: anything unrecognised is `corrupt`, which
offers the discard. That is what makes "disposable, not migrated" mean *wiped
on the next boot* rather than *bricked*, and a test asserts it for
`UpgradeError` — what a primary-key change throws — and for an unknown name.
Reload is offered unconditionally and has no predicate, so no branch can render
a panel with nothing on it. The discard is offered only for `corrupt` and
`quota`: inviting a teacher to delete on a transient failure would destroy a
term of marks that was never at risk.

The discard deletes the database and **keeps the registry entry**, so the
workspace returns named and empty rather than lost. No export is attempted —
an export needs the database open, which is what just failed.

`initWorkspace` opens the database explicitly rather than letting the first
query do it. `seedIfEmpty` returns immediately for an already-seeded workspace
without touching it, so on every boot after the first, nothing there opened
anything and a failure surfaced later inside a `useLiveQuery`, past the only
place that handles it.

The shell renders without `DbProvider`, without the router and without any
`useLiveQuery`, and reads the workspace registry from `localStorage` so it can
still name the school. It may use `t()`: `import "@i18n"` runs synchronously at
the top of `main.tsx`, before `initWorkspace`.

### The demo school seeds exactly once

`seedIfEmpty(db, workspaceId)` gates on a marker in `localStorage` (`profs-seeded-workspaces`), not on the tables being empty, because wiping all data in Réglages must stay wiped — `PRIVACY.md` promises the erase is permanent, and gating on emptiness resurrected the demo school on the next reload.

Consequence when developing: once a workspace has been seeded, emptying the tables will **not** bring the demo data back. Remove that key from `localStorage` and reload.

### Testing posture

Domain and `src/db` modules are TDD, tested against `fake-indexeddb` (`import "fake-indexeddb/auto"` at the top of the suite). Jest runs in the `node` environment, so `jest.setup.js` supplies the `localStorage` shim the workspace registry and seed marker need. **There are deliberately no component tests** — UI is verified by reading and by driving a real browser against `yarn dev` on port 3000. That is also why blocking dialogs are banned: they freeze that automation.

When you change UI, prove the flow rather than asserting it. If you cannot drive a browser, a throwaway Node script exercising the real `src/db` code against `fake-indexeddb` through the whole lifecycle catches wiring errors before review does.

### Deleting things

Every multi-table delete lives in `src/db/cascade.ts`, each a single `rw` transaction covering every table it touches. `deleteBehaviourEvent` is single-table but lives there too, so every delete is in one place. `setCriteria` in `src/db/rubrics.ts` is the same pattern at a finer grain: replacing an assessment's criteria drops the `rubricScores` of any criterion that didn't survive, in one transaction. If you find yourself writing a multi-table delete inline in a component, stop and add it there with tests instead — an orphaned grade row is invisible in the UI, never averaged, and survives export/import.

`deleteGradebook` **unlinks** rather than cascades: it clears `gradebookId` on every schedule entry pointing at it and leaves the entry standing. The lesson still happens; it just no longer opens onto a grid. Deleting a gradebook must never delete part of a timetable.

`deleteSubject` **refuses** rather than cascades: it returns `{ deleted: false, reason: "in-use", gradebookCount }` and writes nothing while a gradebook still references the subject. Destroying gradebooks as a side effect of removing a subject is too much to do implicitly.

Destructive actions go through `ConfirmButton` (two-step, in place). Its confirm label should say what else goes — the column delete names its grades, the class delete names its pupils and their grades.

## Known gaps

- No sync of any kind. JSON export/import in Réglages is the only way to move data between devices, and it omits student photos (`Blob`s cannot survive `JSON.stringify`); both documents say so, and any change must keep them accurate. `Student.notes` — which can carry accommodations such as PAP, PPRE, tiers-temps — **is** included, and `PRIVACY.md` says so explicitly.
- Behaviour counts on the pupil page filter by **date**, not by gradebook period, and that is deliberate: a `Period` carries no dates and belongs to a gradebook, so a class with three gradebooks has three period calendars that need not agree, while a `Session` is simply dated. Giving `Period` dates would change what marking filters by in order to fix one count. The windows are everything (default), 30 days, and the term anchor — no "trimestre", because nothing knows when one ends. `rangeStart` walks the calendar rather than subtracting milliseconds, for the `weekParity` reason. Only the counts narrow; the timeline stays complete.
- One plan per (class, salle). A class taught in two salles has two plans and picks between them by picking the salle; several NAMED arrangements of the same salle were considered and cut, since rearranging and rearranging back is cheaper than a feature. This closes `docs/BACKLOG.md` #4 differently from how it was written.
- `ScheduleEntry.room` is still free text ("B12", "Labo") and is not wired to `Room.id`. Doing so would let Today open a lesson straight onto the right salle, but it is a second migration with its own question — what happens to a timetable naming a room nobody created.
- A gradebook cannot be renamed after creation, and periods cannot be reordered.
- `src/modules/classes/page.tsx` imports `ClassForm` from the class module, crossing the boundary described above. An accepted exception, since both screens create classes.
- The timetable is weekly with A/B alternation only. French secondary runs weekly, and an n-day rotation would cost every teacher editor complexity for a case this audience rarely has.
- The journal is one free-text box per class per day — no objectives, homework or competency fields. Structure was considered and rejected: the writing happens mid-lesson or at 21h, and search compensates. The cross-class week view is `/diary` with the class filter off.
- Attachments do not exist and are not a small addition: they are the resources manager, parked with its storage-budget question unanswered, and the journal is the back door they would arrive through.
- The seating plan has no drag and drop, deliberately: it is the one gesture the browser automation cannot drive, and a keyboard equivalent is needed regardless, so pick-up-then-place stays the gesture.

## Reference

- `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md` — the v1 design and its rationale
- `docs/superpowers/plans/2026-09-01-profs-gradebook-v1.md` — the implementation plan it was built from
- `docs/superpowers/specs/2026-09-02-profs-phase4a-schedule-navigation.md` — the schedule and navigation design
- `docs/superpowers/specs/2026-09-02-profs-phase4b-diary-calendar.md` — the journal, and why it is not a cahier de textes
- `docs/superpowers/specs/2026-09-02-profs-phase6-class-hub.md` — why the flat gradebook list was removed
- `docs/superpowers/specs/2026-09-03-profs-room-layouts-design.md` — the room-as-room design and the schema's primary-key change
- `docs/BACKLOG.md` — post-v1 features requested by a practising teacher, with the privacy questions each raises
- `../open-setlist/` — the sibling project this stack was copied from; when a pattern here is unclear, its equivalent file is usually the answer
