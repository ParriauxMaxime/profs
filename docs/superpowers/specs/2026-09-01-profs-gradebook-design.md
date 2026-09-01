# profs — Gradebook (v1) Design

**Date:** 2026-09-01
**Status:** Approved, ready for implementation planning

## What This Is

`profs` is an open-source, local-only PWA for teachers — a clone of the core of
iDoceo. It runs in the browser on laptop, phone, and tablet, stores everything in
IndexedDB, and never contacts a server.

iDoceo covers gradebook, attendance, planner, seating charts, resources, rubrics,
and reports. That is too large for one spec. This document covers **v1: the
gradebook** only. Later phases (attendance, planner, reports, sync) each get their
own spec.

## Goals

- A teacher can create a school, classes, students, subjects, and gradebooks.
- A teacher can enter grades on a desktop grid and on a phone, in class, quickly.
- Averages and weighting are computed correctly, per period.
- A roster can be imported from CSV — nobody types thirty names.
- The app is installable, works offline, and is RGPD-clean by construction.

## Non-Goals (v1)

- Remote sync. v1 ships JSON export/import only; the open-setlist sync module
  (port + Google Drive / GitHub / file adapters with diff+merge) is ported in a
  later phase.
- Report/PDF export.
- A per-student detail page.
- Attendance, planner, seating charts, resources, rubrics.
- Any backend, account, or network request whatsoever.

## Stack

Reused from `open-setlist`, unchanged:

React 19, TypeScript, Dexie (IndexedDB), `@swan-io/chicane` router, TanStack Table,
Tailwind CSS v4, Rspack, Biome, Jest + ts-jest, i18next, zod, react-hook-form,
dnd-kit.

**Bootstrap:** copy the `open-setlist` scaffold and strip its music domain. The
Rspack/Tailwind/Biome/Jest/PWA configuration is already tuned and the Dexie
per-profile pattern is proven; re-deriving them invites config drift.

**Grid rendering:** extend the existing `DataTable` (TanStack Table) with editable
cells and a pinned first column, rather than building a custom CSS-grid
spreadsheet or pulling in a heavyweight datagrid. TanStack supports column pinning
natively. Class sizes are ~20–35 rows, so virtualization is not needed; add it only
if a real class ever exceeds ~40 rows.

**i18n:** i18next with `fr` and `en` locales, **`fr` is the default**. Domain code
and identifiers are in English (`class`, `student`, `assessment`); only UI strings
are translated.

## Data Model

One Dexie database per workspace, mirroring open-setlist's per-profile databases:
`openWorkspaceDb(workspaceId)` → `profs-<workspaceId>`.

```
Workspace  id, name, year                          // "école", one seeded by default
Class      id, workspaceId, name, level            // 3°B
Student    id, workspaceId, classId, firstName, lastName, photo?, notes
Subject    id, workspaceId, name, color
Gradebook  id, workspaceId, classId, subjectId, name
Period     id, gradebookId, name, order            // trimestre 1..3
Column     id, gradebookId, periodId, type, label, weight, max?, order, date?
Grade      [gradebookId+columnId+studentId] (compound key), value, note?
```

**Hierarchy rationale.** Students belong to a class; a gradebook is created per
(class, subject). A student taught in two subjects is entered once and reused
across gradebooks — unlike iDoceo's independent tabs, which duplicate rosters.

**Periods hang off the gradebook**, not the workspace: a teacher may run trimestres
in one subject and semestres in another, and a period's boundaries are a property
of how that course is assessed.

**Grades use a compound key** `[gradebookId+columnId+studentId]` rather than an
array on the column. This makes a single-cell edit a single-row write, keeps
queries by student and by column both indexable, and avoids read-modify-write races
when two tabs are open on the same class.

### Column types

`Column.type ∈ numeric | letter | icon | checkbox | text | attendance`, defined in
`src/domain/gradebook/column.ts` using the project's TypeScript-safe enum pattern
(`as const` object + derived type + values list), per the repo convention that
domain constants never live inline in components.

`Grade.value` is a discriminated union keyed on the column type, validated with
zod at the boundary. A `numeric` column carries a `max` (20, 100, 6 — configurable
per column); other types ignore it.

**Averages are computed on read** (memoized), never stored. Stored averages go
stale the moment a weight changes.

## Modules and Routes

Chicane routes, one `page.tsx` per module, following the `src/modules/<module>/`
convention (no `src/routes/` folder):

| Route | Module | Purpose |
|---|---|---|
| `/` | dashboard | Classes and gradebooks, quick links |
| `/classes/:classId` | class | Roster, CSV import, add student |
| `/gradebooks/:id` | gradebook | The grid — canonical view |
| `/gradebooks/:id/entry/:columnId` | entry | "Saisie rapide", one column at a time |
| `/settings` | settings | Workspace, subjects, periods, JSON export/import |

- `src/modules/design-system/` — gains `EditableCell`, `NumberPad`,
  `ColumnTypeIcon`; `DataTable` gains a pinned-first-column option and editable
  cells.
- `src/modules/shared/` — `admin-layout` and `nav-link` ported as-is.
- `src/domain/gradebook/` — `column.ts` (types), `grade.ts` (value union),
  `average.ts` (weighting), `csv.ts` (roster parsing).
- `src/db/` — `openWorkspaceDb(workspaceId)`, `seed.ts`.

All internal navigation uses Chicane `<Link to={...}>`; raw `<a href>` causes full
page reloads and is never used.

## Mobile Shape

The grid does not fit 375px, so v1 ships both views:

1. **Frozen name column + horizontal scroll** — the canonical grid, identical on
   desktop and phone. The student name column is pinned left, assessment columns
   scroll horizontally. Tapping a cell opens an edit popover.
2. **Column-at-a-time entry ("saisie rapide")** — reached from any column header.
   Shows one assessment and a vertical list of students with a number pad. This is
   the in-class grading loop.

Entry mode is a **route, not a modal**: it is deep-linkable from a column header,
and the phone's back button behaves correctly.

## Computation, Import, Seed

### Averages

Pure functions in `src/domain/gradebook/average.ts` — no DB access, no React.

`studentAverage(grades, columns, period)` = `Σ(normalized value × weight) / Σweight`,
skipping empty cells and non-numeric column types. Values normalize to /20 for
display via `column.max`. Class statistics (min, max, mean, median) live in the
same module.

### CSV roster import

A paste-textarea plus a file input. The delimiter is sniffed among `,`, `;`, and
tab — French Excel emits `;`. A mapping step lets the user say which column is the
last name and which is the first name. Rows are zod-validated and shown in a
preview table before the confirm, which does a single `bulkAdd`.

Duplicates are detected on `lastName + firstName` within the class and **flagged
for the user to resolve** — never silently merged, since two students can
legitimately share a name.

### Seed

`src/db/seed.ts` creates a demo workspace when the database is empty, exactly as
open-setlist's seed does: workspace "Collège Démo", two classes (3°B with 24
students, 5°A with 22), subjects Maths and Français, one gradebook each with three
periods and five or six mixed-type columns, populated with plausible French names
and grades.

## PWA, Privacy, Testing

**PWA.** `public/manifest.json` and `public/sw.js` ported from open-setlist,
precaching the app shell, offline-first. v1 makes **no network calls at all**, so
there is no CORS proxy worker — unlike open-setlist, the `worker/` directory does
not exist here.

**RGPD.** No telemetry, no external requests, no CDN fonts (self-hosted). Data
never leaves IndexedDB unless the user explicitly exports it. Student photos are
stored as blobs in IndexedDB and are never uploaded. Settings offers "supprimer
toutes les données", which wipes the database. This is documented in `README.md`
and a short `PRIVACY.md` — for an app holding minors' grades, it is the main
argument over iDoceo.

**Testing.** Jest + ts-jest, unit tests on `average.ts`, `csv.ts`, and column-type
validation — the logic that silently corrupts a bulletin when wrong. No component
tests in v1, matching open-setlist.

**Validation gate**, per the project CLAUDE.md convention, before any plan is
considered complete:

1. `yarn format`
2. `yarn lint`
3. `yarn typecheck`
4. `yarn test`

## Repository

Git repository initialised at `profs/`, default branch `main`. Open-source; licence
to be chosen before the first public push (not a v1 implementation blocker).
