# profs — the pupil page is a synthesis (design)

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning
**Follows:** phase 2A (attendance and behaviour), phase 6 (the class as one
page), `docs/BACKLOG.md` #3 (the behaviour log) and its #5 (behaviour counts by
period). `docs/BACKLOG.md` numbers two lists; where this spec means the iDoceo
gap analysis it says so.

## What This Is

`/students/:studentId` today shows a photo, a class link, behaviour counts
behind a date-range selector, attendance counts, and a behaviour timeline. It
reads as a smaller copy of the `StudentCard` — the same behaviour list, fewer
of the card's actions — and it answers no question the card does not already
answer better, in the room, mid-lesson.

The page is rebuilt around one moment: **the conseil de classe**. A teacher at
a desk in December, writing two sentences about this child, needs their average
per carnet against the class, how regular they have been, and what has been
observed. That is a synthesis, and the app has never had one: every existing
surface is class-major (the grid, the roster) or séance-major (the card, the
register). A pupil across time is the transpose nobody has drawn.

The page is also **fully editable**. That is a deliberate widening, and the
reasoning differs per record — see *Three kinds of editable*, below.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
mid-lesson tap targets, writes in `src/db/` and never in a component, and
`PupilName` as the only place a pupil's name is composed.

## The Two Clocks, and Why There Is No Trimestre Selector

A conseil de classe is per-trimestre, and the trimestre is the one thing this
app has twice refused to define. `Period` carries `{ id, gradebookId, name,
order }` and **no dates**; it belongs to a carnet, so a class holding three
carnets holds three period calendars that need not agree. `Session` is simply
dated. So a mark filters by period and an absence filters by date, and no
control can honestly govern both.

`docs/BACKLOG.md` #5 — the behaviour-counts entry — met this and answered it by
filtering on dates over three windows. This design meets it again and answers it by
**refusing to put a single control on the page at all**:

- Each carnet section carries its **own** period tabs, drawn from that carnet's
  own periods. Nothing on screen claims that Maths Écrit's *Trimestre 1* and
  Musique's *Semestre 1* are the same span of weeks, because nothing puts them
  under one control.
- The date-keyed blocks — Présence, Comportement — carry **no range control**
  and show everything. At a December conseil the whole year is the trimestre;
  by June a teacher reading a full-year record is reading what actually
  happened.

The second half of that reverses a delivered feature. `behaviour-range.ts`, its
selector and its i18n keys are removed, and that same #5 records the reversal
rather than losing it. Nothing of its discipline is lost: `addDays`
already walks the calendar the way `rangeStart` did, for the same reason
(`weekParity`'s reason — subtracting `n × 86_400_000` is an hour out after each
clock change and eventually a whole day).

**Rejected: giving `Period` dates.** Periods are what `studentAverage` filters
a bulletin by. Making one mean a span of time as well as a set of columns would
change what marking filters by everywhere, in order to put one control on one
page. The failure mode is a silently wrong bulletin, which is the one this app
cannot afford. Unchanged from #5's ruling.

## Three Kinds of Editable

"Everything on this page is editable" resolves into three different problems,
because the three records are keyed differently.

**A mark is keyed `[gradebookId+columnId+studentId]`** and needs no context
beyond the pupil and the column. Marking already has **two** surfaces — the
grid cell and the fast-entry screen (`/entry/:columnId`) — and both drive the
same `EditableCell` in `design-system/components/`. The fast-entry screen is
column-major: one column, every pupil. This page is pupil-major: one pupil,
every column. It is the missing transpose, not a second path to a fact, and it
reuses the same component, so the blank-clears / valid-stores /
invalid-refused rule and the note marker cannot drift into a third dialect.

**An attendance mark is keyed `[sessionId+studentId]`**, so editing one means
naming a séance. CLAUDE.md's invariant — *"There is no second, inline path"* —
was written against a register inlined on a roster row, where the séance is
implicit and the teacher cannot see which lesson they are marking. Here the
séance is the row: its date and its hour are on screen, and the edit lands on
the lesson the teacher is pointing at. **No séance is ever created from this
page.** Only lessons that already have a row can be marked, which keeps the
"predicts, never pre-creates" ruling intact — a page opened in December to read
about September cannot file a lesson.

**A behaviour event is append-only** and belongs to the moment it was observed.
It stays **delete-only** here, exactly as today. A page cannot add an
observation to a lesson it was not in.

## The Page

### Route and shell

`/students/:studentId?q&classe&groupe&sort&dir`

The parameters describe **the list the arrows walk**, never the pupil. A
conseil goes through twenty-eight children in order, so the header carries
`‹ ›` and `8 / 28`, and the set they step through is the list the teacher came
from — `/students` filtered to 3°B sorted by surname steps through exactly
that.

Stepping uses `Router.push`, not `replace`. This is the opposite of `/`'s week
stepper and for the opposite reason: walking a week is a change of view, so
Back should leave; walking a roster is a sequence of destinations, so Back
should walk it backwards.

Parameters resolve or are ignored, the rule `?classe` already follows for a
deleted class: `sortingFromParams` refuses a column id that no longer exists,
an unknown class or group is dropped. Arriving with no parameters — from a seat
on the plan, or from a bare link — draws no arrows rather than inventing a
list.

**`/classes/:classId/eleves` gains `?groupe&sort&dir`.** Its group filter and
its sort are React state today, which makes it the one list page not following
CLAUDE.md's own rule that a list page's filter and sort live in its URL. It has
to move regardless: a pupil opened from a filtered roster otherwise has no list
to reconstruct, and the arrows would silently walk a different set from the one
on screen.

### Header

Photo through `PhotoInput`, the name through `PupilName`, the class as a link,
the arrows and the position in the list, **Modifier** and **Supprimer**.

The page owns the pupil entirely. **Modifier** reuses `StudentForm`, which
edits surname, first name and notes — it does not move a pupil between classes,
and neither does the roster's, so nothing is lost by reusing it. `Supprimer` is
a `ConfirmButton` whose body names the cascade — grades, attendance, behaviour, seat — and on confirm the
page navigates to the class roster with `Router.replace`, because a page cannot
remain on a pupil who no longer exists.

`Student.notes` sits open in the header, editable, under its own label. That is
a decision with a cost: the field holds accommodations — PAP, PPRE,
tiers-temps — which are likely special-category personal data, and a conseil de
classe is a room with colleagues in it. It is open anyway, because an
accommodation is the thing that should change how every figure below it is
read, and a note consulted often behind a disclosure triangle is a note nobody
opens. `PRIVACY.md` already states that notes are stored and exported; this
adds no new storage and no new export.

### Carnets

One section per carnet of the pupil's class. Each carries:

- the carnet's name and its subject colour;
- **its own** period tabs, in `order`, defaulting to the last period holding
  any mark for the class — "where the marking has got to", which in December is
  the trimestre being discussed. Deterministic, and it needs no dates;
- the pupil's average in the selected period, the class mean beside it, and the
  position bar;
- the period's columns, listed, each an `EditableCell`.

**The position bar is the first chart in the app.** Inline SVG, no library —
a CDN would break the no-network promise as surely as an analytics call. It
draws the class's spread of averages in that period (min to max), the mean
ticked, and this pupil's dot on it. A mean alone hides the difference between
*barely above* and *far above*, which is exactly the distinction an
appréciation turns on. The same figures are printed in text beside it: the bar
is never the only way to read them, the rule `RUBRIC_LEVEL_COLORS` already
follows.

It draws nothing when fewer than two pupils have an average in that period. A
spread of one is a point, and a point drawn as a scale is a lie about a class.

**Column rows dispatch by type.** The section iterates the period's columns and
renders each according to `column.type`, rather than assuming a numeric input.
A `calculation` column renders its derived value read-only, as it does in the
grid. This is what lets the `rubric` column type — see
`2026-09-09-profs-rubric-as-column-design.md`, in flight — arrive as one more
case in that dispatch instead of a new section on this page.

A row carries the column label, its coefficient, the `EditableCell` with the
mark, and the note behind its corner marker. Both callbacks are wired:
`setGradeNote`, which already refuses to leave a row holding neither, and
`writeGrade` — which this work has to extract first. See below.

### Présence

A heading line, then the counts, then the séances.

```
Assiduité  97,6 %
  (41 / 42 séances marquées — 1 absence non justifiée)
  présent 38   en retard 1   excusé 2   absent 1
```

Three things about that figure are deliberate.

**The numerator is présent + en retard + excusé.** It counts séances with no
*unjustified* absence. A pupil who was late was in the room; a pupil who was
excused was not, but had a reason, and that is the distinction vie scolaire
acts on.

**The denominator is séances marked, and says so.** A séance is created lazily,
so the app knows lessons recorded and never lessons held. "42 séances
marquées" is a claim it can support; "42 lessons this term" is not.

**It is called *assiduité*, not *présence*.** With that numerator, a pupil
absent half the term with a note from home reads near 100 %, and a figure
labelled *présence* would be repeated at a conseil meaning something it does
not measure. *Assiduité* carries the justified/unjustified nuance in French
school language, and the parenthetical states the definition in full rather
than relying on the reader knowing it.

With nothing marked at all there is **no rate** — not 0 %, not 100 %. The
counts show, the percentage does not.

Below it, the class's séances, newest first, **grouped by month**. The current
month is open and older months are collapsed with their counts; when this month
holds no séance for the class, the most recent month that does is opened
instead, because a page whose only open section is empty reads as a bug.

A row is a date, an hour, and four buttons:

```
jeu. 4 déc. 10h   [P][A][R][E]
mar. 2 déc. 10h   [P][A][R][E]
```

The initials are a translated key, never `value[0]`: English *late* is L, not
R. Each button carries the full word as its accessible name and its `title`,
`aria-pressed` for its state, and a border as well as a fill — the state is
never colour alone. Tapping the value already set clears it, which
`toggleAttendance` already does by re-reading inside its own transaction.

This breaks the app's convention of plain-language labels on controls, and does
so knowingly. Four French words at 44px are ~112px each; a date, an hour and
four of them do not fit a 375px line, and the alternatives — two lines per
lesson, or a tap to expand each row — both cost the thing this block is for,
which is reading a month of a pupil's attendance at a glance.

A séance nobody marked draws as a row with nothing pressed. A gap in the
register then reads as a gap, which is the honest reading; `attendance.ts`
defines no default precisely so an unmarked pupil is *not recorded* rather than
*present*.

### Comportement

The counts by type over the whole record, then the complete timeline — date,
type, comment, delete — newest first. No range control and no add.

## `writeGrade` Moves To `src/db/grades.ts` First

CLAUDE.md says the grid and the fast-entry screen share the blank / valid /
refused rule, and that is true only of the **parsing**: `isBlankInput` and
`parseGradeValue` live in `domain/gradebook/grade.ts`. The **write** is a local
function in `src/modules/gradebook/page.tsx` and a hand-copied block in
`src/modules/entry/page.tsx`, which is a rule kept in two places, in components,
against the standing rule that writes live in `src/db/`.

The two copies have already drifted, and not harmlessly. The entry screen
re-reads the row inside the write, with a comment saying why: a note flushed
moments earlier may have just brought a note-only row into existence, and a
`put` built from a render-time snapshot would clobber it. The grid does not
re-read — it builds the row from `gradeMap`, captured at render.

So this work extracts `writeGrade(db, gradebookId, columnId, studentId, next)`
into `src/db/grades.ts`, beside `setGradeNote` and following its shape: one
`rw` transaction, re-reading inside it, deleting the row outright when neither
a value nor a note survives. The grid and the fast-entry screen are moved onto
it, and the pupil page is its third caller rather than its third copy. Tests
cover the case the drift was about — clearing a mark on a row whose note was
written concurrently keeps the note.

This is a prerequisite, not a side quest: adding a third hand-written copy of
this rule is the drift the extraction prevents.

## Domain Work

A new `src/domain/student-summary.ts`, pure and TDD as every domain module is:

- `attendanceSummary(records)` — the four counts, the unjustified count, and
  the rate. Returns the rate as `null` when nothing is marked, so no caller can
  print 0 % for a pupil nobody ever registered.
- `positionOnScale(value, values)` — min, max, mean and the pupil's fraction
  along the span. `null` under two values, and `null` when min equals max,
  which is a spread of zero and cannot be drawn.
- `groupSeancesByMonth(sessions)` — walks the calendar via `addDays`-style
  helpers in `src/domain/calendar.ts`, never millisecond arithmetic, for
  `weekParity`'s reason.
- `lastMarkedPeriod(periods, columns, grades)` — the period tab a carnet opens
  on. Falls back to the first period by `order` when the carnet holds no mark
  at all.

Removed: `src/domain/behaviour-range.ts` and its test, the selector, and the
`behaviour.range.*` / `behaviour.rangeLabel` keys from both locale files.

## Costs Accepted, Recorded Here Rather Than Discovered Later

**`CarnetsPanel` and this page will disagree about which period they
summarise.** The class page shows the class mean of the **first** period by
order; this page opens on the **last period holding a mark**. Two screens one
click apart will show two different class means for one carnet, each correct
for its own period and each labelled with it. This is the one decision in this
design that runs against CLAUDE.md's stated reasoning for `CarnetsPanel`
("a mean over the whole carnet here and a mean over one trimestre there would
be two different numbers for one gradebook"). It was taken deliberately: the
conseil wants the trimestre being taught, not September's. Aligning the two is
a one-line change to `CarnetsPanel` if the disagreement proves to cost more
than the default buys.

**Accommodations are visible to anyone looking at the screen.** Stated above,
under *Header*.

**`P/A/R/E` breaks the plain-language-label convention.** Bought back by the
accessible name and the `title`; stated above.

**The pupil page is the third surface that writes a grade.** Precedent exists
and the component is shared, so this widens where marking happens without
widening how it behaves.

**No output.** No print stylesheet and no clipboard export. The page is read on
screen and the appréciation is typed where it legally lives, which for a French
teacher is Pronote or the ENT — the same ruling the journal took against being
a cahier de textes. The iDoceo gap analysis's #5, *Student reports*, stays
parked with its open questions intact rather than being answered by accident.

## What Was Rejected

**A merged chronological history.** One stream of marks, absences and behaviour
under day headings reads well and cannot be built honestly: `GradeColumn.date`
is optional, so some marks have no position in time and would either vanish
from the stream or sit in an "undated" appendix contradicting it. Separate
blocks, each honest about its own key, say less and mislead never.

**A séance picker driving an editing strip.** One selector at the top of
Présence and Comportement, with the card's buttons below it. Compact, and it
puts the target of an edit somewhere other than the row being edited — the
ambiguity the invariant against a second inline path exists to prevent.

**Embedding `StudentCard` targeted at today's lesson.** One implementation, no
drift, and it would file a séance from a page opened in December to read about
September.

**A rank ("8e / 28").** Cheap to compute, most likely of any figure here to be
repeated out of context, and many collèges forbid publishing one. The position
bar answers the same question without producing a number that travels.

**Rubrics on this page.** Deferred to
`2026-09-09-profs-rubric-as-column-design.md`, which dissolves
`RubricAssessment` into a column. A rubric block designed now would be built
against a row that is being removed.

**A global trimestre selector, matched by name or by order.** Both invent an
identity between carnets that the data does not carry: matched by name, a
renamed period silently drops a carnet out of the synthesis; matched by order,
a carnet on semestres answers to a control labelled *Trimestre 2*.

## Testing

Domain modules are TDD against Jest, as every domain module is, including the
edge cases the design names: no marked séance yields no rate, a class of one
yields no bar, a carnet with no mark falls back to its first period, and the
month grouping crosses a DST boundary without losing a day.

There are deliberately no component tests. The page is verified by driving a
real browser against `yarn dev` on port 3000: step the arrows through a
filtered list, correct an attendance mark on a séance three months back and see
the assiduité figure move, edit a mark and see the carnet average and the
position bar follow, delete a behaviour event, and confirm the deleted pupil
lands on the roster.

`yarn format && yarn lint && yarn typecheck && yarn test` all green.
