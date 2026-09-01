# Backlog — post-v1

v1 is the gradebook (see `docs/superpowers/specs/2026-09-01-profs-gradebook-design.md`).
This file holds what comes after, in priority order. Each entry gets its own
spec → plan → implementation cycle.

## 1. Grilles d'évaluation (rubrics) — highest value

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

## Source

Feature requests from a practising teacher (relayed by Maxime, 2026-09-01),
describing what they actually use iDoceo for.
