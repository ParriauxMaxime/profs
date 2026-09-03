# Phase 7 — The room is the interface

> Spec. The plan it feeds is written separately.
> **Depends on** `docs/superpowers/specs/2026-09-03-profs-room-layouts-design.md` and
> its plan: this phase rewrites the seat tile, and the room-layouts phase moves
> a `Seat` from `[layoutId+row+col]` to a free position with a stable id. Doing
> this first would build the tile twice.

## The problem

The app has features and no lesson. A teacher arrives through Aujourd'hui or
Classes, lands on the class hub, and then the screen stops helping: the seating
plan shows who sits where and nothing else. Whether Léa is on her third yellow
card this fortnight, whether Yasmine is absent again, whether anything was ever
written about Vera — all of it exists in the database and none of it is on the
screen the teacher is actually looking at during the lesson.

Meanwhile the plan's only gesture is *moving pupils*, which is the thing a
teacher does twice a term, while the things they do every hour — the register,
an observation — are reached by tapping a seat and reading a card that appears
below the room.

This phase inverts that. **The plan is a dense, read-only display by default.**
It carries the state of the current lesson at a glance. Acting on a pupil opens
a sheet. Rearranging the furniture is a mode you deliberately enter.

## Three modes

One `RoomMode`, held by the plan, defaulting to `"read"` on every mount.

| Mode | French label | Tap on a pupil | Tap on an empty seat |
|---|---|---|---|
| `read` | Consultation | opens the pupil sheet | nothing |
| `attendance` | Appel | cycles that pupil's attendance | nothing |
| `layout` | Éditer le plan | picks the pupil up | places / removes furniture |

**`read` is the default and it never writes.** A teacher who taps a face while
scanning the room must not be able to change a record by accident. Every write
in this mode goes through the sheet, where it is labelled.

**`layout` is the only mode with the pick-up-then-place gesture.** This is a
change to the phase 5 ruling recorded in `CLAUDE.md`: today a bare tap on a
seated pupil opens their card and the card's `Déplacer` button starts a hold.
That stays available, but the *ambient* gesture of the room becomes reading,
not moving. `resolveDrop` in `src/domain/seating.ts` is untouched — only the
mode that can reach it changes. `CLAUDE.md` must be updated in the same commit
as the code, or it will describe a gesture the app no longer has.

Leaving any mode releases whatever is held, exactly as leaving the resize form
already does.

## The tile

Four channels, in decreasing order of how far away they are readable.

**The ring — the current session's register.** A ring around the pupil's disc,
distinguished by **colour and line style together**, never colour alone: a
deuteranope cannot separate the green ring from the red one, and this is the
single most-read signal on the screen.

| State | Ring | Disc |
|---|---|---|
| présent | thick solid, `--behaviour-green` | normal |
| absent | thick solid, `--behaviour-red` | desaturated and dimmed |
| retard | thick dotted, `--behaviour-yellow` | normal |
| excusé | thick dashed, `--behaviour-note` | normal |
| non pointé | thin solid, `--unset` (a new quiet token) | normal |

**`non pointé` is its own state and must stay distinct from `présent`.**
`domain/attendance.ts` deliberately has no default value — an absent row means
"not recorded", not "present" — and a room that drew them the same would put a
register on screen that nobody made.

**The pips — recent behaviour.** Small dots under the name: reds first, then
yellows, then greens, capped at `TILE_MAX_PIPS = 4`. Counted over a **rolling
window**, `BEHAVIOUR_WINDOW_DAYS = 15`, not since the start of the year: a
yellow card in September must not still be glowing in June, and the pupil page
already carries the long view.

Greens are shown. `domain/behaviour.ts` says why the type exists at all — a log
that can only record punishment is a bad instrument — and a tile that rendered
only sanctions would be exactly that instrument.

A pupil over the cap reads the same as a pupil at it. Accepted: the exact
numbers are one tap away, and five dots on a 66px tile is noise.

**The note dot — something is written about this pupil.** A single small dot,
in `--behaviour-note`, when `Student.notes` is non-empty.

It is deliberately **not** a structured needs flag. Three alternatives were
considered — a `Student.needs` enum shown as an abbreviation (PAP, TT), the
same enum behind a "discretion" toggle, and deferring the whole idea — and the
choice is the cheapest one: the dot says *there is something to know*, with no
schema change and nothing legible to a room reading the projector. Structured
accommodation flags remain `docs/BACKLOG.md` #2, and they need the GDPR section
that entry already asks for; a seating plan is projected on a wall, and "PAP"
rendered at 10px on a wall is a disclosure.

**The name** stays exactly as it is: `PupilName` with `format="surname"`,
capitals in CSS.

## Appel mode

Entered from the mode bar. Two ways to record:

**Tap a pupil to cycle.** `nextAttendanceValue` in `domain/attendance.ts` — a
new pure function — cycles `présent → absent → retard → excusé → non pointé →
présent`. Clearing must be reachable, because the recovery from a mis-tap is a
teacher tapping the same face until it is right again, not hunting for an
undo.

**"Marquer le reste présent"** writes `present` for every pupil in the class
who has **no attendance row yet for this session**, in one transaction. It
never overwrites an existing record — a teacher who has already marked three
absences and then presses it must not lose them. The button carries a count
(`Marquer les 21 restants présents`), which is what makes it safe to press: you
can see what it is about to do.

This is a deliberate bulk write and it does not contradict the "no default
attendance value" rule. The rule forbids the *app* inferring presence; this is
a teacher stating it. The distinction is that a row appears only because
somebody pressed a button.

The mode bar shows the live tally for the session — `3 absents · 1 retard · 21
non pointés` — so the teacher can see the register is finished without counting
rings.

**Appel is never entered automatically.** Opening a class whose session has no
attendance yet stays in `read`; the mode bar's `non pointés` count is the hint.
Starting in a writing mode because the app guessed the teacher was about to do
the register is how a stray tap becomes a record.

## The pupil sheet

One component, `PupilSheet`, replacing `StudentCard` in the plan. It is the
same content at every width, differently anchored:

- **`lg` and above** — a 320px panel on the right, **overlaying** the room. The
  room does not reflow. Re-scaling the whole plan under the teacher's finger at
  the moment they tap is more disorienting than losing the two right-hand
  columns, and the sheet closes with Escape, a backdrop tap, or its own button.
- **below `lg`** — a sheet from the bottom edge, in **two heights**. It opens at
  the peek height carrying the register, the four observation buttons and the
  pupil's notes; it is dragged (or tapped on its grab handle) to full height for
  the history. Nothing is removed on a phone — it is below the fold.

Contents, in order:

1. **Header** — photo (still `PhotoInput`), `PupilName`, seat position, close.
2. **Appel · <date>** — the four values as 44px targets, the current one filled.
   Present whatever mode the room is in; the sheet is where a single pupil's
   register is corrected without entering Appel.
3. **Observation** — the four behaviour buttons and the comment field, as
   `StudentCard` already has them. `logBehaviour` is append-only and stays so.
4. **Notes sur l'élève** — `Student.notes`, with the existing focus-guarded
   re-sync so a live update cannot stomp on what is being typed.
5. **N dernières séances de cette classe** — `SHEET_HISTORY_SESSIONS = 5` rows:
   date, attendance state, that session's behaviour events. This is the answer
   to "is this the third time this week or the first", and it is why the sheet
   exists rather than a popover.
6. **Counters** — absences this period, cards in the window, and the class
   average if the class has exactly one gradebook. On `lg` only.

`key={student.id}` on the sheet, as `StudentCard` already takes, so switching
pupils resets the notes draft and the comment. The selection itself is a
**student id**, never a seat coordinate: a pupil moved in another tab while the
sheet is open must not leave the sheet pointed at whoever now sits there.

**Not a `<dialog>`.** Blocking dialogs are banned — they freeze the browser
automation these pages are verified with. The sheet implements the discipline
by hand, exactly as `AppDrawer` does: Escape closes, focus moves in on open and
returns to the tile on close, Tab is trapped, the backdrop closes on click,
body scroll is locked while it is at full height, and the panel carries `inert`
when closed.

## Domain additions

All pure, all tested, none of it in a component:

- `domain/attendance.ts` — `nextAttendanceValue(current: AttendanceValue | null): AttendanceValue | null`, the cycle above.
- `domain/behaviour.ts` — `BEHAVIOUR_WINDOW_DAYS`, and `recentCounts(events, now)` returning a `BehaviourCounts` over the window. Windowing is date arithmetic on days, so it walks the calendar rather than subtracting `15 * 86_400_000`; the DST reasoning in `domain/calendar.ts` applies unchanged.
- `domain/room-mode.ts` — the `ROOM_MODES` const array and `RoomMode` type, following the house `as const` + derived type pattern.
- `domain/pupil-timeline.ts` — `recentSessions(sessions, attendance, events, studentId, limit)`, assembling the sheet's history from rows already read. A pure join, so it is tested without a database.

## Database

**No schema change.** Every read this phase needs is already indexed:
`attendance` by `[sessionId+studentId]`, `behaviourEvents` by `classId` for the
class timeline, `sessions` by `classId`. `db.version(6)` stands.

One new write helper, in `src/db/attendance.ts` beside `toggleAttendance`:
`markRemainingPresent(db, sessionId, studentIds)` — one `rw` transaction, reads
the existing rows, writes only the missing ones, returns how many it wrote.

The plan already loads its students, seats and session. It gains two live
queries: the session's attendance rows, and the class's behaviour events within
the window. Both are one index hit and both take `db` in their dependency
array, or a workspace switch keeps rendering the previous school's cards.

## Out of scope

Named here so the plan does not grow into them:

- **La séance** — the day's journal note written from the plan, and the agenda
  of coming lessons. Its own spec, reusing this sheet with the session as its
  subject rather than a pupil.
- **Carnets and périodes** — `Period.startDate`/`endDate` with defaults
  generated from the school-year start, and the Carnets tab opening its single
  gradebook on the current period. Its own spec. Until it exists, the sheet's
  average counter uses the gradebook's current period selection or omits itself.
- **Structured needs flags** — `docs/BACKLOG.md` #2, with its GDPR section.
- **Several layouts per class** — `docs/BACKLOG.md` #4, unchanged.
- **Rubrics** never appear on a tile or in the sheet. A 1–4 level is not a
  mark and does not become a dot either.

## Testing

Domain gets real unit tests, as always: the attendance cycle including the
clear step, the behaviour window across a DST boundary and at exactly 15 days,
the timeline join with a pupil who has no rows at all.

`markRemainingPresent` is tested against `fake-indexeddb`: it writes the
missing rows, leaves existing rows untouched — including an existing `absent` —
and is idempotent when pressed twice.

There are no component tests, per the house posture. The three modes, the
overlay and the two-height sheet are verified by driving a real browser against
`yarn dev`, at a desktop width and at 390px.

## Documents to update

- `CLAUDE.md` — the seating-plan gesture paragraph (pick-up now lives in
  `layout` mode), the tile's new signals, and the sheet replacing the card.
- `docs/BACKLOG.md` — #2 gains the note that the tile carries a bare "something
  is written" dot in the meantime.
- No change to `PRIVACY.md` or `README.md`: nothing new is stored, exported, or
  sent, and nothing is sent at all.
