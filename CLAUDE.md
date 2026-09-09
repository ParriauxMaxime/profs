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

Node is installed through `fnm` and is **not on the default PATH** — every one
of those commands fails with `command not found` until you prepend it:
`export PATH="$HOME/.local/share/fnm/node-versions/<version>/installation/bin:$PATH"`.

```bash
yarn test src/domain/gradebook/average.test.ts
yarn test -t "normalises a /100 column"
```

## Architecture

Three layers, and review enforces the boundaries.

**`src/domain/`** — pure logic. No React, no Dexie, no I/O. This is the only place with real unit tests, and where the rules that must not drift live: grade parsing and formatting, weighted averages and class statistics, CSV roster parsing, decimal handling, default period names, the subject palette, accent-insensitive search, the workspace registry, and the room geometry. Domain constants use the `as const` array + derived type pattern and never get inlined into a component — the palette and the period names live here precisely because a component once held them.

Two decimal formatters, and picking the wrong one is a data bug. `formatDecimal` rounds to two decimals, for **display**. `formatDecimalExact` preserves full stored precision, for **seeding an editor**, so that opening a cell and committing it unchanged cannot silently rewrite the value. Both take the app's locale, never the browser's.

**`src/db/`** — Dexie. `openWorkspaceDb(workspaceId)` opens `profs-<id>`; each workspace is its own database. Twenty tables across `db.version(2)` through `version(14)` — read `src/db/index.ts` for the current shape rather than a list here. `provider.tsx` exposes `useDb()`; `init.ts` runs once before first render; `seed.ts` creates the demo school; `backup.ts` does JSON export/import; `cascade.ts` owns every multi-table delete.

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
page holds pupils with **no furniture drawn**. Each screen then has one mode,
because on each a tap has only one thing it could mean. Do not put a furniture
control back on the class page.

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

**A template stamps and ceases to exist**, and so does a preset. Nothing
records that a salle "is an arc". A shape is chosen **once, at creation**, in
the sheet behind *Nouvelle salle*: `createRoom(db, name, buildRoom(preset))`.

There is no way to re-stamp a salle that already exists, and that is a
deliberate removal, not an oversight. The editor's *Disposition* panel and the
`applyShape`/`stampOverflow` pair behind it are gone; re-arranging 204 from rows
to îlots now means dragging its tables. The cost is real — git has the code if
it needs to come back — but a live re-stamp could not coexist with the draft
below: a stamp reads as "every desk removed, N added", which is exactly the diff
that drops every `Assignment` in the salle.

**`/salles` is a grid of cards, each drawn from the salle's OWN desks** by
`RoomThumbnail` — the same component that draws a preset, so a card cannot
promise îlots and open onto rows. The whole card is the link to the editor.
There is no delete on the list: `deleteRoom` cascades into every plan taught in
the salle, so it belongs on the room's own page, one navigation away from a
mis-tap.

**The editor edits a DRAFT; only *Enregistrer* writes.** `RoomDraft`
(`src/domain/room-draft.ts`) holds the name, the floor and every desk; every
gesture goes through `addToDraft`/`moveInDraft`/`nudgeInDraft`/`removeFromDraft`
/`resizeDraft`, and `draftChanged` decides whether the button is enabled — it
asks "is there something to save", not "did you touch something", so a table
moved and moved back disarms it. `saveRoomDraft` commits the lot as one diff.

Two things about that commit are load-bearing. A desk that MOVES keeps its id,
because `Assignment` is `[planId+deskId]` and a fresh id would silently empty
the seating plan of every class in the salle; only a desk actually removed loses
its occupants. And every changed row is DELETED before the survivors are
re-added, rather than updated in place: `&[roomId+x+y]` admits no two desks on
one square, so two tables swapping — a move a teacher makes constantly — would
abort the transaction on whichever went first. Deleting a desk row is not
deleting the place; assignments are their own rows and only the removal branch
touches them.

**Nothing warns on the way out.** Chicane's `useBlocker` calls `window.confirm`
and `beforeunload` raises a native dialog — both banned here — so leaving with
an unsaved arrangement loses it. The red *Modifications non enregistrées* marker
and *Annuler* are the whole guard. Do not "fix" this with either mechanism.

The floor steppers show `Math.ceil(extent / TABLE)`. A stamped arc's frame need
not be an even number of units, and dividing rendered `7.5 Rangées` with a `+`
that stepped to 8.5.

**The salle editor drags on POINTER events, never HTML5 drag and drop.**
`draggable`/`dragstart` has no touch implementation anywhere: not in Chrome's
device emulation, not on a real tablet. While the editor used it, drag was
mouse-only — on the device this app is for, tap was not drag's equivalent but
the only gesture there was, and the table palette, which was drag-only, could
not add a table at all.

`usePointerDrag` (`src/modules/rooms/use-pointer-drag.ts`) covers mouse, pen and
touch in one path. **A press is not yet a drag**, and the wait differs by
pointer type: a mouse drags after 5px of movement, a finger must rest 250ms
first, and movement before that hold is left to the browser so a swipe starting
on a table still scrolls a room wider than the screen. That is why
`touch-action` is NOT pinned to `none` on the tiles. Once dragging has begun,
`touchmove` is cancelled for the rest of the gesture, or the browser starts
panning mid-drag and takes the pointer away as a `pointercancel`. Movement is
tracked on the document rather than through `setPointerCapture`, which refuses a
pointer id it has no live pointer for — exactly the case when a test dispatches
the sequence.

Drag and tap are one gesture with two entrances: `held` is either a desk in the
room or a new table from the palette, both end in `place`, and tapping the
palette arms a table the way tapping a desk picks one up. **The class page has no
drag.**

**A table in hand is LIFTED, not labelled.** It rises, grows a little and throws
a longer shadow, and its group takes a `z-index` so it clears its neighbours —
which is what picking something up looks like. It replaced an "En main" caption
and a blue outline: the outline competed with the borders that draw the
furniture itself, and the caption wrote a word on a table. The ghost says where
it will land, so nothing needs saying twice.

The editor is one card and the plan, and nothing else. The card stacks
everything about the salle ITSELF — its name, its places, its floor, and the
table you add to it, drawn as the thing it becomes. It replaced a panel holding
a single control and two paragraphs of instructions. With those gone the
keyboard path lives in `aria-keyshortcuts` and the tile's accessible name, where
it costs no pixels — if you add a gesture here, put it there too, because there
is no longer anywhere on screen to explain it. The floor's minimum is said by
`−` disabling at it, not by a sentence beside it. The plan centres with
`justify-content: safe center`: plain `center` clips the start of a room wider
than its column, and no scrollbar recovers it.

**Where a dropped table lands is `snapToPlace`, and the two bugs behind it
bracket the problem.** A grid of whole TABLES could not express the odd rows the
generators produce — they step rows by `TABLE + ROW_GAP` — so a table lifted out
of one could never be dropped back on its own square. A grid of single units
(`snapCell`) expresses every square and lost all magnetism: the eight squares
around a notch are legal too, so an aim a unit off dropped the table BESIDE the
gap it came from, silently, and the pair never re-formed.

So the grid stays one unit and the pull comes from the FURNITURE. A square
sharing a full edge with an existing table — the same adjacency that draws two
desks as one surface — costs `MAGNET` (0.6 units) less than its distance, so it
wins when the pointer is near it and loses when the teacher aims elsewhere.
Illegal squares are never candidates, which is what lets a notch beat its own
neighbours. The magnet is deliberately under one unit: rows sit three units
apart, which is not abutment, and a stronger pull would stick a new row to the
row above it. Tests cover both bugs — every template's squares are expressible,
and a sloppy aim near a notch lands in it.

The canvas reports where the pointer IS, unsnapped; the editor resolves the
square, because which square you get depends on the furniture and on which
table is in hand — neither of which `RoomCanvas` knows.

**Salles is a drawer destination.** That looks like a violation of the
rule keeping workspace management out of the drawer and is not: that rule is
about *configuration*. Once furniture belongs to the établissement rather than
to a class, a salle is *content*, like Élèves.

`deleteRoom` **cascades rather than refuses**, unlike `deleteSubject`. Destroying
gradebooks as a side effect of removing a subject is too much to do implicitly;
an arrangement is rebuilt in a minute, and refusing would strand a salle behind
classes no longer taught. The confirm dialog names the classes that lose one.
`deleteClass` takes its plans and leaves the salle standing. `deleteStudent`
deletes their assignments rather than emptying them — an assignment is the pair,
and there is no row left without the pupil.

`RoomCanvas` owns the floor, the scale, the board and the merged tables, and no
gesture beyond reporting where the floor was touched. It also answers
`cellAtClient` through a ref, because a pointer drag ends wherever the finger is
— possibly over a table — so the drop cell cannot come from an event's
`offsetX` on the floor the way a click's does, and it draws the `ghost` of where
the table in hand would land. Two layout facts it
earned the hard way: the element that MEASURES available width must be full
width while the one that draws the wall must be content-sized (one element
cannot be both, or the observed width becomes the room's own and the scale never
shrinks), and the scroll belongs on the measurer — below `MIN_SCALE` the room
deliberately stops shrinking, and a content-sized wall then pushes the rail off
the screen instead of scrolling.

### The class is the page

A teacher thinks in 3°B, not in carnets and rosters, so a class is **one page** — `/classes/:classId`, `src/modules/class/page.tsx` — and that page is the lesson: where they sit, what was done, and where the marks go. The four tabs it replaced (Plan de table, Élèves, Carnets, Journal) put one lesson in two places — attendance and behaviour on the plan, what was taught in a day-keyed journal, and the séance itself named by neither. Élèves (`/classes/:classId/eleves`) and Journal (`/classes/:classId/journal`) are links out, because a roster and an archive are detours and should look like one; Carnets lose their route entirely, since they are a panel here and the grid is already a full-screen route of its own. The four old tab routes survive in `src/router.ts` as `*Legacy` and redirect to the page in `app.tsx`, so an old bookmark still lands somewhere real.

**Opening the class page writes no `sessions` row.** The tab it replaced called `getOrCreateTodaySession` from an effect on mount, so glancing at a seating plan filed a lesson nobody taught — the schedule's own ruling, undone by the one screen that read it. A séance is written by the first thing actually recorded: an attendance mark, a behaviour event, note text, or *Commencer une séance*. Each awaits `ensureSeance`, and none of them is an effect. Be precise about the scope of that claim: it is about `sessions` and nothing else. `getOrCreatePlan` still writes a `seatingPlans` row from an effect the first time a class is looked at in a salle, which records an arrangement, not a lesson.

**The URL names a slot, not a row** — `/classes/:classId?date=…&at=…`, the day at local midnight and minutes from midnight. It has to: Aujourd'hui links to a lesson that has no row yet, and a link that could only name a row would be dead until someone recorded something. `resolveSlot` (`src/domain/seance.ts`) falls back to the day's first séance when the time matches nothing, because a lesson moved from 10h to 11h leaves older links naming an hour nothing sits at, and an empty screen is a worse answer than the day's first lesson. What is recorded is filed against the day the strip is SHOWING (`seanceDay`), which ends at the URL's own day before it ever reaches the clock — falling back to today from a day holding no slot at all would mark attendance under today while the screen said 3 September.

`ClassPage` loads the class, its pupils, its groups and their memberships **once** and passes them down; a child that re-queried would flash "Chargement…" over a class already on screen. The **group filter** lives there and filters the unseated rail and the roster register — never the seats, since filtering seats would leave holes in a room. The roster on the Élèves page holds a filter of its own.

**A salle is an upgrade to the register, never a prerequisite for it.** With no room in the workspace the seating region becomes a `RosterRegister`: the same pupils, the same tap opening the same `StudentCard`, the same marks. Attendance is a property of a séance, not of a chair, and a teacher who never draws a seating plan must still be able to use the app every day. The gesture is deliberately identical on both surfaces — marks set inline on a list and through a card on a plan would be two ways to record one fact, which is the duplication this app keeps refusing.

**`/gradebooks` — the flat list — was removed deliberately.** It had existed because reaching a grid meant going through a class; the judgement is that this treated a symptom, since the hop was expensive only while the class page was a dead end. A class carrying the register, the journal and the carnets is a destination, not a detour. Marking starts at Classes → the class → Carnets. Do not "fix" this back by accident: `docs/superpowers/specs/2026-09-02-profs-phase6-class-hub.md` carries the argument, and reversing it is cheap if it proves wrong.

The class's Journal is `DiaryPage`, which takes the `classId` it reads and has no class selector — the archive of one class, reached from that class. There is no cross-class journal: `/diary` and its drawer entry were removed, on the judgement that a teacher looks back at 3°B from 3°B, and that reading every class's séances at once answered a question nobody was asking. `SeanceNote` stays where it is, since the class page writes the day's note inline through it.

### The schedule predicts; it never pre-creates

A `ScheduleEntry` is a recurring **intention** — "3°B Maths, Monday 10h, week A". A `Session` is a **slot**: a lesson scheduled, taught, or merely prepared. It used to mean *a lesson happened*, and moving the note onto it broke that deliberately — a teacher writes next Thursday's plan before Thursday exists, so writing a note has to be able to bring a séance into being.

The rule that replaces the old one: **a séance with no attendance and no behaviour is not a lesson taught, and anything counting lessons must say so.** That was affordable only because the count was already right. Attendance counts **marked rows**, never sessions: `src/domain/attendance.ts` defines no default value, precisely so an unmarked pupil reads as *not recorded* rather than *present*. An empty séance therefore contributes nothing to any statistic, and the visible consequence — prepared lessons appearing in a class's séance list — is wanted.

**Materialising a session per scheduled lesson stays rejected**, for the reason it always was: every holiday, strike, cancellation and sick day would leave an empty session in a pupil's timeline, filling attendance history with lessons that never occurred. Nothing is created from the timetable, and creation is still lazy; only the set of things that trigger it grew — a mark, a behaviour event, note text, the explicit *Commencer une séance*, each through `getOrCreateSessionAt`, which reads and writes inside one transaction so StrictMode's double-invoked effects cannot produce two rows for one lesson. The consequence is that Today and the class page's séance strip each merge two lists — scheduled-but-unrecorded and recorded-but-unscheduled — and a lesson that is both must render **once**. `slotsForDay` in `src/domain/seance.ts` is that merge. It pairs a séance with a lesson of its OWN CLASS and then by time — the class is not redundant, since two classes at the same minute is legal here and Today reads every class at once, so time alone let one class's séance claim another's lesson. A séance carrying no time at all is one recorded before séances carried one; it pairs with its class's lesson, and only when it is that class's only séance of the day, since an unscheduled séance is deliberately created beside another.

`Session.startsAt` — minutes from midnight, never `"10:05"` — is what tells two lessons in one day apart; `[classId+date]` alone cannot. It records **when the lesson was** and is not a foreign key into the timetable: moving a lesson to another hour next term leaves every past séance holding the hour it actually happened at, which is right, and the URL's fallback absorbs the mismatch for links. No index is added for it — a class has a handful of séances on a day, so `[classId+date]` fetches them and the time is matched in memory.

**A lesson names a class and a matière, never a carnet.** `ScheduleEntry` carried an optional `gradebookId` that the form asked for and NOTHING read — Today and the hour grid both colour by `subjectId`, and the grid a lesson was to open onto was never built. It was redundant twice over: a `Gradebook` is itself `(classId, subjectId, name)`, so the picker asked the teacher to re-declare an association the two fields above it in the same form had already made. Where it was not redundant it was wrong — a class holding two carnets of one matière ("Écrit" and "Oral") would have had one of them pinned to every Monday 10h for the year, from a form filled in September. If a screen ever wants the grid, it resolves `(classId, subjectId)` on read and, finding two, lands on the class's Carnets rather than guessing.

Nothing enforces one carnet per (class, matière), and nothing should: a bivalent teacher's 3°B holds two carnets of two matières, and Écrit/Oral is a real way to keep one. `db.version(15)` drops the entry's `gradebookId` index; the field itself needed no version, since `.stores()` declares indexes rather than fields, and an existing row simply keeps an unread property. The backup format stays **11** — `scheduleEntries` is validated `.loose()`.

`entriesForDay` in `src/domain/schedule.ts` is the form every SCREEN needs, because the term anchor is optional and a teacher may never have set one. With none it selects the `weekCycle === "all"` entries for that weekday rather than guessing a parity — a teacher without a term start still sees what happens every week, and never sees week A's lessons on a day the app cannot name. It is one function because it was two, copied into Today and the class page, and a parity rule kept in two places eventually disagrees with itself.

A/B week parity is **derived** from a term-start date, never stored, so no calendar of weeks can drift. The anchor lives in `localStorage` (`src/domain/term.ts`, key `profs-term-start`) rather than a table: it describes this device's workspace, has no relations, and Today must know the week before the database opens.

`weekParity` in `src/domain/schedule.ts` is the most dangerous function in the app. Wrong by one, it shows the wrong lessons for a whole week — silently, and plausibly enough that a teacher blames themselves. It counts whole ISO weeks with both ends normalised to local midnight, because raw timestamp arithmetic drifts an hour at each DST change and eventually flips a week. Beyond the DST and year-boundary spot checks, a test walks 400 days and asserts parity flips only on Mondays, 57 times; a one-day slip leaves the spot checks passing. Times are minutes from midnight, never `"10:05"`. Overlap warns, never refuses — a teacher may legitimately have two things at once.

### The timetable is drawn as hours, and the geometry is domain

`/schedule` is an hour grid, not a stack of cards per day. The cards it replaced made every lesson the same size, so a free morning and a solid one looked alike and the shape of a week could only be recovered by reading times off nine cards. `src/domain/timetable.ts` holds the geometry and is `monthGrid`'s counterpart for the week, for `monthGrid`'s reason: a timetable wrong by one hour still looks exactly like a timetable, and nobody checks a timetable against another timetable.

`gridWindow` is 7h–19h **widened**, never clamped, to whole hours around anything outside it — a 6h30 lesson clamped to the top edge does not vanish, which would at least be noticed; it draws in the wrong hour. A lesson ending at exactly 19h does not widen it, or a teacher finishing at seven gets an empty hour under the grid every week.

`layoutDay` splits a column between lessons that collide, reusing columns as they free up, and gives every member of a cluster the cluster's full width — a block whose width changed halfway down a cluster would line up with nothing. Semaine A against semaine B at one hour is the common case rather than the exception, so hiding one was never an option; the strict-`<` comparison is `overlaps`'s, so 08:55 into 09:00 stays full width.

**The height is one CSS variable, not a flex chain.** `--hour` clamps around a share of `100dvh`, and every block is positioned in `calc()` off that same unit, so a block and its hour line are both `n × --hour` from the top and cannot drift apart. The floor is 3rem rather than `--control-min`: a block is a tap target, and 3rem × 55/60 is 44px exactly. The gutter column is **sized, not `auto`** — its labels are absolutely positioned, so an auto column has nothing in flow to measure and collapses, taking the left digit off every hour.

**A block is a button, and tapping it opens the editor** — there is no room for a control inside a 44px target, so `Supprimer` lives in the form as a `ConfirmButton` and is the only delete path. Below `lg` the same grid draws ONE day behind a picker, branched with `useMediaQuery`: five columns on a phone are five columns of nothing legible, and a sideways-scrolling week hides the very shape the grid exists to show.

### The journal is not a cahier de textes

France has required a **cahier de textes numérique** since circulaire 2010-136: per lesson it carries the contenu de la séance and the travail à faire, and pupils, parents and the chef d'établissement must be able to consult it. It lives in Pronote or the ENT.

This app has no network and cannot be that record. **Naming** keeps the distinction — the feature is a Journal, and no field is named after an official one. There is deliberately no on-screen disclaimer: a teacher who installed a local-only app does not need telling it is not the ENT, and the line read as defensive. `PRIVACY.md` and `README.md` carry the statement, which is where it belongs. A teacher who believed this discharged a legal obligation would be worse off than one who never installed it. Do not add a Pronote-shaped export, due dates, or a travail-à-faire field without reopening that question.

A note is a **field on `Session`** — `Session.note`, free text, written and read whole — and not a store of its own. The reasoning is `RubricAssessment.criteria`'s: there is exactly one note per séance, always read with its séance and cleared whole, which is what a field is for; a `RubricScore` is written one cell at a time, which is what a compound key is for. `setSessionNote` (`src/db/sessions.ts`) **clears** the field on blank text rather than storing `""`, the same rule `writeGrade` applies to a grade with neither value nor note — a husk survives every export and makes "does this séance have a note?" answer yes for a lesson that has none.

One note per **séance**, not per class per day. The day-keyed `DiaryEntry` this replaced was dropped by `db.version(14).stores({ diaryEntries: null })`, with no upgrade function and every existing entry lost, per the standing rule that schema changes are disposable. What the old key protected against still holds: a note must never be pinned to a clock, or moving a lesson from 10h to 11h would leave its text matching no lesson. The answer is that a note is keyed to the **séance**, which moves with it, rather than to a time — and a class taught twice in a day now carries two notes, which is what a teacher means by them.

The backup format is **11**. A version-10 file is refused whole rather than imported: its journal lived in a store that no longer exists, so half-importing it would silently drop every entry rather than refuse the file that held them.

`deleteScheduleEntry` deliberately leaves the séances alone — the lesson happened, and taking it off next term's timetable must not erase what was written about it. `deleteSession` does cascade its attendance and its behaviour events, which is why the strip puts it behind a `ConfirmButton` keyed by séance id — an armed delete must not survive onto the neighbour when the teacher taps another lesson.

`monthGrid` in `src/domain/calendar.ts` is the calendar's `weekParity`: a grid wrong by one day still looks exactly like a calendar, and nobody checks a calendar against another calendar. Its test walks every month of two years. Nothing here adds days by arithmetic — `nextDay` walks the calendar, because `+ 86_400_000` is wrong at each DST change and eventually a whole day out.

### Navigation

There is no top bar. `AdminLayout` renders one floating hamburger at the top left (44px, safe-area inset) and `AppDrawer`, which holds every destination: Aujourd'hui, Classes, Élèves, Emploi du temps, Salles, Réglages. Carnets and Journal are absent — each is reached through its class.

The drawer is not a `<dialog>`, since blocking dialogs are banned here, so it implements the discipline by hand: Escape closes, focus moves in on open and returns to the button on close, Tab is trapped, the backdrop closes on click, body scroll is locked, and the panel carries `inert` when closed so a translated-off drawer never sits silently in the tab order. Anything added to it keeps all of that.

That list now has one shared implementation, `design-system/components/modal.tsx`, behind the creation `Sheet` (bottom, kept mounted so it can slide) and every `ConfirmButton` dialog (centred, mounted only while open — a hidden panel per delete button is thirty panels in a table of thirty rows). `AppDrawer` deliberately keeps its own copy: it is the control every lesson goes through, and folding it in wants its own review rather than a ride along with someone else's screen.

`WorkspaceSwitcher` sits above the destinations and changes which établissement is open. It is not a destination and deliberately not inside the `<nav>`; its buttons are still trapped, because the trap queries the panel rather than the nav. With one école it collapses to a line of text — a switcher with nothing to switch to is a control that does nothing, sitting above the navigation used every lesson.

### The list pages are tables, and DataTable virtualizes

`/classes` and `/students` are `DataTable`, not card grids: a music teacher's
collège is sixteen classes and 360 pupils, and 360 cards is a wall.

**`DataTable` virtualizes every table it draws** — always, with no prop and no
threshold. An opt-in flag was rejected because it would silently make `size`
mandatory, and the next person to flip it would get jittering columns with
nothing to name the cause. `DataTable` has exactly three callers —
`/classes`, `/students`, and the class roster — and the cost is paid where it
buys nothing: the roster holds at most `MAX_STUDENTS_PER_CLASS` (100) pupils,
so it is the one caller paying virtualization's cost for no benefit.
`/students` is the only surface that has ever held 360; the gradebook grid,
the rubric grid and the CSV import preview each hand-roll their own
`<table>` and are not `DataTable` at all.

**Every column declares `size`, read as a unitless RATIO** and normalised to
percentages by `columnWidths` (`src/domain/table-layout.ts`). Automatic layout
sizes a column from the rows it can see, and a virtualized table only ever sees
twenty — so columns would resize as you scroll. Percentages rather than pixels
because the app runs on a phone: pixel widths guarantee a horizontal scrollbar
under a thumb already scrolling vertically. **`break-words` on every `<td>` and
`<th>` is load-bearing, not decoration**: percentages do not wrap a long value
on their own — `overflow-wrap` defaults to `normal`, which never breaks an
unbroken token — and a surname like CHEVALIER overflowed into the next cell
until it was added. A surname is exactly that: one unbroken token, in a
percentage column that is narrow on a phone.

That fit is for text. It has a stated limit for an interactive control with an
irreducible minimum: the class roster's *Supprimer* button is ~110px against
an ~88px column at 375px, because the app's `.btn` carries a 44px mid-lesson
tap floor and the label is fixed French text neither shrinks. `flex-wrap` on
the actions cell stacks the buttons and removed most of the overflow, but a
residual ~18px of horizontal overflow remains on the roster at 375px. That is
recorded here rather than hidden: the three real fixes — shrinking `.btn`
globally, an icon-only destructive action, or dropping a column on narrow
screens — are each a design change outside this work. Neither `/classes` nor
`/students` is affected; neither has an action button.

It is `useWindowVirtualizer`, not the scrollbox kind — nothing in this app has
ever scrolled inside a fixed-height panel. **`scrollMargin` is load-bearing**:
a window virtualizer measures against the document, so it must be told how far
down the page the table starts, or it renders blank until you scroll past it.
Rows are spaced by empty `<tr>` above and below rather than by
`transform: translateY`, which would take each row out of table layout and
leave the header aligned to nothing. `data-index` on each `<tr>` is required —
`measureElement` reads it, and without it every row measures onto index 0.

**A `<tr>` is never the only way to reach a row's destination.** It takes no
focus and Enter does not fire on it, so the first cell holds a real `<Link>`
and `onRowClick` is a mouse convenience layered on top, ignoring events that
start inside an `<a>` or a `<button>`.

**A list page's filter AND its sort live in its URL**, written with
`Router.replace` and never `push` — a push per keystroke makes Back walk a typed
name one character at a time, and a sort click is a change of view rather than a
navigation. `?classe` carries a class **id**, since `classes: "id, name"` leaves
the name non-unique. The sort is two params, `?sort=<columnId>&dir=asc|desc`,
mapped by `sortingFromParams` / `paramsFromSorting` in
`src/domain/table-sort.ts` — the only place that mapping is expressed, so a URL
one page writes another can read.

`sortingFromParams` takes the list of column ids it is allowed to name, and that
argument is load-bearing rather than defensive: a URL can name a column that no
longer exists — hand-edited, or bookmarked before a rename — and handing it
straight to TanStack sorts by a phantom column. It falls back to the default
order instead, the same resolve-or-ignore rule `?classe` follows for a deleted
class.

**Every handler writes every param the page owns.** `/students` now carries
four (`q`, `classe`, `sort`, `dir`), which is why its writes go through one
local `replaceParams` rather than four `Router.replace` calls: a handler that
names only the param it changes silently clears the others, costing the teacher
a filter they set and reporting nothing.

Scroll position is deliberately not restored; the filters and the sort coming
back is the part that costs redoing.

Two costs are accepted and permanent: **⌘F cannot find a row outside the
rendered window** (which is why the search box stays directly above the table),
and `aria-rowcount` / `aria-rowindex` are hand-maintained, counting the
FILTERED rows plus the header.

The class roster (`/classes/:classId/eleves`) has column widths and no
`onRowClick`: its surname cell opens the `StudentCard`, and a tap on a pupil
opening their card is the gesture of the lesson.

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
- **Stored values are raw domain strings.** Only the *display* is translated — attendance labels live under the top-level `attendance.*` key in both locale files, never inside `gradebook`. Never persist a translated label.
- **Attendance is a property of a session, not a gradebook column type.** A lesson happened on a date to a class, and that fact must not be recordable in two places. Attendance lives in the `attendance` table, keyed to a `Session`, and is set from the pupil card — opened from a seat on the plan, or from a row of the roster register when the workspace has no salle. There is no second, inline path.
- **Behaviour events are append-only.** A `BehaviourEvent` is never edited in place — `deleteBehaviourEvent` is the only correction, and a new observation is always a new row. A behaviour log records what was observed when; it is not a mutable field.
- **A class holds at most `MAX_STUDENTS_PER_CLASS` (100) pupils.** Every write site that can grow a roster enforces the ceiling — `student-form.tsx`, `csv-import.tsx` and `parseBackup` — since a rule only one of three sites knows is a rule the other two don't have. `parseBackup` refuses an over-capacity file whole, and does so before `importWorkspace` clears every table, so a refusal costs the teacher nothing.
- **Rubrics never feed an average.** A `RubricLevel` (1–4) is not a mark out of 20, and no conversion exists deliberately (`docs/BACKLOG.md` #1). `studentAverage`, `classStats` and `RubricScore` share no code path. The means and distributions in `domain/rubric.ts` are for reading a grid, never for a bulletin, and the grid says so in the UI.

### Conventions that will trip you up

- **Never `window.confirm`, `alert`, `beforeunload`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. That ban reaches library code: Chicane's `useBlocker` calls `window.confirm`, so a screen with unsaved work cannot warn on the way out and must make the unsaved state visible instead. Destructive actions open a `ConfirmButton` dialog — a heading that asks the question, a body naming what else goes, and Annuler focused so a stray Return cannot delete anything. It used to arm in place, which moved the page at the moment of the decision and forced every cascade to fit inside a button.
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

Several regression tests in `src/db/index.test.ts` build a real database at an earlier schema with `fake-indexeddb` and open it with current code — the v2 per-class layout, the v9 saved room, and the v13 day-keyed journal entry. **This seam is the blind spot: nothing else in the suite runs new code against an old row.** Every schema change from here wants such a test, one per store whose shape moved.

You do **not** need to touch `wipeWorkspace` or the backup's clear list when adding a table — both read `db.tables`. You **do** need to add it to `backup.ts` by hand, since the export builds a literal, and to seed a row for it into the wipe test and the schema table-list test. Those two will fail until you do; that is the guard, not an oversight. The backup case earned its own guard the hard way: the day-keyed journal store, since dropped in v14, was missing from export and import for a whole commit while every backup test passed, because the double-import test compares row counts across two imports and a table missing *entirely* keeps its count on both passes.

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

The demo teacher teaches **éducation musicale**, and that choice is load-bearing rather than flavour: music is an hour a week for every pupil in the building, so this teacher's roster *is* the school — sixteen classes, 6°A to 3°D, **360 pupils**, one subject, one salle. That is the shape the app has to survive, and a two-class demo never showed it. All sixteen classes plan into the same *Salle de musique*, which is what the salle/plan split exists to demonstrate.

Every pupil carries one latent **aptitude** in `[0, 1]`, and marks, behaviour, attendance and the appreciation all read from it. Drawn independently per surface, the demo showed pupils failing the carnet while the behaviour log called them exemplary, and neither read as a person. Measured on the seeded data: a "weak" appreciation averages 5,96/20, a "middle" one 11,17, a "strong" one 16,36, with the bands barely overlapping.

**The séance history is honest and therefore date-dependent.** It runs from the rentrée — 3 September of the current school year — to today, so a workspace seeded in the first week of term holds roughly one lesson per class, and classes whose hour falls on a weekday the term has not yet reached have **no séance at all**. That is not a gap; it is the "predicts, never pre-creates" distinction visible in the fixtures. `MAX_HISTORY_DAYS` caps the window at 60 days so a workspace seeded in June does not generate the whole year. The consequence for tests: **never assert an exact session, attendance or behaviour count** — those grow with the calendar. `seed.test.ts` asserts classes, pupils and carnets, which are fixed; `cascade.test.ts` asserts `sessionCount` only as `> 0`.

`cascade.test.ts` raises Jest's timeout to 30s, and the reason is measured rather than assumed: against 360 pupils `fake-indexeddb` takes nearly five seconds for a cascade Chrome completes in about 650ms. Every column those deletes filter on is indexed. If a cascade ever gets slow **in the browser**, that timeout is not the thing to raise.

### Testing posture

Domain and `src/db` modules are TDD, tested against `fake-indexeddb` (`import "fake-indexeddb/auto"` at the top of the suite). Jest runs in the `node` environment, so `jest.setup.js` supplies the `localStorage` shim the workspace registry and seed marker need. **There are deliberately no component tests** — UI is verified by reading and by driving a real browser against `yarn dev` on port 3000. That is also why blocking dialogs are banned: they freeze that automation.

When you change UI, prove the flow rather than asserting it. If you cannot drive a browser, a throwaway Node script exercising the real `src/db` code against `fake-indexeddb` through the whole lifecycle catches wiring errors before review does.

### Deleting things

Every multi-table delete lives in `src/db/cascade.ts`, each a single `rw` transaction covering every table it touches. `deleteBehaviourEvent` is single-table but lives there too, so every delete is in one place. `setCriteria` in `src/db/rubrics.ts` is the same pattern at a finer grain: replacing an assessment's criteria drops the `rubricScores` of any criterion that didn't survive, in one transaction. If you find yourself writing a multi-table delete inline in a component, stop and add it there with tests instead — an orphaned grade row is invisible in the UI, never averaged, and survives export/import.

`deleteGradebook` **does not touch the timetable**, and its transaction deliberately does not list `scheduleEntries`. It used to unlink them, clearing a `gradebookId` the entry no longer carries — see *the schedule predicts* above. The rule that paragraph enforced survives its mechanism: deleting a gradebook must never delete part of a timetable.

`deleteSubject` **refuses** rather than cascades: it returns `{ deleted: false, reason: "in-use", gradebookCount }` and writes nothing while a gradebook still references the subject. Destroying gradebooks as a side effect of removing a subject is too much to do implicitly.

Destructive actions go through `ConfirmButton`, which opens a dialog. `confirmLabel` is the heading and asks the question; `body` says what else goes — the column delete names its grades, the class delete names its pupils and their grades, the salle delete names the classes that lose a plan. Omit `body` only when there is no cascade to name.

## Known gaps

- No sync of any kind. JSON export/import in Réglages is the only way to move data between devices, and it omits student photos (`Blob`s cannot survive `JSON.stringify`); both documents say so, and any change must keep them accurate. `Student.notes` — which can carry accommodations such as PAP, PPRE, tiers-temps — **is** included, and `PRIVACY.md` says so explicitly.
- Behaviour counts on the pupil page filter by **date**, not by gradebook period, and that is deliberate: a `Period` carries no dates and belongs to a gradebook, so a class with three gradebooks has three period calendars that need not agree, while a `Session` is simply dated. Giving `Period` dates would change what marking filters by in order to fix one count. The windows are everything (default), 30 days, and the term anchor — no "trimestre", because nothing knows when one ends. `rangeStart` walks the calendar rather than subtracting milliseconds, for the `weekParity` reason. Only the counts narrow; the timeline stays complete.
- One plan per (class, salle). A class taught in two salles has two plans and picks between them by picking the salle; several NAMED arrangements of the same salle were considered and cut, since rearranging and rearranging back is cheaper than a feature. This closes `docs/BACKLOG.md` #4 differently from how it was written.
- A gradebook cannot be renamed after creation, and periods cannot be reordered.
- `src/modules/classes/page.tsx` imports `ClassForm` from the class module, crossing the boundary described above. An accepted exception, since both screens create classes.
- The timetable is weekly with A/B alternation only. French secondary runs weekly, and an n-day rotation would cost every teacher editor complexity for a case this audience rarely has.
- The journal is one free-text box per séance — no objectives, homework or competency fields. Structure was considered and rejected: the writing happens mid-lesson or at 21h, and search compensates. A class's Journal groups its séances into days, since a teacher records in lessons and looks back in days.
- Attachments do not exist and are not a small addition: they are the resources manager, parked with its storage-budget question unanswered, and the journal is the back door they would arrive through.
- The CLASS seating plan has no drag and drop, deliberately: a keyboard equivalent is needed regardless, so pick-up-then-place stays the gesture there. The salle editor does drag, on pointer events — the old "automation cannot drive it" half of this ruling was true only of HTML5 drag, and a synthesised pointer sequence drives the new one fine.
- Changing the layout of an existing salle means moving its tables by hand. Re-stamping a shape went with the Disposition panel, and with it `applyShape`, the one piece of code that could destroy the furniture while pouring each class's pupils back in reading order.
- An unsaved arrangement is lost by navigating away from the salle editor, silently. The marker and *Annuler* are the only guard the no-blocking-dialogs rule leaves available.
- `/students` renders every pupil in one virtualized list with no pagination.
  Whether 360 rows needed virtualizing was never measured — the infrastructure
  was chosen over the measurement, and
  `docs/superpowers/specs/2026-09-08-profs-virtualized-tables-design.md` is
  where to start unwinding it if the small tables prove to cost more than the
  big one saves.
- The class roster's *Supprimer* button overflows its actions column by
  ~18px at 375px, even after `flex-wrap` stacks it against *Modifier*: `.btn`'s
  44px tap floor and a fixed French label don't fit an ~88px column. Shrinking
  `.btn` globally, an icon-only destructive action, or dropping a column on
  narrow screens would each fix it, and each is a design change outside this
  work.

## Reference

- `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md` — the v1 design and its rationale
- `docs/superpowers/plans/2026-09-01-profs-gradebook-v1.md` — the implementation plan it was built from
- `docs/superpowers/specs/2026-09-02-profs-phase4a-schedule-navigation.md` — the schedule and navigation design
- `docs/superpowers/specs/2026-09-02-profs-phase4b-diary-calendar.md` — the journal, and why it is not a cahier de textes
- `docs/superpowers/specs/2026-09-02-profs-phase6-class-hub.md` — why the flat gradebook list was removed
- `docs/superpowers/specs/2026-09-03-profs-room-layouts-design.md` — the room-as-room design and the schema's primary-key change
- `docs/BACKLOG.md` — post-v1 features requested by a practising teacher, with the privacy questions each raises
- `../open-setlist/` — the sibling project this stack was copied from; when a pattern here is unclear, its equivalent file is usually the answer
