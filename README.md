# profs

An open-source gradebook for teachers. Classes, students, grades, averages —
in your browser, on your device, offline.

`profs` is a local-only alternative to iDoceo. There is no server, no account,
and no subscription.

## Features (v1)

- **A seeded demo school** — v1 ships with one pre-populated workspace
  ("Collège Démo"). There is no UI yet to create a new class, subject, or
  gradebook; you work within the seeded structure.
- **Students** — add, edit, and delete students within a class, plus CSV
  import (semicolon, comma, or tab) for a whole roster at once
- **Gradebooks** — one per class and subject, split into terms, with columns
  you add yourself
- **Typed columns** — numeric marks with any scale, letters, icons, checkboxes,
  free text, attendance
- **Weighted averages** — every numeric column normalised to /20 by its own
  scale, with class statistics
- **Fast entry** — a phone-sized keypad for grading a whole class in class
- **Backup** — JSON export and import to move data between your devices (no
  sync; photos are not included in the export, since a JSON file cannot carry
  a `Blob`)
- **Offline** — installable PWA, works with no network at all

## Privacy

Your data never leaves your device. See [PRIVACY.md](PRIVACY.md).

## Development

```bash
yarn install
yarn dev        # http://localhost:3000
yarn build      # production build into dist/
yarn test       # unit tests
yarn lint       # biome
yarn typecheck  # tsc --noEmit
```

## Stack

React 19, TypeScript, Dexie (IndexedDB), Chicane, TanStack Table, Tailwind CSS
v4, Rspack, Biome, Jest.

## Licence

MIT — see [LICENSE](LICENSE).
