# profs — the class as one page (design)

Status: implemented.
Supersedes the tab structure described in
`2026-09-02-profs-phase6-class-hub.md` and the day-keyed journal in
`2026-09-02-profs-phase4b-diary-calendar.md`.

## What This Is

A class page with four tabs put one lesson in two places. Attendance and
behaviour lived on *Plan de table*; what was actually taught lived in
*Journal*, keyed by day. Teaching 3°B meant visiting both, and the séance —
the lesson itself — was named by neither.

This replaces the tabs with a single page: where they sit, what we did, and
where the marks go. Everything else about the class — the roster, the archive
— becomes a link out, because it is a detour and should look like one.

The date resolution is not new. `plan/page.tsx` already resolves the selection
to today on mount, on window focus, on `visibilitychange` and when the calendar
rolls over, so a tablet that slept through the night does not go on recording
against yesterday. What was wrong was the `<select>` above it, advertising a
choice a teacher almost never makes.

## The Ruling: A Séance Is a Slot, Not a Fact

Until now a `Session` meant **a lesson happened**. Nothing materialised one
from the timetable, because every holiday, strike and sick day would have left
an empty session in a pupil's history.

Notes moving onto the séance breaks that, and deliberately. A teacher writes
next Thursday's plan before Thursday exists, so writing a note has to be able
to bring a séance into being. A `Session` therefore becomes **a slot**: a
lesson that is scheduled, taught, or merely prepared.

What makes this affordable is a rule already in the code. Attendance counts
**marked rows**, never sessions — `domain/attendance.ts` refuses to define a
default value precisely so that an unmarked pupil reads as *not recorded*
rather than *present*, and the pupil page counts only what a teacher actually
marked. An empty séance therefore contributes nothing to any statistic. The
one visible consequence is that prepared lessons now appear in a class's séance
list, which is wanted.

The rule that replaces the old one:

> A séance with no attendance and no behaviour is not a lesson taught. Anything
> that counts lessons must say so.

**Materialising a session per scheduled lesson stays rejected.** Creation
remains lazy; only the set of things that trigger it grows.

A séance is written on the first recording:

- an attendance mark,
- a behaviour event,
- a character of note text,
- the explicit *Commencer une séance*.

Opening the page writes nothing. Today it does — `getOrCreateTodaySession`
fires from merely visiting the Plan tab — and that is a leak this design
closes, not a behaviour it preserves.

## The Ruling: Notes Belong to a Séance

`DiaryEntry` was keyed `[classId+date]` with no `sessionId`, and that absence
was load-bearing for two reasons. The first — that text on a `Session` would
create a lesson nobody taught — is now answered by the slot ruling above. The
second was that keying on a *start time* would pin text to a clock, so moving a
lesson from 10h to 11h would leave its entry matching nothing. That still
holds, and the answer is that a note is keyed to the **séance**, never to a
time: the séance may move, and its note moves with it.

A class taught twice in a day now has two notes, which is what a teacher means
by them. The old design accepted one shared entry as a cost; there is no longer
a reason to.

**The cahier de textes line does not move.** One free-text box per séance. No
objectives, no due dates, no travail-à-faire field. `PRIVACY.md` and
`README.md` say this app is not the ENT, and the moment a field is named after
an official one, that stops being true.

## Data Model

A note is **a field on `Session`**, not a store of its own:

```ts
export interface Session {
  id: string;
  classId: string;
  subjectId?: string;
  date: number;
  /**
   * Minutes from midnight, when the lesson has a time. Absent for an
   * unscheduled séance — a cover lesson, a catch-up.
   */
  startsAt?: number;
  /** What was done in this lesson. Free text, written and read whole. */
  note?: string;
  createdAt: number;
}
```

`startsAt` is what makes two lessons in a day tellable apart. A `Session`
carries only a date today, and its index is `[classId+date]`, so nothing
distinguishes the 10h séance from the 14h one. Minutes from midnight, never
`"10:05"` — the same unit `ScheduleEntry.startMinute` already uses.

It records **when this lesson was**, and is not a foreign key into the
timetable. A lesson moved from 10h to 11h next term leaves every past séance
holding the time it actually happened at, which is right; the URL's fallback
absorbs the mismatch for links.

No index is added for it. A class has at most a handful of séances on a day,
so `[classId+date]` fetches them and the time is matched in memory.

The same reasoning that embeds `RubricAssessment.criteria` and gives a
`RubricScore` its own row: a note is always read with its séance, written whole
and cleared whole, and there is exactly one. That is a field. A score is
written one cell at a time, which is what a compound key is for.

Optional, and cleared rather than emptied — a `Session` with `note: ""` should
store no `note` at all, the way `writeGrade` refuses a row with neither value
nor note.

### The schema change is one line

Dexie's `.stores()` declares indexes, not fields, so adding `note` needs no
version at all. Dropping the old store does:

```ts
db.version(14).stores({ diaryEntries: null });
```

No upgrade function, per the standing rule that schema changes are disposable.
**Every existing journal entry is lost**, which is accepted. A backup file
written before this version is refused whole by `parseBackup`, which is the
posture `backup.ts` already takes.

Three edits follow and none is optional:

- `backup.ts` builds its export from a literal — `diaryEntries` comes out of
  the type, the schema, the export, the import and the clear list.
- The wipe test and the schema table-list test seed a row per table; both fail
  until `diaryEntries` is removed from them. That failure is the guard.
- A v13 → v14 regression test opens a database built with the old schema using
  current code. `src/db/index.test.ts` is the only place in the suite that runs
  new code against an old row, and CLAUDE.md names it the blind spot.

## Routes

```
/classes/:classId              the lesson (default)
/classes/:classId/eleves       the roster, its own page
/classes/:classId/journal      this class's archive

/classes/:classId/plan         ─┐
/classes/:classId/students      ├─▶ redirect to /classes/:classId
/classes/:classId/books        ─┤
/classes/:classId/diary        ─┘
```

`Carnets` loses its route: the carnets are a panel on the page, and a gradebook
grid is already a full-screen route of its own.

### A link names a séance that may not exist

Aujourd'hui and the timetable point at a specific lesson, and that lesson has
no row until someone records something. The URL therefore names the **slot**:

```
/classes/3B?date=2026-09-08&at=1000
```

`date` is `startOfDay`; `at` is minutes from midnight, the same unit
`ScheduleEntry` already stores — never `"10:05"`. An unscheduled séance carries
`date` alone.

Resolution, in order: a session at that date and time; else a scheduled entry
matching it, shown as a slot with nothing written; else that day's first
séance. The fallback matters because a lesson moved from 10h to 11h leaves
older links naming a time nothing sits at.

Arriving with no parameters — from Classes — the page opens on **today's
lesson if there is one, otherwise the last taught**, never on an empty day. A
quiet *Commencer une séance aujourd'hui* covers the cover lesson and the
unscheduled catch-up.

## The Page

```
3°B  Mathématiques · 24 élèves · salle 204        Élèves · Journal      ⋯
‹  ven 5 sept   │   ● lun 8 sept · 10h00   │   mar 9 sept  ›            ⋯
┌──────────────────────────────────┐  ┌────────────────────────────┐
│  Tous · Groupe A · Groupe B      │  │ NOTES DE LA SÉANCE         │
│  ┌─ plan ─────────────────────┐  │  │ Théorème de Pythagore…     │
│  │  ▦▦   ▦▦   ▦▦              │  │  └────────────────────────────┘
│  │  ▦▦   ▦▦   ▦▦              │  │  ┌────────────────────────────┐
│  └────────────────────────────┘  │  │ CARNETS                    │
│  21 présents · 2 absents         │  │ Mathématiques  T1     12,4 │
└──────────────────────────────────┘  │   [Ouvrir]                 │
```

**The strip** shows the neighbouring séances: past ones from real sessions,
upcoming ones predicted from the timetable, merged exactly as Today merges
them. A lesson that is both scheduled and started renders once.

**The plan** is unchanged. A tap on a pupil opens their card, which is where
attendance and behaviour are recorded, and remains the only place either is
set.

**The group chips** filter the roster and the unseated rail, never the seats —
`filterByGroup(unseatedStudents, …)` today. Filtering seats would leave holes
in a room.

**Notes** save on blur, as `diary/components/day-entry.tsx` already does.

**Carnets** are access, not a grid: name, period, class average, *Ouvrir*, and
*Nouveau*. Fast entry is deliberately absent — see Out of Scope.

**The overflow** beside the strip holds *Commencer une séance* and *Supprimer
cette séance*. Deleting is also offered in the Journal and in *Autres séances*.
It cascades attendance and behaviour, so it stays behind a menu rather than
sitting under a thumb operating the page one-handed with a class in front of
it.

## The Register Without Furniture

A workspace with no salle currently replaces the whole plan tab with a prompt
to create one. On a page that is also the register, that would take attendance,
notes and carnets down with it.

Attendance is a property of a séance, not of a chair. With no salle the seating
region becomes a **roster register**: the class listed, each row carrying the
same marks, and a tap opening the same pupil card. A salle is an upgrade to the
register, never a prerequisite for it, and a teacher who never makes a seating
plan can still use the app every day.

The gesture is deliberately identical on both surfaces. Marks set inline on a
list and through a card on a plan would be two ways to record one fact, which
is the duplication this app keeps refusing.

## The Journal

A day now holds one entry per séance, so the archive groups them:

```
Lundi 8 septembre
  10h00  3°B   Pythagore, démonstration par les aires
  14h00  5°A   Lecture suivie, chapitre 4
```

Cross-class, searchable, filterable by class, as today. Recording, a teacher
thinks in lessons; looking back, they think in days. Both stay true.

`/classes/:classId/journal` is the same view pinned to one class, as
`DiaryPage` already does with a `classId` prop.

## Testing

Domain and `src/db` are TDD as usual. The UI is verified by driving a browser.

Tests that must exist, because each guards a ruling rather than a line:

- Opening the page writes nothing. Count sessions, render, count again.
- Each trigger creates a séance exactly once: a mark, a behaviour event, note
  text, the explicit button. `getOrCreateTodaySession` already re-checks inside
  its transaction; the new triggers need the same guarantee under StrictMode's
  double-invoked effects.
- A note on a future date creates a séance — the inverse of the test that used
  to assert it must not.
- An empty séance changes no attendance statistic.
- Clearing a note removes the field rather than storing `""`.
- Slot resolution: a session wins over a scheduled entry; a time matching
  nothing falls back to the day's first séance.
- The v13 → v14 open, per Data Model.

## Files

- `src/db/types.ts` — `Session.note`
- `src/db/index.ts` — `version(14)`, dropping `diaryEntries`
- `src/db/sessions.ts` — the note write, and slot resolution
- `src/db/backup.ts` — `diaryEntries` out, everywhere
- `src/db/diary.ts` — removed; the journal reads sessions
- `src/domain/schedule.ts` — merging sessions with scheduled entries for the strip
- `src/router.ts` — one class route plus two sub-routes, four redirects
- `src/modules/class/page.tsx` — the one-pager, replacing the tab shell
- `src/modules/class/tabs/` — removed; `students.tsx` becomes the `eleves` route
- `src/modules/plan/page.tsx` — the plan, minus session selection
- `src/modules/plan/components/session-bar.tsx` — removed, replaced by the strip
- `src/modules/diary/page.tsx` — days grouping séances
- `src/modules/today/page.tsx` — links carrying `date` and `at`

## Out of Scope

- **Fast entry from the class page.** `/gradebooks/:id/entry/:columnId` stays
  and stays reachable from the grid. Deciding which column a *Saisie rapide*
  would target is a question of its own, and every answer had a real cost.
- **Migrating existing notes.** They are lost. Writing the first upgrade
  function in the codebase to save them would also invent séances for days that
  only ever had a note.
- **Travail à faire, due dates, objectives.** Reopening that means reopening
  whether this app claims to be a cahier de textes.
- **Materialising sessions from the timetable.** Still rejected, for the reason
  it always was.
