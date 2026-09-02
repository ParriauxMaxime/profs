# profs

An open-source gradebook for teachers. Classes, students, grades, averages —
in your browser, on your device, offline.

`profs` is a local-only alternative to iDoceo. There is no server, no account,
and no subscription.

## Features (v1)

- **A seeded demo school** — on first run, v1 creates one workspace
  ("Mon établissement") pre-populated with two classes (3°B and 5°A), a
  gradebook each, and grades. The demo data is offered once per workspace: if
  you delete everything, it stays deleted. There is no UI yet to create a new
  class, subject, or gradebook; you work within the seeded structure.
- **Today** — the app opens on the day's lessons rather than on a list of
  what exists: the ones your timetable predicts, plus any you have already
  started, in time order. A lesson that is both appears once, marked as under
  way. Tapping one opens the class and starts recording.
- **Timetable** — declare your recurring week once (day, time, class, subject,
  room), with **A/B alternating weeks** worked out from a single start-of-year
  date you set in Réglages. Overlapping lessons are flagged, never refused.
  The timetable predicts; it never creates a lesson that did not happen, so a
  holiday leaves no empty session in anybody's attendance.
- **Students** — add, edit, and delete students within a class, plus CSV
  import (semicolon, comma, or tab) for a whole roster at once
- **Gradebooks** — one per class and subject, split into terms, with columns
  you add, edit, and delete yourself
- **Typed columns** — numeric marks with any scale, letters, icons, checkboxes,
  free text, attendance, and **calculation columns** (weighted mean, sum,
  best-of-N, or count) whose value is derived from other numeric columns and
  never stored — display-only, so it never duplicates or feeds the average
- **Cell annotations** — a free-text note on any grid cell, independent of the
  mark, visible on both the grid and fast entry
- **Student groups** — named subsets of a class, reusable to filter the
  gradebook grid; a way of selecting and viewing pupils, never a thing that
  holds a grade
- **Weighted averages** — every numeric column normalised to /20 by its own
  scale, with class statistics
- **Fast entry** — a phone-sized keypad for grading a whole class in class
- **Backup** — JSON export and import to move data between your devices (no
  sync; photos are not included in the export, since a JSON file cannot carry
  a `Blob` — student notes, including any accommodation details, **are**
  included)
- **Seating plan** — a spatial layout per class, tap to seat or unseat a
  pupil, with a photo shown in the seat
- **Attendance** — present / absent / late / excused, recorded per pupil per
  session from the seating plan
- **Behaviour log** — a per-pupil, timestamped timeline of observations
  (encouragement, warning, note home, free note), with counts and a pupil
  detail page
- **Rubrics** — a live 1–4 competency grid (grilles d'évaluation) for scoring
  a whole class during an oral, a practical, or a group exercise: reusable
  templates, one tap per level, per-pupil means and per-criterion
  distributions. Deliberately never feeds the gradebook average.
- **Offline** — installable PWA, works with no network at all

## Privacy

Your data never leaves your device. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
yarn install
yarn dev        # http://localhost:3000
yarn build      # production build into dist/
yarn preview    # serve the production build from dist/

# The validation gate — all four must be green
yarn format     # biome check --fix
yarn lint       # biome check
yarn typecheck  # tsc --noEmit
yarn test       # unit tests
```

## Stack

React 19, TypeScript, Dexie (IndexedDB), Chicane, TanStack Table, Tailwind CSS
v4, Rspack, Biome, Jest.

## Licence

MIT — see [LICENSE](LICENSE).
