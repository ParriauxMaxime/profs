# profs — Phase 6: the class is the page (design)

**Date:** 2026-09-02
**Status:** Approved, ready for implementation planning
**Follows:** phase 5 (`2026-09-02-profs-phase5-seating-direct-manipulation.md`), which must ship first — see *Sequencing*.

## What This Is

A teacher does not think in carnets, seating plans and rosters. They think in
**3°B**. Everything this app holds about 3°B is currently spread over four
destinations, and moving between them means going up to the drawer and back
down.

This change makes a class one page with four tabs — Plan de table, Élèves,
Carnets, Journal — and removes the flat `/gradebooks` destination.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two
themes.

**Nothing here changes the schema.** No new table, no `db.version(7)`, no
migration. This is routing and composition over tables that already exist.

## What is wrong now

Teaching 3°B on a Wednesday, the app asks for this:

- Take the register → drawer → Classes → 3°B → Plan de table.
- A pupil is disruptive, note it → already there, fine.
- Hand back last week's copies and enter the marks → drawer → Carnets → find
  "Maths 3°B" among every carnet of every class → the grid.
- Write what was covered → drawer → Journal → find 3°B → today.

Three of those four steps leave the class entirely, and the drawer — the one
control always under the thumb — is used as a hub between views of the *same
class*. The class page itself holds only a roster and a button to the plan.

## The reversal this contains, stated plainly

`/gradebooks` exists because of a decision made in phase 4a, recorded in its own
docstring: a flat list is there because "marking a pile of copies is the second
most common thing a teacher opens this app to do, and it used to mean going
through a class to reach a grid."

**This design puts that hop back**, deliberately. Marking now starts at
Classes → the class → Carnets → the grid.

The judgement is that the earlier fix treated a symptom. The hop was expensive
because the class page was a dead end — a roster and one button — so passing
through it bought nothing. Passing through a class that carries the plan, the
register, the journal and the carnets is not a detour; it is arriving at the
thing you were going to need anyway. A teacher marking Maths 3°B copies is very
often about to look at who was absent.

If that judgement is wrong, the reversal is cheap and nothing here forecloses
it: re-add `/gradebooks` as a flat list and a drawer entry. No data moves either
way.

## Routes

```
/                            Aujourd'hui
/classes                     the classes
/classes/:classId            redirects to /plan
/classes/:classId/plan       Plan de table   (default tab)
/classes/:classId/students   Élèves
/classes/:classId/books      Carnets
/classes/:classId/diary      Journal
/students                    every pupil, searchable
/students/:studentId         one pupil, full history
/schedule                    the weekly timetable
/diary                       the journal across every class
/settings                    Réglages
/gradebooks/:gradebookId                       the grid
/gradebooks/:gradebookId/entry/:columnId       fast entry
/gradebooks/:gradebookId/rubrics               rubric assessments
/gradebooks/:gradebookId/rubrics/:assessmentId one rubric grid
```

Removed: `/gradebooks`.

A route per tab rather than local state, so the back button steps between tabs,
a reload keeps the tab, and Aujourd'hui can still link straight to a lesson's
seating plan. `/classes/:classId/plan` is the same URL the app already has, so
that link does not change at all.

**The grid stays outside the tabs.** It is a wide scrolling table, and a tab bar
above it would cost vertical space on the one screen with none to spare. The
Carnets tab is a list that opens it.

The drawer keeps six destinations: Aujourd'hui, Classes, Élèves, Emploi du
temps, Journal, Réglages — plus the établissement switcher above them.

`/students` and `/diary` both stay, and are not duplicates of the tabs beneath
them. `/students` is how a teacher finds a pupil whose class they cannot
remember; the Élèves tab is the roster of one class. `/diary` is how next
week's plan gets written for three classes in one sitting; the Journal tab is
one class's entries.

## The class hub

`ClassPage` today is 272 lines holding the roster table, the student form, CSV
import, the group filter, the group form, and class rename and delete. It
becomes a shell:

```
src/modules/class/
  page.tsx              ClassLayout — header, tab bar, shared selections
  tabs/plan.tsx         the seating plan
  tabs/students.tsx     the roster
  tabs/books.tsx        NEW — this class's carnets
  tabs/diary.tsx        this class's journal entries
  components/           class-form, csv-import, group-filter, group-form,
                        student-form — unchanged
```

Chicane has no nested-route outlet. The "outlet" is the existing `match` in
`app.tsx` choosing a tab component and passing `classId` — the same pattern the
app already uses, one level deeper.

`src/modules/plan/`, `src/modules/gradebook/`, `src/modules/entry/` and
`src/modules/rubric/` keep their own directories. `tabs/plan.tsx` is a thin
wrapper around the plan module's existing body, which loses only its outer page
wrapper.

### Two selections live in the shell, not in the tabs

**The group filter.** `GroupFilter` is currently instantiated three times —
class page, plan page, gradebook grid — each with its own `selectedGroupId`.
In the hub, one selection lives in the shell and is passed down. Filtering the
roster to "Groupe A" and finding the plan unfiltered reads as a bug.

It is held as a group **id**, never an index, and a deleted group falls back to
"Tous". This is the rule that has already produced the same bug three times in
this codebase in three disguises.

**The selected session.** The Plan tab has a session selected; the roster does
not. The shell owns the id so that the pupil card can behave consistently
across tabs — see below. Held as a session id, never a position.

### The pupil card

Tapping a seat opens the pupil card, as it does today. Tapping a **roster row**
now opens the same card, rather than navigating away.

The card carries attendance controls, and attendance is a property of a
**session** — never a gradebook column, never a field on a pupil. So the card
shows the attendance controls only when a session is selected, which on the
Plan tab is always and on the Élèves tab is whenever the teacher has one open.
Inventing a second way to record attendance from the roster is exactly the
duplication phase 2A refused.

The card keeps `key={student.id}`, so switching pupils resets its draft state
(notes, behaviour comment) rather than carrying one pupil's half-typed
observation onto the next.

Everything that does not fit over a seating grid on a phone — averages, the
full behaviour timeline, the photo — stays on `/students/:studentId`, which the
card links to.

### Carnets tab

Lists this class's gradebooks, each opening its grid, with a form to create one.
`GradebookForm` moves from the `gradebooks` module (which is going away) into
the class module. The class is implied by the page, so only the subject is
picked.

`deleteGradebook` keeps its current behaviour, which is the exception that
**unlinks** rather than cascades: it clears `gradebookId` on every schedule
entry pointing at it and leaves the entry standing. Deleting a carnet must
never delete part of a timetable. Its confirm label keeps saying so.

After a delete, the grid page currently pushes Home; it should push the class's
Carnets tab, since that is where the teacher came from.

## Loading

Each page today runs its own `useLiveQuery`. A naive shell would re-run the
class query per tab, so switching tabs would flash "Chargement…" over a class
whose name is already on screen.

- The **shell** queries the class row, its pupils, its groups and their
  memberships — what every tab needs — and passes them down. It renders
  "Chargement…" once, on first entry.
- Each **tab** queries only its own: Plan the layout, seats, sessions and
  attendance; Carnets the gradebooks and subjects; Journal the entries for its
  date range.
- Every one of those keeps `db` in its dependency array. A live query that
  forgets it keeps rendering the previous school's pupils after an
  établissement switch.

The shell keeps the explicit `?? null` distinction between "loading" and "no
such class": `useLiveQuery` returns `undefined` for both, and a deleted class
would otherwise sit on "Chargement…" forever.

## Inbound links to retarget

- Aujourd'hui → `Router.Plan({ classId })` — same URL, no change; and each
  lesson gains a link to its class.
- `/classes` → the class (now lands on the plan).
- `/students/:studentId` → back to its class.
- The grid's post-delete `Router.push("Home")` → the class's Carnets tab.
- Nothing else links to `/gradebooks`.

## Sequencing

Phase 5 — the seating gesture rework and the 100-pupil ceiling — is specced,
planned, and being implemented in a separate worktree. It ships **first**, and
this is rebased onto it.

They overlap in exactly two files, and in neither case on the same lines:

- `src/modules/plan/page.tsx` — phase 5 rewrites the interaction; this removes
  its outer page wrapper and takes `classId` and the shell's selections as
  props.
- `src/modules/class/page.tsx` — phase 5 enforces the class-size ceiling at the
  add-pupil and CSV sites; this carves the file into a shell plus a roster tab,
  carrying those sites into `tabs/students.tsx`.

Nothing in `router.ts`, nothing in `src/db/`, nothing in `src/domain/`. The
gesture rework and the routing change stay independently verifiable, which is
the point of not folding them together.

## Verification

Domain and `src/db` are untouched, so the existing suites are the regression
net: all must stay green. The i18n parity test covers the new tab labels in
both locales.

There are deliberately no component tests in this project, so the flows are
proven by driving `yarn dev` in a real browser:

1. Open a class: it lands on Plan de table with the room drawn.
2. Tap a seat: the card opens with attendance controls; mark an absence.
3. Switch to Élèves, tap a row: the same card opens, and it shows attendance
   controls only while a session is selected.
4. Filter to a group on Élèves, switch to Plan: the filter is still applied.
5. Switch to Carnets, open a grid, enter a mark, come back: the tab and the
   group filter survived.
6. Switch to Journal, write an entry, confirm it appears in `/diary`.
7. Delete a carnet from the Carnets tab: it goes, the schedule entry pointing
   at it survives without a gradebook.
8. Switch établissement with a class page open: the tabs re-read, and no pupil
   of the previous school remains on screen.

## Out of scope

- Any schema change.
- Reordering periods, renaming a gradebook — still absent, still not this.
- A cross-class "recently opened carnets" list. Recency is a notion the app does
  not track, and adding it to soften the removal of `/gradebooks` would be
  building a second flat list under another name.
- Attachments, and anything that reopens the cahier-de-textes question.
