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
the slot's start minute, or absent for a séance that carries no time.

**A séance with no `startsAt`** — one recorded before séances carried a time,
or a cover lesson opened outside the timetable — has no position on an hour
grid. Those go in a short strip **under** the grid, labelled as outside the
timetable, carrying the same link. Dropping them silently is the one outcome
ruled out: the séance exists, it holds attendance and behaviour, and a screen
that shows the week must not hide a lesson because it cannot place it.

**A timed séance with no matching entry** has a start and no end, since
`Session` records when a lesson was and never how long it ran. It draws 55
minutes — the ordinary French lesson — rather than gaining a stored duration
field for the sake of a rectangle.

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

The validation gate — `yarn format && yarn lint && yarn typecheck && yarn test`
— must be green, as always.

## Files

- Add: `src/modules/design-system/components/time-grid.tsx` (moved from
  `src/modules/schedule/components/time-grid.tsx`, generalised)
- Add: `src/modules/design-system/components/calendar-nav.tsx`
- Modify: `src/domain/calendar.ts`, `src/domain/calendar.test.ts`
- Modify: `src/modules/today/page.tsx` (rewritten)
- Modify: `src/modules/schedule/page.tsx` (builds `columns` and `column`)
- Modify: `src/modules/diary/page.tsx` (uses `CalendarNav` and `addDays`)
- Modify: `src/router.ts`, `src/app.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Modify: `CLAUDE.md`

## Out of Scope

- Editing a schedule entry from `/`. It stays a signpost; `/schedule` edits.
- Writing a note from `/`. Rejected above, and the reasoning should be
  reopened deliberately if ever revisited rather than arrived at by accident.
- Wiring `ScheduleEntry.room` to `Room.id` so a block could open onto the right
  salle. Still the separate migration `CLAUDE.md` records under known gaps.
- Scroll or zoom state in the URL. The week is what survives a round trip.
