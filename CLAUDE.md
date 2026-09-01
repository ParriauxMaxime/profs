# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`profs` is a local-only gradebook PWA for teachers — an open-source subset of iDoceo. Everything lives in the browser's IndexedDB. There is no backend, no account, and **no network request of any kind**.

That last point is a product requirement, not a preference: the app holds the names and grades of minors, and `README.md` / `PRIVACY.md` promise in writing that nothing leaves the device. Introducing a `fetch`, a CDN font, an analytics call, or an external image would break a documented claim. If a task seems to need one, stop and raise it.

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

**Validation gate — all four must be green before any change is considered done:**
`yarn format && yarn lint && yarn typecheck && yarn test`

Run a single suite or test:

```bash
yarn test src/domain/gradebook/average.test.ts
yarn test -t "normalises a /100 column"
```

## Architecture

Three layers, and the boundaries are enforced by review:

**`src/domain/`** — pure logic. No React, no Dexie, no I/O. This is the only place with real unit tests, and it is where the rules that must not drift live: column types and grade-value parsing/formatting (`gradebook/grade.ts`, `gradebook/column.ts`), weighted averages and class statistics (`gradebook/average.ts`), CSV roster parsing (`gradebook/csv.ts`), accent-insensitive search (`search.ts`), and the workspace registry (`workspaces.ts`). Domain constants use the `as const` array + derived type pattern; they never get inlined into a component.

**`src/db/`** — Dexie. `openWorkspaceDb(workspaceId)` opens `profs-<id>`; each workspace is its own database. Seven tables: `classes`, `students`, `subjects`, `gradebooks`, `periods`, `columns`, `grades`. `provider.tsx` exposes `useDb()`; `init.ts` runs once before first render; `seed.ts` creates the demo school; `backup.ts` does JSON export/import.

**`src/modules/<name>/page.tsx`** — one page per route, with module-local `components/`. `design-system/` holds shared UI, `shared/` the layout. There is no `src/routes/` folder — each module owns its page. Components read the database through `useLiveQuery` and hold UI state only.

Routes (`src/router.ts`, Chicane): `/`, `/classes/:classId`, `/gradebooks/:gradebookId`, `/gradebooks/:gradebookId/entry/:columnId`, `/settings`.

### Invariants worth knowing before you touch anything

- **Grades use the compound primary key `[gradebookId+columnId+studentId]`.** That is the whole point of the schema: editing one cell is a single-row `put`, and clearing it is a single-row `delete`. Never read-modify-write a collection of grades. Build the key with `gradeKey()` — it is the only constructor.
- **Averages are computed on read, never stored.** A stored average goes stale the moment a weight changes. `studentAverage` takes the FULL column list plus a `periodId` and filters internally — passing an already-filtered list changes results silently.
- **Every numeric column is normalised to /20 by its own `max`** before weighting, so a /100 test and a /20 test can be averaged together. Only numeric columns count toward an average; the other five types never do.
- **Three distinct input outcomes, and they must stay distinct**: blank input *clears* the cell (deletes the row), a valid value *stores*, and an invalid one (unparseable, negative, above the column's `max`) is *refused* — nothing is written and the existing mark survives, with the bad input left visible so it can be corrected. Both the grid cell and the fast-entry screen implement this; `isBlankInput` and `parseGradeValue` in `domain/gradebook/grade.ts` are the shared rule.
- **Attendance and other stored values are raw domain strings.** Only the *display* is translated (`gradebook.attendance.*`). Never persist a translated label.

### Conventions that will trip you up

- **Never `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use a two-step in-place confirm: first click arms, second click acts, with a cancel beside it.
- **i18n:** `fr` is both the default and the fallback, `en` alongside. Every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `en.json` — a parity test fails the build otherwise. Plurals use i18next v4 suffixes (`_one` / `_other`). Never pass an interpolation variable named `count` unless you actually want plural resolution.
- **Naming:** identifiers are English; only translation values are French. `class` is reserved, so the row type is `SchoolClass` while the table stays `classes`. The column row type is `GradeColumn`, never `Column` — that collides with TanStack Table's export.
- **Navigation** uses Chicane `<Link to={Router.X({...})}>`. A raw `<a href>` causes a full page reload.
- **State bound to a record must be anchored to that record's identity, never to its position.** This codebase has produced the same bug three times, in three disguises, and every instance risked writing to or deleting the wrong student:
  - A form bound to a record needs a `key` that changes with the record — `react-hook-form` captures `defaultValues` at mount, so without one, switching the edit target writes one student's values onto another.
  - A row-local armed/confirm state needs the table's React key to be the record id. TanStack Table's `row.id` defaults to the **row index**, so `DataTable` takes a `getRowId` and callers must pass it; otherwise sorting or searching while a delete is armed retargets it onto whoever now sits at that index.
  - A control acting on a *selected* record (the period delete beside the switcher) needs a `key` on that selection, or changing the selection while armed destroys the newly selected one.
  When you add any armed, staged, or draft state, ask what happens if the underlying list reorders or the selection changes underneath it.
- IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.

### Testing posture

Domain and `src/db` modules are TDD, tested against `fake-indexeddb`. **There are deliberately no component tests** (matching the sibling `open-setlist` project) — UI is verified by reading and by driving a real browser. Do not add a component-test framework without being asked.

### Deleting things

Every multi-table delete lives in `src/db/cascade.ts` (`deleteStudent`, `deleteColumn`, `deletePeriod`, `deleteGradebook`, `deleteClass`), each one a single `rw` transaction covering every table it touches. If you find yourself writing a multi-table delete inline in a component, stop and add it there with tests instead — an orphaned grade row is invisible in the UI, never averaged, and survives export/import.

`deleteSubject` is the exception that **refuses** rather than cascades: it returns `{ deleted: false, reason: "in-use", gradebookCount }` and writes nothing when a gradebook still references the subject. Destroying gradebooks as a side effect of removing a subject is too much to do implicitly.

Destructive actions in the UI go through `ConfirmButton` (two-step, in place). Its confirm label should say what else goes — the column delete names its grades, the class delete names its students and their grades, the period delete names the period.

## Known v1 gaps

- No sync of any kind. JSON export/import in Réglages is the only way to move data between devices, and it omits student photos (they are `Blob`s and cannot survive `JSON.stringify`) — both documents say so, and any change here must keep them accurate.
- A gradebook cannot be renamed after creation, and periods cannot be reordered.
- `src/modules/dashboard/page.tsx` imports `ClassForm` from the class module. That crosses the module boundary this file otherwise describes; it is an accepted exception rather than an oversight, since both screens create classes.

## Reference

- `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md` — the v1 design and its rationale
- `docs/superpowers/plans/2026-09-01-profs-gradebook-v1.md` — the implementation plan it was built from
- `docs/BACKLOG.md` — post-v1 features requested by a practising teacher, with the privacy questions each one raises
- `../open-setlist/` — the sibling project this stack was copied from; when a pattern here is unclear, its equivalent file is usually the answer
