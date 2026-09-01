# profs — Phase 2: the classroom (design)

**Date:** 2026-09-01
**Status:** Approved, ready for implementation planning
**Follows:** `2026-09-01-profs-gradebook-design.md` (v1, shipped)

## What This Is

v1 made `profs` a gradebook. Phase 2 makes it usable *during* a lesson.

Three features, requested by a practising teacher as the things they actually
open iDoceo for (recorded in `docs/BACKLOG.md`):

1. **Grilles d'évaluation** — 1–4 competency grids, filled live while assessing.
2. **Plan de classe + trombinoscope** — a seating chart with faces.
3. **Historique des sanctions** — a behaviour log with yellow/red card semantics.

They share one spec because two of them share a data model and all three share
an interaction pattern. They do not share one plan — see *Execution* at the end.

Every v1 constraint still binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs.

## Goals

- A teacher mid-lesson can, in one tap each: mark a pupil present, record a
  yellow card, and set a competency level.
- A seating chart shows who sits where, with photographs, and doubles as the
  entry surface for attendance and behaviour.
- A behaviour history aggregates per pupil and per class over a period.
- A rubric is built once and reused across assessments, classes, and years.

## Non-Goals

- **Multiple seating layouts per class.** One layout per class. Accepted
  trade-off: exam-day rearrangement overwrites the everyday plan, and adding
  multiplicity later requires migrating existing assignments into a default
  layout. Chosen deliberately for a smaller phase 2.
- **Rubric criterion weights.** Rubrics do not feed averages, so a weight would
  tilt a summary number with no downstream consequence.
- **Rubrics feeding the gradebook average.** Explicit: `average.ts` is not
  modified by this phase.
- Timetable or planner, PDF/report export, sync, per-pupil parent sharing.

## Disposable Data — No Migration

**The existing schema and its data are disposable until stated otherwise.**
There is no live installation to protect, so this phase carries no data
migration and pays none of its cost.

Concretely:

- `openWorkspaceDb` moves to `db.version(2).stores({...})` with the new tables
  added and no `.upgrade()` callback. Dexie creates new stores empty.
- Attendance grade rows left behind by v1 are **not** converted. They are
  garbage; the remedy is the existing wipe in Réglages, or deleting the
  database. Development note: getting the demo school back also needs the
  `profs-seeded-workspaces` key cleared from `localStorage`.
- `WorkspaceBackup` moves to `version: 2` and **rejects** version 1 rather than
  upgrading it.
- `seed.ts` is extended to seed the new tables, so a fresh workspace
  demonstrates all three features rather than only the grid.

## Data Model

Added to the seven v1 tables. One database per workspace, unchanged.

```
Session          id, classId, subjectId?, date, createdAt
Attendance       [sessionId+studentId] (compound), value, note?, updatedAt
BehaviourEvent   id, sessionId, studentId, classId, type, comment?, createdAt
SeatingLayout    id, classId, rows, cols, updatedAt
Seat             [layoutId+row+col] (compound), studentId | null
RubricTemplate   id, name, criteria[], createdAt, updatedAt
RubricAssessment id, gradebookId, periodId, sessionId?, name, date, criteria[], createdAt, updatedAt
RubricScore      [assessmentId+criterionId+studentId] (compound), level, updatedAt
```

**Compound keys, again.** `attendance`, `seats`, and `rubricScores` all use a
compound primary key for the same reason `grades` does: the unit of work is one
cell, so setting it is a single-row `put` and clearing it a single-row
`delete`. None of these three is ever read-modify-written as a collection. Each
gets a key constructor beside `gradeKey()` — `attendanceKey()`, `seatKey()`,
`rubricScoreKey()` — and those are the only constructors.

### Session

A session is one lesson: a class, a date, optionally a subject.

`getOrCreateTodaySession(db, classId, subjectId?)` returns the most recent
session for that class dated today, creating one if none exists. Opening the
plan or logging any event calls it — there is nothing for a teacher to remember
to start.

A visible **"nouvelle séance"** action forces an additional session on the same
day, so a class taught twice in one day is representable. That capability is
the whole reason a session is a stored row rather than a `(classId, date)` key.

`subjectId` is optional: a session opened from the class plan need not be about
one subject.

### Attendance

`ATTENDANCE_VALUES` moves out of `domain/gradebook/column.ts` into
`domain/attendance.ts`, unchanged in content: `present | absent | late |
excused`. `attendance` is removed from `COLUMN_TYPES`, and its variant is
removed from `GradeValue` and `gradeValueSchema`. Attendance is a property of a
session, not of a gradebook column, and having both would be two truths about
whether a pupil was in class.

Values are stored as raw domain strings. Only the display is translated
(`attendance.*`), per the v1 rule.

### Seating

One `seatingLayout` per class, get-or-created at a default **5 rows × 6
columns** on first visit.

The `seats` table encodes three distinct states, and they must stay distinct:

| State | Encoding |
|---|---|
| Gap (aisle, doorway, no desk) | no row for that `[layoutId+row+col]` |
| Empty seat | row present, `studentId: null` |
| Occupied seat | row present, `studentId` set |

Creating a layout `bulkPut`s `rows × cols` seat rows — all seats, no gaps; the
teacher removes cells to carve aisles. Resizing adds or removes rows at the
edges. Shrinking must name which pupils would be unseated before it acts;
unseated is not deleted — they return to the pool.

Seats are a table rather than a 2D array on the layout precisely so that
assigning one pupil is not a rewrite of the whole room.

**Interaction is tap-only.** Tap a seat to arm it, then tap a pupil from the
unseated pool to assign. Tap an occupied seat to open that pupil's card. No
drag: drag is the least reliable interaction on touch, and touch is the target
device.

### Behaviour

`BEHAVIOUR_TYPES` in `domain/behaviour.ts`, an `as const` list:

| Value | Meaning | Colour |
|---|---|---|
| `green` | encouragement | green |
| `yellow` | avertissement | amber |
| `red` | mot dans le carnet | red |
| `note` | observation | neutral |

A log that can only record punishment is a bad instrument and reads badly to a
parent, which is why `green` exists. Every event carries an optional free-text
`comment`.

`classId` is denormalised onto the event so a class timeline is one index hit
rather than a join through sessions.

Events are append-only: never edited in place. A mistake is deleted, through
the two-step `ConfirmButton`.

Stored values are raw domain strings; labels are translated for display only.

### Rubrics

A **template** is a reusable named set of criteria, managed in Réglages.

An **assessment** belongs to a gradebook (so it is scoped to one class *and*
one subject) and names a period, defaulting to the active one. It optionally
references the session it was filled during.

Attaching a template **copies** its criteria into the assessment. Copy, not
reference: editing a template later must never silently rewrite a grid a
teacher has already graded.

`RubricCriterion` is `{ id, label }`. Criteria are **embedded** on both the
template and the assessment, while scores live in their own table. The split is
principled: criteria are edited as a whole ordered list (add, remove, reorder),
so a whole-list write is the honest operation; a score is per-cell and must
never be read-modify-written.

Deleting a criterion from an assessment must delete its scores — a cascade, not
an inline component write.

`RUBRIC_LEVELS` in `domain/rubric.ts` is `[1, 2, 3, 4] as const`, each level
carrying a translation key and a palette colour:

| Level | Label (fr) | Colour |
|---|---|---|
| 1 | non acquis | red |
| 2 | en cours d'acquisition | orange |
| 3 | acquis | green |
| 4 | expert | blue |

Colour **and** label, with the number kept visible but small. Colour alone as
the sole carrier of meaning is an accessibility failure. The stored value is
the bare integer.

**Rubrics never feed a gradebook average.** A 1–4 competency level is
deliberately not a mark out of 20. `average.ts` is untouched by this phase.

Reporting is two reads: a per-pupil mean level shown as a chip, and a
per-criterion distribution across the class (how many pupils at each level) —
the read that tells a teacher what to reteach.

## Modules and Routes

| Route | Module | Purpose |
|---|---|---|
| `/classes/:classId/plan` | plan | Seating chart, trombinoscope, live entry |
| `/students/:studentId` | student | Behaviour timeline, attendance summary |
| `/gradebooks/:gradebookId/rubrics` | rubric | Assessment list |
| `/gradebooks/:gradebookId/rubrics/:assessmentId` | rubric | The live grid |

Réglages gains a rubric-template section beside subjects. The class page links
to the plan; the gradebook page links to its rubrics.

`/students/:studentId` was a v1 non-goal. Phase 2 needs it: a behaviour history
has nowhere else to live.

New domain modules: `session.ts`, `attendance.ts`, `behaviour.ts`,
`seating.ts`, `rubric.ts` — all pure, all TDD, no React and no Dexie.

### The live-entry pattern

Binding on the student card, the behaviour buttons, and the rubric grid:

- Tap targets at least 44px.
- One tap commits. No save button, no confirmation on a normal entry.
- Every commit is a single-row write, applied optimistically.
- No dialogs of any kind — `window.confirm` and `alert` remain banned, both
  because they freeze the browser automation used to verify these pages and
  because they are wrong mid-lesson.
- Destructive actions use the two-step in-place `ConfirmButton`.
- Phone first: the rubric grid presents one criterion at a time over a vertical
  pupil list, the same shape as v1's saisie rapide. Desktop widens it to the
  full matrix.

### Identity anchoring

The codebase has produced the same bug three times: state bound to a record
anchored to its position rather than its identity. Phase 2 adds four new
opportunities, and each must carry a `key` on the record id:

- the armed seat,
- the selected pupil card,
- the armed behaviour-event delete,
- the selected rubric criterion.

Any armed, staged, or draft state added here answers the question: what happens
if the underlying list reorders, or the selection changes underneath it?

## Deletion

Every multi-table delete stays in `src/db/cascade.ts`, one `rw` transaction
each. Phase 2 substantially widens the existing ones — this is where orphans
will hide, since an orphaned attendance row is invisible in the UI and survives
export.

- `deleteStudent` — additionally: attendance rows, behaviour events, seat
  assignments (clear to `null`, do not delete the seat), rubric scores.
- `deleteClass` — additionally: sessions, their attendance and behaviour
  events, the seating layout, its seats.
- `deleteGradebook` — additionally: rubric assessments and their scores.
- New: `deleteSession` (its attendance and behaviour events),
  `deleteBehaviourEvent`, `deleteRubricAssessment` (its scores),
  `deleteRubricCriterion` (its scores across the assessment),
  `deleteRubricTemplate`.

Each gets tests asserting **zero orphans** across every affected table, not
merely a reduced row count.

## Photos

`Student.photo?: Blob` already exists in the v1 schema with no UI. Phase 2
fills it in.

An `image/*` file input, canvas-downscaled to a **256px square JPEG** before
storing. Unscaled phone photographs would put several megabytes each into
IndexedDB for a class of thirty. A per-pupil delete removes the blob.

Photos are never uploaded and remain excluded from JSON export — `JSON.stringify`
cannot carry a Blob, and both `README.md` and `PRIVACY.md` already say so.

## Privacy

Phase 2 adds the most sensitive data the app has held, and `PRIVACY.md` gains
one chapter covering all of it:

- **Photographs of minors**, stored as blobs on the device, never transmitted,
  never exported, deletable per pupil.
- **`Student.notes` now also carries accommodations** — PAP, PPRE, tiers-temps,
  placement constraints. This is special-category data under GDPR, and unlike
  photographs, `notes` **is included in JSON export**. That is defensible — the
  export is the teacher's own file on the teacher's own device — but it must be
  written down rather than left for a user to discover.
- **Behaviour records about minors**, timestamped and attributable.

All of it is covered by the existing "supprimer toutes les données", which
remains permanent.

No new network capability is introduced. The app still makes no requests.

## Testing

Unchanged posture. Domain modules and every `src/db` module are TDD against
`fake-indexeddb`. There are deliberately no component tests; UI is verified by
driving a real browser against `yarn dev`.

Cascade tests assert zero orphans across every table a delete touches.

Validation gate before any task is complete:
`yarn format && yarn lint && yarn typecheck && yarn test`.

## Execution

One spec, two plans. Each is a shippable checkpoint.

**Plan A — the classroom.** Schema v2, sessions, attendance (including its
removal from the column types), seating layout and seats, the plan page with
trombinoscope, behaviour events, the student detail page, cascades, seed,
backup v2.

**Plan B — rubrics.** Templates in Réglages, assessments, the live grid,
reporting, cascades. Touches nothing Plan A touches except the router and the
gradebook page's link list.

A is first: it carries the schema change, and B builds on a settled `version(2)`.
