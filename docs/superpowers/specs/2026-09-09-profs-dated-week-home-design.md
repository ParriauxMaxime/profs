# profs — the front door as a dated week (design)

Status: designed, not yet implemented.
Builds on `2026-09-02-profs-phase4a-schedule-navigation.md` (the timetable and
its A/B parity) and the hour-grid geometry described in `CLAUDE.md` under
*The timetable is drawn as hours*.

## What This Is

`/` is a stack of cards, one per lesson today. Every card is the same height,
so a fifty-five minute lesson and a two-hour gap look alike, and the shape of
the day can only be recovered by reading times off the cards. That is the
argument that turned `/schedule` from cards into an hour grid, and it applies
to the front door with more force: `/` is the screen a teacher opens every
morning, and the question it should answer without being read is *what is left
today*.

So `/` becomes the same hour grid, drawn on **real dates** around today.

Drawing hours turns out to need something of the data model, and the second
half of this spec is that: a séance stops being allowed to have no time. The
grid is what forced the question, but the answer is an improvement on its own
— an optional `startsAt` was a hole every reader of a séance had to cover.

That is the whole difference between this screen and `/schedule`, and it is
worth saying precisely, because the two will look alike. `/schedule` draws the
**intention**: weekday columns, A/B cycle badges, no dates, and an editor
behind every block. `/` draws the **week that is actually happening**: Monday
the 7th, with the séances already recorded showing as recorded, a line where
now is, and every block a link into that lesson. One edits the recurring
template. One shows the week it produces.

## What Was Rejected

**Making `/` a working surface.** A block could have opened its `SeanceNote`
inline, so writing up the week happened on the front door instead of one round
trip per class. It was rejected because a note would then be written in two
places. This app has refused that duplication consistently — attendance has
exactly one path (the pupil card, from a seat or from the roster register), a
mark has exactly one, and the reason is always the same: two ways to record
one fact eventually disagree about what was recorded. `/` stays a signpost.

**Folding `/schedule` into `/`.** One timetable screen instead of two is
tempting, and wrong: editing a recurring entry through one particular Monday
means editing "every Monday of week A" through a surface that shows one
Monday. The abstraction that makes an alternating timetable legible would have
to be reconstructed from a dated grid every time a teacher wanted to change it.
`/schedule` keeps its weekday columns because that is what it edits.

**Copying `TimeGrid` into the new page.** Two components, no interface to
negotiate, `/schedule` untouched. Rejected because `src/domain/timetable.ts`
exists precisely to state that a timetable wrong by one hour still looks
exactly like a timetable, and nobody checks a timetable against another
timetable. Two copies of the positioning arithmetic, the `--hour` variable, the
gutter-collapse fix and the tap-floor calculation would drift, and the drift
would be invisible on both screens.

## Routes

```
/                      the week that is happening, around today
/?date=1788912000000   the week around that day
```

`Home` becomes `"/?:date"`. The parameter names a **day** — local midnight,
epoch ms — never a week, and the viewport decides what is drawn of it:

| width | drawn | `‹ ›` steps |
|---|---|---|
| ≥ `lg` | that day's whole week | 7 days |
| < `lg` | that day alone | 1 day |

One parameter serves both because a day belongs to exactly one week, and the
narrow branch is then not a different screen with a different URL — it is the
same screen showing less of itself. A link sent from a phone opens on the
right week on a tablet.

A bare `/` means today, so the app still opens on the day it is. `Aujourd'hui`
clears the parameter rather than writing today's date into it, which keeps the
common URL clean and makes the button's meaning exact.

**Every write is `Router.replace`, never `push`.** Walking to next week is a
change of view, not a navigation; with `push` the Back button would crawl
backwards one week per tap, and a teacher who walked four weeks forward and
wanted to leave would press Back four times to go nowhere.

**An unparseable or absent `date` falls back to today.** A URL can name a day
that no longer parses — hand-edited, or truncated by a chat client — and the
front door must never open on `NaN`. This is the resolve-or-ignore rule
`?classe` already follows for a deleted class and `sortingFromParams` follows
for a column that no longer exists.

## The Ruling: Every Séance Has a Start and an End

`Session.startsAt` is optional today, and the absence means "a séance recorded
before séances carried a time, or one opened outside the timetable". That
absence has to be handled by everything that reads a séance, and on an hour
grid it has no answer at all: a lesson with no time has no position.

The first draft of this design answered it with a strip under the grid, holding
the séances that could not be placed. That is a second surface, with its own
empty state, existing only to hold the consequences of an optional field.

So the field stops being optional. **A séance has a start and an end**, both
minutes from midnight, and both stored:

```ts
startsAt: number;   // was startsAt?: number
endsAt:   number;   // new
```

Where they come from, at creation:

- **From the lesson**, when the slot has a schedule entry — its `startMinute`
  and `endMinute`, copied.
- **From the clock** otherwise — `Date.now()` floored to the hour, and
  `+ DEFAULT_SEANCE_MINUTES` (55, the ordinary French lesson).

Copied, not referenced. `Session.startsAt` has never been a foreign key into
the timetable, and that stays true of `endsAt`: a lesson moved to another hour
next term leaves every past séance holding the hour it actually happened at.

**The end is editable, on the class page's séance strip**, beside the delete
that already lives there. That is where a séance is an object rather than a
context, and correcting one is something a teacher does after the fact — a
lesson that ran long is noticed when it has run long, not when it starts. The
same control edits the start, so a séance the backfill below guessed at can be
put right.

### The backfill, and why the standing rule yields

`CLAUDE.md` says schema changes are disposable: bump the version, write no
upgrade function, let a stale workspace be wiped in Réglages. Its sanctioned
move for a store whose SHAPE changed is to drop it and redeclare it in the
next version.

That move is wrong here, and the reason is worth stating so it is not
"corrected" later. `attendance` and `behaviourEvents` are both keyed to
`sessions.id`. Dropping the store destroys every séance and leaves a term of
attendance and behaviour as rows nothing reads, nothing counts, and every
export carries — the invisible-orphan failure `src/db/cascade.ts` exists to
prevent, produced deliberately by the rule meant to keep the schema simple.

So `db.version(16)` carries **the first `upgrade()` callback in this
codebase**:

```ts
startsAt ??= floorToHour(createdAt)
endsAt   ??= startsAt + DEFAULT_SEANCE_MINUTES
```

`createdAt` is the right source because of how a séance comes into being. All
four triggers — an attendance mark, a behaviour event, note text, *Commencer
une séance* — are acts performed during the lesson, so the hour a séance was
created in IS the hour it was taught in. It needs no schedule read, no term
anchor and no parity resolution inside a Dexie transaction, and the rows it
repairs are rare by construction. Where it guesses wrong, the strip's editor
is the correction.

The rule this bends is not abandoned: it stands for every change that adds a
table or a field. What it does not cover — as it already admits for a changed
primary key — is a field becoming required underneath rows that carry
dependents.

### The backup

The format goes to **12**. A version-11 file holds séances with no `startsAt`,
which the new type forbids.

It is **accepted rather than refused**, unlike the version-10 file that is
rejected whole: nothing in it is lost, because the same backfill repairs it.
`parseBackup` runs the backfill function the upgrade uses — one implementation,
two callers — so a v11 export imports as a v12 workspace with every séance
timed. A v10 file stays refused; its journal store no longer exists, and that
is a loss no backfill can undo.

## Data

One `useLiveQuery`, over four reads:

```ts
db.scheduleEntries.toArray()
db.classes.toArray()
db.subjects.toArray()
sessionsInRange(db, weekStart, weekEnd)   // already exists; the journal reads it
```

Then, per date in the window:

```ts
const scheduled = entriesForDay(entries, termStart, date);
const slots     = slotsForDay(sessions, scheduled, date);
```

**No new merge logic.** Both functions exist, and both already carry the rules
that make this correct:

- `entriesForDay` holds the missing-anchor rule. With no term start, nothing on
  an alternating cycle has a meaningful parity, so only the `weekCycle: "all"`
  entries are selected rather than a week being guessed. A teacher who never
  set a term start still sees what happens every week and never sees week A's
  lessons on a day the app cannot name.
- `slotsForDay` pairs a séance with a lesson of its **own class** before
  pairing by time. `/` reads every class at once, which is exactly the case
  where time alone would let one class's séance claim another's lesson — two
  classes at one minute is legal here.

It also gets **simpler**. Its branch for a séance carrying no time — and that
branch's careful qualifier, that such a séance pairs with its class's lesson
only when it is that class's only séance of the day — has nothing left to
match once every séance has a start. `Slot.startsAt` becomes a `number`, and
`Slot` gains the `endsAt` the grid needs to give a block its height.

This screen is therefore Today's data loading run over seven days instead of
one. That it needs no new domain function is the evidence the merge was
factored correctly the first time.

`readTermStart()` is read as it is now, from `localStorage`, before any query.

## The Shared Grid

`src/modules/schedule/components/time-grid.tsx` moves to
`src/modules/design-system/components/time-grid.tsx`, joining `data-table.tsx`
and `pupil-name.tsx` — shared UI with a domain flavour, which is what
`design-system/` holds; `shared/` is the layout.

The interface generalises from a weekday to an opaque column key:

```ts
export interface GridColumn {
  /** Matches `GridLesson.column`. */
  key: string;
  /** Rendered as the column heading. The caller composes it. */
  label: string;
  /** Drawn as the current column. */
  today?: boolean;
}

export interface GridLesson {
  id: string;
  column: string;
  startMinute: number;
  endMinute: number;
  title: string;
  room?: string;
  cycle?: string;
  color?: string;
  /** Set → the block is a `<Link>`. Unset → a `<button>` calling `onSelect`. */
  href?: string;
  /** A séance exists for this lesson. Drawn as a dot with an sr-only label. */
  recorded?: boolean;
}

export function TimeGrid(props: {
  columns: GridColumn[];
  lessons: GridLesson[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** The now line. The week grid passes it; the editor does not have one. */
  now?: { column: string; minute: number };
}): JSX.Element;
```

Three things about this shape.

**The caller composes the column label.** `/schedule` passes
`t('schedule.day.1')`; `/` passes `lun. 7`. Had the grid kept computing its own
heading it would have needed to know which of the two it was drawing, which is
the branch this generalisation exists to remove. The grid already took resolved
text rather than rows — a class name and a salle name are two live queries away
from a `ScheduleEntry` — so this extends a decision the component had already
made rather than introducing one.

**A block is a `<Link>` or a `<button>`, decided by `href`.** The editor needs
a button, because selecting a lesson opens a form beside the grid and does not
navigate. The week needs a real link, because a `<tr>`-style click handler
takes no focus and Enter does not fire on it — the same rule `DataTable`
follows, where the first cell holds a real `<Link>` and `onRowClick` is a mouse
convenience layered on top.

**`gridWindow`, `layoutDay` and the `--hour` arithmetic are untouched.** The
window is still computed from every lesson passed in rather than from the
columns drawn, so switching the phone's day does not slide the grid, and a
Thursday evening lesson does not move Monday's ten o'clock. The floor stays
`3rem`, which is 44px at fifty-five sixtieths — the tap floor exactly.

## The Shared Navigation

The `‹ / Aujourd'hui / ›` control and its window label come out of `DiaryPage`
into `src/modules/design-system/components/calendar-nav.tsx`:

```ts
export function CalendarNav(props: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}): JSX.Element;
```

Purely presentational — it does not know whether it steps a day, a week or a
month, which is what lets the journal and the front door share it while
stepping differently.

Its three i18n keys move from `diary.previous` / `diary.next` / `diary.today`
to a top-level `calendar.*`, for the reason attendance labels live under
`attendance.*` rather than inside `gradebook`: a key naming a control shared by
two features belongs to neither.

## The Page

`src/modules/today/page.tsx` keeps its route and its name and becomes the grid.

**Columns.** Monday to Friday always. Saturday and Sunday earn a column only
when that **date** carries a lesson or a séance — the rule `/schedule` applies
per weekday, applied here per date, since a Saturday with a make-up lesson is
a fact about the 12th rather than about Saturdays.

**Blocks link to the lesson**, `Router.Class({ classId, date, at })` — the
target Today's cards already use, so the class page needs no change. `at` is
the slot's start minute, which every slot now has.

**Every séance places.** There is no strip under the grid and no unplaceable
case, because a séance carries a start and an end of its own. A séance with no
matching schedule entry draws its own stored times rather than a render-time
guess, which is the difference between a rectangle the teacher chose and one
the component invented.

**The class page's séance strip gains a time editor**, which is where the new
`endsAt` is set. It belongs to that screen rather than to this one: `/` stays a
signpost, and a control that edited a séance from the front door would be the
working-surface design rejected above, arriving through a side door.

**Empty states survive, and stay directions rather than decoration.** No
entries at all → the line pointing at `/schedule`. Entries, but nothing in the
window → a line saying so. No term anchor → the hint pointing at Réglages,
which is what makes an alternating timetable resolve.

The drawer entry stays **Aujourd'hui**. Narrow shows today, the reset button is
called Aujourd'hui, and "Semaine" would be wrong on a phone.

## Domain

One addition, in `src/domain/calendar.ts`:

```ts
/** `n` days from `ms`, walking the calendar. `n` may be negative. */
export function addDays(ms: number, n: number): number;
```

It walks with `nextDay` / `previousDay` rather than adding `n × 86_400_000`,
which is the rule this repo already applies in `nextDay` itself, in `rangeStart`
(`src/domain/behaviour-range.ts`), and in the diary's local week-shift loop — that loop
collapses onto this function, removing the third copy.

`startOfIsoWeek` (defined in `src/domain/schedule.ts`, re-exported from
`calendar.ts`) and `weekDays` already exist and are used as they are.

Two more, in `src/domain/seance.ts`, both required by the ruling above:

```ts
/** The ordinary French lesson. */
export const DEFAULT_SEANCE_MINUTES = 55;

/** A séance's times, repaired from what a legacy row does carry. */
export function backfillSeanceTimes(
  row: { startsAt?: number; endsAt?: number; createdAt: number },
): { startsAt: number; endsAt: number };
```

`backfillSeanceTimes` is pure and lives in the domain precisely because it has
two callers in two layers — the Dexie `upgrade()` and `parseBackup` — and a
repair rule kept in two places is a repair rule that eventually disagrees with
itself. It is the same argument that made `entriesForDay` one function.

Nothing else moves into the domain. The weekend-column rule stays in the page,
where `/schedule` already keeps its own copy of the same judgement; promoting
it would be a shared abstraction over two call sites that agree by coincidence
rather than by rule.

## Testing

`addDays` is TDD, in `src/domain/calendar.test.ts`: a step across a spring and
an autumn DST boundary lands on the right calendar day, a step across a year
end lands in the right year, `n = 0` is identity, and negative `n` mirrors
positive. The DST cases are the reason the function exists, so they are the
tests that matter.

`backfillSeanceTimes` is TDD too: a row with neither time gets its hour from
`createdAt` and a 55-minute end; a row with a start and no end keeps its start;
a row with both is returned unchanged; and a `createdAt` at 10:37 floors to
10:00 rather than rounding.

**The schema regression test is not optional here.** `CLAUDE.md` names this
seam as the suite's blind spot — nothing else runs new code against an old row —
and asks for one test per store whose shape moved. So `src/db/index.test.ts`
builds a v15 database with `fake-indexeddb` holding a séance with no
`startsAt`, plus an attendance row and a behaviour event keyed to it, opens it
with current code, and asserts three things: the séance now has a start and an
end, its attendance row still resolves to it, and its behaviour event does too.
The last two are the whole reason the store was not dropped.

`backup.test.ts` gains a v11 fixture that imports and comes back timed, and
keeps asserting that a v10 file is refused.

The grid and the page have no component tests, per the standing posture — UI is
verified by reading and by driving a real browser against `yarn dev` on port
3000. The flows to drive:

1. `/` opens on this week with today's column marked and a now line in it.
2. `‹` and `›` walk a week on a wide window and a day on a narrow one, and the
   URL changes by `replace` — Back leaves the page rather than walking weeks.
3. `Aujourd'hui` returns to a bare `/`.
4. A block opens the right class at the right slot.
5. A lesson already recorded as a séance shows as recorded, and appears once
   rather than twice.
6. `/?date=nonsense` opens on today.
7. `/schedule` still edits: its blocks still open the form, its day picker
   still works, its A/B badges still draw.
8. The class page's séance strip shows a range and edits both ends; a séance
   whose end moves changes height on `/` without a reload, through the same
   `useLiveQuery` every other write goes through.

The validation gate — `yarn format && yarn lint && yarn typecheck && yarn test`
— must be green, as always.

## Files

- Add: `src/modules/design-system/components/time-grid.tsx` (moved from
  `src/modules/schedule/components/time-grid.tsx`, generalised)
- Add: `src/modules/design-system/components/calendar-nav.tsx`
- Modify: `src/domain/calendar.ts`, `src/domain/calendar.test.ts`
- Modify: `src/domain/seance.ts`, `src/domain/seance.test.ts` (`Slot.startsAt`
  becomes required, `Slot.endsAt` added, `DEFAULT_SEANCE_MINUTES`,
  `backfillSeanceTimes`)
- Modify: `src/db/types.ts` (`Session.startsAt` required, `Session.endsAt`)
- Modify: `src/db/index.ts` (`db.version(16)` with the first `upgrade()`)
- Modify: `src/db/index.test.ts` (the v15 regression test above)
- Modify: `src/db/sessions.ts` (`getOrCreateSessionAt` takes both times)
- Modify: `src/db/backup.ts`, `src/db/backup.test.ts` (format 12; v11 accepted
  through the backfill)
- Modify: `src/modules/class/page.tsx` (the séance strip's time editor)
- Modify: `src/modules/today/page.tsx` (rewritten)
- Modify: `src/modules/schedule/page.tsx` (builds `columns` and `column`)
- Modify: `src/modules/diary/page.tsx` (uses `CalendarNav` and `addDays`)
- Modify: `src/router.ts`, `src/app.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Modify: `CLAUDE.md`

## Out of Scope

- Editing a schedule entry from `/`. It stays a signpost; `/schedule` edits.
- Editing a séance's times from `/`. The strip on the class page owns that,
  for the reason given above.
- Writing a note from `/`. Rejected above, and the reasoning should be
  reopened deliberately if ever revisited rather than arrived at by accident.
- Wiring `ScheduleEntry.room` to `Room.id` so a block could open onto the right
  salle. Still the separate migration `CLAUDE.md` records under known gaps.
- Scroll or zoom state in the URL. The week is what survives a round trip.
