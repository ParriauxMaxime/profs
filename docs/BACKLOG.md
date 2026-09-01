# Backlog — post-v1

v1 is the gradebook (see `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md`).
This file holds what comes after, in priority order. Each entry gets its own
spec → plan → implementation cycle.

## 1. Grilles d'évaluation (rubrics) — highest value

**Status: deferred to Plan B.** Not part of phase 2A; still open below.

A teacher enters a list of criteria and gets a double-entry table: students down
one axis, criteria across the other, each cell an acquisition level **1 to 4**.

The decisive requirement: **it is used live, while assessing students** — during
an oral, a practical, a group exercise. That makes it a fast-entry surface first
and a report second: large tap targets, one tap per level, no dialogs, no save
button, works on a phone held in one hand.

Open questions for its spec:
- Is a rubric attached to a gradebook column (so it feeds the average), standalone,
  or both? A 1–4 level is not a mark out of 20 — decide whether and how it converts.
- Are rubrics reusable across classes and years (a template library), or per assessment?
- Does a criterion carry a weight?
- What does the 1–4 scale render as — numbers, colors, labels (non acquis / en cours /
  acquis / expert)? French competency reporting suggests labels with colors.

## 2. Plan de classe (seating chart) with trombinoscope

**Status: delivered, phase 2A.** One seating layout per class (`src/modules/plan`),
photos shown in the seat, tap-to-seat/unseat. A single layout per class shipped —
see the deferred multiple-layouts entry below for what was cut.

A spatial layout of the room, showing each student's photo where they sit.

- Drag students into seats; a room can have several layouts (exam, group work).
- Photos come from the device, stay in IndexedDB as blobs, and are never uploaded —
  this is the most privacy-sensitive data in the app and needs its own section in
  `PRIVACY.md`, plus a clear delete path.
- Per-student notes visible from the plan: **accommodations and needs** (handicap,
  PAP, PPRE, tiers-temps, placement constraints). Sensitive personal data — likely
  special-category under GDPR — so the spec must cover how it is displayed (not
  over a shoulder), exported, and wiped.
- The seating chart is also the fastest surface for taking attendance and for the
  sanctions below, so those three features share a data model and probably ship close together.

## 3. Historique des sanctions (behaviour log)

**Status: delivered, phase 2A.** Append-only `BehaviourEvent` rows, four types
(`green`/`yellow`/`red`/`note`), logged one tap from the seating plan's pupil
card, with counts and a full timeline on the pupil page
(`src/modules/student`). A period filter on the counts was deliberately left
out — see below.

A visual, per-student behaviour history using football-card semantics:
**yellow card = avertissement, red card = mot dans le carnet**, with room for
other event types.

- Every event is timestamped and belongs to a session, so the history reads as a
  timeline per student and per class.
- Entry must be one tap from wherever the teacher already is — the seating chart
  or the grid — because it happens mid-lesson.
- Aggregates matter: "three yellows this trimestre" is the thing a teacher reports
  to a parent or a CPE.
- Same privacy weight as the accommodation notes: disciplinary records about minors.

## 4. Multiple seating layouts per class

Phase 2A ships exactly one `SeatingLayout` per class (created lazily on first
visit to the plan page). iDoceo's "a room can have several layouts (exam,
group work)" was explicitly deferred: it needs a layout switcher in the UI and
a decision on which layout attendance/behaviour attach to when more than one
exists for the same session. `deleteSeatingLayout` in `src/db/cascade.ts`
already supports removing one of several, so the schema is not the blocker —
the UI and the "which layout is active" question are.

## 5. Behaviour counts by period

The pupil page's behaviour counts (`countByType`) are deliberately computed
over **all** events, with no period filter, by design in phase 2A. A
teacher reporting "three warnings this trimestre" needs the count scoped to a
period, which requires deciding how a session (dated, not period-bound) maps
to a gradebook period. Left for a later pass rather than invented during
phase 2A.

## Source

Feature requests from a practising teacher (relayed by Maxime, 2026-09-01),
describing what they actually use iDoceo for.

---

# iDoceo feature gap analysis

Source: `https://idoceo.net/index.php/en/instructions/quick-start` (read 2026-09-01),
cross-referenced against what `profs` ships after v1 and phase 2.

## Already covered

| iDoceo feature | Where it lives here |
|---|---|
| Classes with their own student list | `SchoolClass` + `/classes/:classId` |
| Gradebook columns, per-type cell editors | `COLUMN_TYPES`, `EditableCell` |
| Tabs/pages for terms | `Period`, per gradebook |
| Attendance | Session-based, phase 2A — deliberately NOT a column type |
| Seating plan | Phase 2A |
| Student photos | Phase 2A |
| Rubrics (1–4 grids) | Phase 2B |
| CSV import, paste from clipboard | v1 `csv.ts` + paste textarea |
| Backup & restore | v1 JSON export/import |
| Averages and weighting | v1 `average.ts` |

## Incompatible with this project — will not be built

- **Google Classroom integration.** Requires network calls to a third party and
  would send minors' names and grades off-device. `README.md` and `PRIVACY.md`
  promise in writing that nothing leaves the device. This is not a scheduling
  question; it contradicts the product.
- **Class sharing between users.** Same reason. The nearest thing that stays
  honest is the existing JSON export, which the teacher moves themselves.

Any future demand here needs a product decision first, not an implementation.

## Missing, ranked by value against cost

### 1. Cell annotations — nearly free, ships next
`Grade.note?: string` already exists in the v1 schema and **nothing writes or
reads it**. iDoceo treats "add extensive annotations to any cell" as core: it is
where a teacher records why a mark is what it is. Needs a note affordance on the
grid cell and on fast entry, plus an indicator on an annotated cell. No schema
change.

### 2. Calculation columns
A column whose value is derived from other columns — the average of a set, a
best-of-N, a sum. Today `average.ts` computes one gradebook-wide weighted
average and nothing else. Open questions: how is a formula expressed without
becoming a spreadsheet language, and does a calculation column feed other
calculations (cycles)? Suggest a small fixed set of aggregate kinds over a
chosen column set, not a formula parser.

### 3. Student groups
Named subsets of a class, reusable across the seating plan (group-work layout),
rubrics, and filtering. Cheap schema (`groups`, `groupMembers`), broad payoff.

### 4. Class duplication and templates
"Same structure, new year" is a teacher's September. Duplicating a class with
its columns and periods but no grades, and saving a class as a template, are
both mechanical given the cascade work already done.

### 5. Student reports — PARKED (Maxime, 2026-09-01)
Out of scope for now. Kept here with its open questions rather than deleted.

Per-pupil printable summary: grades, average, attendance, behaviour, rubrics.
High value and the natural consumer of everything phase 2 adds. Must be
print/HTML — no external service, no upload.

### 6. Resources manager — PARKED (Maxime, 2026-09-01)
Out of scope for now. The storage-budget question below stays unanswered.

Files, audio, images attached to a class, a pupil, or a cell. Stored as Blobs in
IndexedDB. Needs a storage-budget answer first: photos already push at quota,
and video would blow it. Ship only with a size cap and a visible usage figure.

### 7. Timetable, diary, planner — WANTED, needs its own brainstorm (Maxime, 2026-09-01)
iDoceo's schedule drives its diary and planner. This was an explicit v1
non-goal. Phase 2's `Session` is the seed of it — a session is already a lesson
on a date — so a timetable becomes "generate the sessions for the term".
Largest item here; deserves its own spec.

### 8. Small wins
Class icon/colour on the dashboard; copy/move a cell, column, or pupil between
classes; full-screen grid; XLS import beside CSV (a parser dependency — weigh
it against the no-network, small-bundle posture).

## Decisions taken 2026-09-01

- **Build next, as "Plan C", in this order:** cell annotations (#1), student
  groups (#3), calculation columns (#2). Groups land before calculations so an
  aggregate scoped to a group does not force a rework.
- **Cross-device stays JSON export/import.** This is the answer, not a gap. No
  sync, no account, no third-party integration. A future session should not
  re-open this as missing functionality.
- **#5 and #6 are parked**, not rejected.
- **#7 is wanted** and gets its own spec cycle. Note for whoever writes it:
  phase 2's `Session` is already a lesson on a date, so a timetable is largely
  "generate the term's sessions". That also means the timetable would take over
  ownership of session lifecycle from the current lazy get-or-create, which is
  the main thing its spec has to settle.
- **Open question for #2, defaulting to "no" unless overridden:** may a
  calculation column reference another calculation column? Allowing it requires
  cycle detection; forbidding it keeps the first version simple.
