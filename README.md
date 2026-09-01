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
- **Students** — add, edit, and delete students within a class, plus CSV
  import (semicolon, comma, or tab) for a whole roster at once
- **Gradebooks** — one per class and subject, split into terms, with columns
  you add, edit, and delete yourself
- **Typed columns** — numeric marks with any scale, letters, icons, checkboxes,
  free text, attendance
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
