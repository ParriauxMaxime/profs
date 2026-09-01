# Phase 2A — The Classroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `profs` a lesson-time surface — a seating chart with photographs that doubles as the entry point for attendance and a behaviour log, backed by a stored `Session` row.

**Architecture:** Four new tables (`sessions`, `attendance`, `seatingLayouts`, `seats`) plus `behaviourEvents`, added at Dexie `version(2)` with no migration. Attendance stops being a gradebook column type and becomes a property of a session. Two new routes: a class seating plan and a per-pupil detail page. All new logic lands in pure `src/domain/` modules with unit tests; all multi-table deletes land in `src/db/cascade.ts`.

**Tech Stack:** React 19, TypeScript strict, Dexie 4 + dexie-react-hooks, Chicane, Tailwind v4, i18next, zod, Jest + ts-jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-01-profs-phase2-classroom-design.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN font, no external image, no analytics. This is a documented promise in `README.md` and `PRIVACY.md`, not a preference.
- **No `window.confirm`, `alert`, `prompt`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use the existing two-step `ConfirmButton`.
- **i18n parity:** every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json`. A parity test fails the build otherwise. `fr` is default and fallback.
- **Stored values are raw domain strings, never translated labels.** Only display is translated.
- **Identifiers are English; only translation values are French.**
- **Compound-key rows are never read-modify-written as a collection.** One cell is one `put` or one `delete`.
- **State bound to a record is anchored to that record's identity, never its position.** Every armed/staged/draft state gets a `key` on the record id.
- **Navigation uses Chicane `<Link to={Router.X({...})}>`.** A raw `<a href>` causes a full page reload.
- IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.
- **Validation gate — all four green before a task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- Existing data is disposable. No migration code, no dual-format import.

---

## File Structure

**Created:**
- `src/domain/attendance.ts` — attendance values (moved out of `gradebook/column.ts`)
- `src/domain/attendance.test.ts`
- `src/domain/behaviour.ts` — behaviour event types
- `src/domain/behaviour.test.ts`
- `src/domain/seating.ts` — grid helpers, seat identity
- `src/domain/seating.test.ts`
- `src/db/sessions.ts` — `getOrCreateTodaySession`, `createSession`
- `src/db/sessions.test.ts`
- `src/modules/plan/page.tsx` — the seating plan
- `src/modules/plan/components/seat-grid.tsx`
- `src/modules/plan/components/student-card.tsx`
- `src/modules/plan/components/unseated-pool.tsx`
- `src/modules/plan/components/layout-size-form.tsx`
- `src/modules/student/page.tsx` — pupil detail, behaviour timeline
- `src/modules/design-system/components/photo-input.tsx` — file → downscaled Blob

**Modified:**
- `src/db/types.ts` — five new interfaces, `Student` unchanged
- `src/db/index.ts` — `version(2)`, new tables, three key constructors
- `src/db/cascade.ts` — widen four, add five
- `src/db/cascade.test.ts` — orphan assertions
- `src/db/backup.ts` — `version: 2`, new tables
- `src/db/seed.ts` — seed the new tables, drop the attendance column
- `src/domain/gradebook/column.ts` — remove `attendance` from `COLUMN_TYPES` and `ATTENDANCE_VALUES`
- `src/domain/gradebook/grade.ts` — remove the attendance variant
- `src/domain/gradebook/grade.test.ts` — remove attendance cases
- `src/modules/design-system/components/editable-cell.tsx` — drop the attendance branch
- `src/modules/design-system/components/column-type-icon.tsx` — drop the entry
- `src/modules/entry/page.tsx` — drop the attendance display branch
- `src/router.ts`, `src/app.tsx` — two routes
- `src/modules/class/page.tsx` — link to the plan
- `src/i18n/locales/fr.json`, `en.json`
- `PRIVACY.md`, `README.md`, `CLAUDE.md`

---

### Task 1: Schema v2 — types, tables, key constructors

**Files:**
- Modify: `src/db/types.ts`
- Modify: `src/db/index.ts`
- Test: `src/db/index.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `Session`, `AttendanceRecord`, `BehaviourEvent`, `SeatingLayout`, `Seat` interfaces; `attendanceKey(sessionId, studentId)`, `seatKey(layoutId, row, col)` returning tuples; `AppDatabase` gains `sessions`, `attendance`, `behaviourEvents`, `seatingLayouts`, `seats`.

Note: rubric tables are **not** added here. They belong to Plan B, which will bump to `version(3)`.

- [ ] **Step 1: Add the row types**

Append to `src/db/types.ts` (the file already imports `ColumnType` and `GradeValue`; add the two new domain imports at the top):

```ts
import type { AttendanceValue } from "@domain/attendance";
import type { BehaviourType } from "@domain/behaviour";
```

```ts
/**
 * One lesson: a class, a date, optionally a subject. Attendance and behaviour
 * events hang off it. A stored row rather than a (classId, date) key so that a
 * class taught twice in one day is representable.
 */
export interface Session {
  id: string;
  classId: string;
  subjectId?: string;
  date: number;
  createdAt: number;
}

/** One pupil's presence at one session. Keyed [sessionId+studentId]. */
export interface AttendanceRecord {
  sessionId: string;
  studentId: string;
  value: AttendanceValue;
  note?: string;
  updatedAt: number;
}

/**
 * One behaviour observation. Append-only: never edited in place, only deleted.
 * `classId` is denormalised so a class timeline is one index hit.
 */
export interface BehaviourEvent {
  id: string;
  sessionId: string;
  studentId: string;
  classId: string;
  type: BehaviourType;
  comment?: string;
  createdAt: number;
}

/** The room. One per class. */
export interface SeatingLayout {
  id: string;
  classId: string;
  rows: number;
  cols: number;
  updatedAt: number;
}

/**
 * One cell of the room. Keyed [layoutId+row+col].
 *
 * Three states, and they must stay distinct: no row at all is a gap (an aisle
 * or a doorway), a row with `studentId: null` is an empty seat, and a row with
 * a `studentId` is an occupied one.
 */
export interface Seat {
  layoutId: string;
  row: number;
  col: number;
  studentId: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/db/index.test.ts`:

```ts
import "fake-indexeddb/auto";
import { attendanceKey, openWorkspaceDb, seatKey } from ".";

describe("schema v2", () => {
  it("builds an attendance key", () => {
    expect(attendanceKey("s1", "p1")).toEqual(["s1", "p1"]);
  });

  it("builds a seat key", () => {
    expect(seatKey("l1", 2, 3)).toEqual(["l1", 2, 3]);
  });

  it("opens with every phase 2 table", async () => {
    const db = openWorkspaceDb("schema-v2");
    await db.open();
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "attendance",
        "behaviourEvents",
        "classes",
        "columns",
        "gradebooks",
        "grades",
        "periods",
        "seatingLayouts",
        "seats",
        "sessions",
        "students",
        "subjects",
      ].sort(),
    );
    db.close();
  });

  it("round-trips a seat on its compound key", async () => {
    const db = openWorkspaceDb("schema-v2-seat");
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: null });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });
    expect(await db.seats.count()).toBe(1);
    expect(await db.seats.get(seatKey("l1", 0, 0))).toEqual({
      layoutId: "l1",
      row: 0,
      col: 0,
      studentId: "p1",
    });
    db.close();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `yarn test src/db/index.test.ts`
Expected: FAIL — `attendanceKey` is not exported.

- [ ] **Step 4: Implement**

In `src/db/index.ts`, extend the imports and the re-export list with the five new types, then:

```ts
export type AppDatabase = Dexie & {
  classes: EntityTable<SchoolClass, "id">;
  students: EntityTable<Student, "id">;
  subjects: EntityTable<Subject, "id">;
  gradebooks: EntityTable<Gradebook, "id">;
  periods: EntityTable<Period, "id">;
  columns: EntityTable<GradeColumn, "id">;
  grades: Table<Grade, [string, string, string]>;
  sessions: EntityTable<Session, "id">;
  attendance: Table<AttendanceRecord, [string, string]>;
  behaviourEvents: EntityTable<BehaviourEvent, "id">;
  seatingLayouts: EntityTable<SeatingLayout, "id">;
  seats: Table<Seat, [string, number, number]>;
};

/** The compound primary key of one pupil's presence at one session. */
export function attendanceKey(sessionId: string, studentId: string): [string, string] {
  return [sessionId, studentId];
}

/** The compound primary key of one cell of a room. */
export function seatKey(layoutId: string, row: number, col: number): [string, number, number] {
  return [layoutId, row, col];
}
```

and replace the version block:

```ts
  // v2 adds the classroom tables. Existing data is disposable — there is no
  // upgrade callback, so Dexie creates the new stores empty and any attendance
  // grade row left over from v1 is garbage the wipe in Réglages clears.
  db.version(2).stores({
    classes: "id, name",
    students: "id, classId, lastName",
    subjects: "id, name",
    gradebooks: "id, classId, subjectId",
    periods: "id, gradebookId, order",
    columns: "id, gradebookId, periodId, order",
    grades: "[gradebookId+columnId+studentId], gradebookId, columnId, studentId",
    sessions: "id, classId, date, [classId+date]",
    attendance: "[sessionId+studentId], sessionId, studentId",
    behaviourEvents: "id, sessionId, studentId, classId, createdAt",
    seatingLayouts: "id, classId",
    seats: "[layoutId+row+col], layoutId, studentId",
  });
```

The `version(1)` block is **removed**, not kept alongside — data is disposable and keeping a dead version only invites a migration question later.

- [ ] **Step 5: Run tests**

Run: `yarn test src/db/index.test.ts`
Expected: PASS (4 tests). Tasks 2 and 3 supply `AttendanceValue` and `BehaviourType`; until then `yarn typecheck` fails on those two imports. **Do Task 2 and Task 3 before committing this task**, or stub the two types locally and remove the stubs in Task 2/3. Preferred: implement Tasks 1–3 as one commit.

- [ ] **Step 6: Commit** (after Tasks 2 and 3)

---

### Task 2: Attendance leaves the gradebook

**Files:**
- Create: `src/domain/attendance.ts`, `src/domain/attendance.test.ts`
- Modify: `src/domain/gradebook/column.ts`, `src/domain/gradebook/grade.ts`, `src/domain/gradebook/grade.test.ts`
- Modify: `src/modules/design-system/components/editable-cell.tsx`, `src/modules/design-system/components/column-type-icon.tsx`, `src/modules/entry/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `ATTENDANCE_VALUES`, `AttendanceValue`, `parseAttendanceValue(raw): AttendanceValue | null`, `DEFAULT_ATTENDANCE` from `@domain/attendance`. `COLUMN_TYPES` shrinks to five. `GradeValue` loses its attendance variant.

- [ ] **Step 1: Write the failing test**

Create `src/domain/attendance.test.ts`:

```ts
import { ATTENDANCE_VALUES, DEFAULT_ATTENDANCE, parseAttendanceValue } from "./attendance";

describe("attendance", () => {
  it("lists the four values", () => {
    expect(ATTENDANCE_VALUES).toEqual(["present", "absent", "late", "excused"]);
  });

  it("defaults to present", () => {
    expect(DEFAULT_ATTENDANCE).toBe("present");
  });

  it("parses a known value", () => {
    expect(parseAttendanceValue("absent")).toBe("absent");
  });

  it("refuses an unknown value", () => {
    expect(parseAttendanceValue("sick")).toBeNull();
    expect(parseAttendanceValue("")).toBeNull();
    expect(parseAttendanceValue(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `yarn test src/domain/attendance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the domain module**

Create `src/domain/attendance.ts`:

```ts
/**
 * Whether a pupil was in the room.
 *
 * Attendance is a property of a session, not of a gradebook column: a lesson
 * happened on a date to a class, and the same fact must not be recordable in
 * two places. Values are stored raw and translated only for display.
 */

export const ATTENDANCE_VALUES = ["present", "absent", "late", "excused"] as const;

export type AttendanceValue = (typeof ATTENDANCE_VALUES)[number];

/** What a pupil is assumed to be until someone says otherwise. */
export const DEFAULT_ATTENDANCE: AttendanceValue = "present";

export function parseAttendanceValue(raw: unknown): AttendanceValue | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  return ATTENDANCE_VALUES.find((v) => v === text) ?? null;
}
```

- [ ] **Step 4: Strip attendance from the gradebook domain**

In `src/domain/gradebook/column.ts`: remove `"attendance"` from `COLUMN_TYPES`, and remove the `ATTENDANCE_VALUES` / `AttendanceValue` exports entirely (they now live in `@domain/attendance`). The file's doc comment loses its attendance mention.

In `src/domain/gradebook/grade.ts`: remove the `ATTENDANCE_VALUES` import, the `{ type: "attendance"; ... }` member of `GradeValue`, the matching `z.object` in `gradeValueSchema`, the `case "attendance":` in `parseGradeValue`, and `"attendance"` from the `formatGradeValue` fall-through list.

In `src/domain/gradebook/grade.test.ts`: delete the two attendance tests (lines around 38–47) and remove `"attendance"` from the parametrised blank-input list near line 103.

- [ ] **Step 5: Fix the three UI call sites**

- `editable-cell.tsx`: remove the `ATTENDANCE_VALUES` import and the whole `if (type === "attendance") { ... }` branch.
- `column-type-icon.tsx`: remove the `attendance: "◷",` entry.
- `entry/page.tsx`: remove the `if (value.type === "attendance")` branch from the display helper.

- [ ] **Step 6: Move the translations**

In both locale files, remove `gradebook.columnType.attendance`, and move the `gradebook.attendance` object to a top-level `attendance` object:

`fr.json`:
```json
"attendance": {
  "present": "Présent",
  "absent": "Absent",
  "late": "En retard",
  "excused": "Excusé"
}
```

`en.json`:
```json
"attendance": {
  "present": "Present",
  "absent": "Absent",
  "late": "Late",
  "excused": "Excused"
}
```

- [ ] **Step 7: Run the full suite**

Run: `yarn test`
Expected: PASS. `seed.ts` still creates an attendance column — Task 5 fixes it; if `yarn typecheck` fails there, comment the seed's attendance column out now and finish it properly in Task 5.

---

### Task 3: Behaviour and seating domain modules

**Files:**
- Create: `src/domain/behaviour.ts`, `src/domain/behaviour.test.ts`
- Create: `src/domain/seating.ts`, `src/domain/seating.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BEHAVIOUR_TYPES`, `BehaviourType`, `BEHAVIOUR_COLORS`, `countByType(events)` from `@domain/behaviour`; `DEFAULT_ROWS`, `DEFAULT_COLS`, `MAX_ROWS`, `MAX_COLS`, `buildSeats(layoutId, rows, cols)`, `resizeSeats(existing, layoutId, rows, cols)`, `unseatedStudentIds(students, seats)` from `@domain/seating`.

- [ ] **Step 1: Write the failing behaviour test**

Create `src/domain/behaviour.test.ts`:

```ts
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "./behaviour";

describe("behaviour", () => {
  it("lists the four types, positive first", () => {
    expect(BEHAVIOUR_TYPES).toEqual(["green", "yellow", "red", "note"]);
  });

  it("gives every type a colour", () => {
    for (const type of BEHAVIOUR_TYPES) {
      expect(BEHAVIOUR_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("counts events by type", () => {
    expect(
      countByType([{ type: "yellow" }, { type: "yellow" }, { type: "red" }]),
    ).toEqual({ green: 0, yellow: 2, red: 1, note: 0 });
  });

  it("counts an empty list as all zero", () => {
    expect(countByType([])).toEqual({ green: 0, yellow: 0, red: 0, note: 0 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `yarn test src/domain/behaviour.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/behaviour.ts`**

```ts
/**
 * Behaviour observations, with football-card semantics.
 *
 * `green` exists deliberately: a log that can only record punishment is a bad
 * instrument, and a history shown to a parent that contains nothing but
 * sanctions misrepresents the pupil. Values are stored raw; labels are
 * translated for display only.
 */

export const BEHAVIOUR_TYPES = ["green", "yellow", "red", "note"] as const;

export type BehaviourType = (typeof BEHAVIOUR_TYPES)[number];

/** Read at arm's length across a classroom, so saturated rather than subtle. */
export const BEHAVIOUR_COLORS: Record<BehaviourType, string> = {
  green: "#16a34a",
  yellow: "#eab308",
  red: "#dc2626",
  note: "#64748b",
};

export type BehaviourCounts = Record<BehaviourType, number>;

/** Every type is present in the result, at zero if unseen. */
export function countByType(events: { type: BehaviourType }[]): BehaviourCounts {
  const counts = Object.fromEntries(BEHAVIOUR_TYPES.map((t) => [t, 0])) as BehaviourCounts;
  for (const event of events) counts[event.type] += 1;
  return counts;
}
```

- [ ] **Step 4: Write the failing seating test**

Create `src/domain/seating.test.ts`:

```ts
import {
  buildSeats,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  resizeSeats,
  unseatedStudentIds,
} from "./seating";

describe("buildSeats", () => {
  it("fills the whole grid with empty seats", () => {
    const seats = buildSeats("l1", 2, 3);
    expect(seats).toHaveLength(6);
    expect(seats.every((s) => s.studentId === null)).toBe(true);
    expect(seats[0]).toEqual({ layoutId: "l1", row: 0, col: 0, studentId: null });
    expect(seats[5]).toEqual({ layoutId: "l1", row: 1, col: 2, studentId: null });
  });

  it("defaults to a plausible classroom", () => {
    expect(buildSeats("l1", DEFAULT_ROWS, DEFAULT_COLS)).toHaveLength(30);
  });
});

describe("resizeSeats", () => {
  const existing = [
    { layoutId: "l1", row: 0, col: 0, studentId: "a" },
    { layoutId: "l1", row: 1, col: 1, studentId: "b" },
  ];

  it("keeps seats inside the new bounds and adds the rest", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 2, 2);
    expect(seats).toHaveLength(4);
    expect(seats.find((s) => s.row === 0 && s.col === 0)?.studentId).toBe("a");
    expect(seats.find((s) => s.row === 1 && s.col === 1)?.studentId).toBe("b");
    expect(unseated).toEqual([]);
  });

  it("reports pupils that shrinking would unseat, and does not keep them", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 1, 1);
    expect(seats).toHaveLength(1);
    expect(unseated).toEqual(["b"]);
  });

  it("preserves gaps — a cell absent from the input stays absent", () => {
    const withGap = [{ layoutId: "l1", row: 0, col: 1, studentId: null }];
    const { seats } = resizeSeats(withGap, "l1", 1, 2);
    expect(seats).toHaveLength(1);
    expect(seats[0].col).toBe(1);
  });
});

describe("unseatedStudentIds", () => {
  it("returns pupils holding no seat, in the given order", () => {
    const students = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const seats = [
      { layoutId: "l1", row: 0, col: 0, studentId: "b" },
      { layoutId: "l1", row: 0, col: 1, studentId: null },
    ];
    expect(unseatedStudentIds(students, seats)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `yarn test src/domain/seating.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `src/domain/seating.ts`**

```ts
import type { Seat } from "@db/types";

/**
 * The room, as a grid.
 *
 * A seat's three states are encoded by presence, not by a flag: no row for a
 * cell is a gap (an aisle, a doorway), a row with `studentId: null` is an
 * empty seat, and a row with a `studentId` is occupied. Resizing must never
 * silently invent seats where the teacher carved a gap.
 */

export const DEFAULT_ROWS = 5;
export const DEFAULT_COLS = 6;
export const MAX_ROWS = 12;
export const MAX_COLS = 12;

/** Every cell of a fresh grid is an empty seat; gaps are carved afterwards. */
export function buildSeats(layoutId: string, rows: number, cols: number): Seat[] {
  const seats: Seat[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      seats.push({ layoutId, row, col, studentId: null });
    }
  }
  return seats;
}

export interface ResizeResult {
  /** The seats that survive, plus new empty ones for cells the grid gained. */
  seats: Seat[];
  /** Pupils the caller must warn about: their seat falls outside the new grid. */
  unseated: string[];
}

/**
 * Resize a grid, keeping what fits.
 *
 * Cells inside both the old and new bounds keep their occupant. Cells the grid
 * gains become empty seats. Cells it loses are dropped, and any pupil sitting
 * in one is reported so the caller can say who is about to be moved — unseated
 * is not deleted; they return to the pool.
 */
export function resizeSeats(
  existing: Seat[],
  layoutId: string,
  rows: number,
  cols: number,
): ResizeResult {
  const kept: Seat[] = [];
  const unseated: string[] = [];
  const occupied = new Set<string>();

  for (const seat of existing) {
    if (seat.row < rows && seat.col < cols) {
      kept.push(seat);
      occupied.add(`${seat.row}:${seat.col}`);
    } else if (seat.studentId !== null) {
      unseated.push(seat.studentId);
    }
  }

  // Only cells the grid genuinely gained become seats. A cell that was inside
  // the old bounds and absent from `existing` was a gap, and stays one.
  const oldRows = existing.reduce((max, s) => Math.max(max, s.row + 1), 0);
  const oldCols = existing.reduce((max, s) => Math.max(max, s.col + 1), 0);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (row < oldRows && col < oldCols) continue;
      if (occupied.has(`${row}:${col}`)) continue;
      kept.push({ layoutId, row, col, studentId: null });
    }
  }

  kept.sort((a, b) => a.row - b.row || a.col - b.col);
  return { seats: kept, unseated };
}

/** Pupils holding no seat, in the order they were given. */
export function unseatedStudentIds(students: { id: string }[], seats: Seat[]): string[] {
  const seated = new Set(seats.map((s) => s.studentId).filter((id): id is string => id !== null));
  return students.filter((s) => !seated.has(s.id)).map((s) => s.id);
}
```

- [ ] **Step 7: Run tests, then commit Tasks 1–3 together**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green (seed may need its attendance column commented out — Task 5 restores order).

```bash
git add src/db/types.ts src/db/index.ts src/db/index.test.ts src/domain/attendance.ts src/domain/attendance.test.ts src/domain/behaviour.ts src/domain/behaviour.test.ts src/domain/seating.ts src/domain/seating.test.ts src/domain/gradebook src/modules/design-system/components src/modules/entry/page.tsx src/i18n/locales
git commit -m "feat: add the classroom schema and its domain modules"
```

---

### Task 4: Sessions

**Files:**
- Create: `src/db/sessions.ts`, `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `Session`.
- Produces: `startOfDay(ms)`, `getOrCreateTodaySession(db, classId, subjectId?)`, `createSession(db, classId, subjectId?)`, `sessionsForClass(db, classId)`.

- [ ] **Step 1: Write the failing test**

Create `src/db/sessions.test.ts`:

```ts
import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { createSession, getOrCreateTodaySession, sessionsForClass, startOfDay } from "./sessions";

function freshDb(name: string) {
  return openWorkspaceDb(`sessions-${name}-${crypto.randomUUID()}`);
}

describe("startOfDay", () => {
  it("zeroes the clock", () => {
    const noon = new Date(2026, 2, 12, 12, 30, 45, 123).getTime();
    const start = new Date(startOfDay(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(12);
  });
});

describe("getOrCreateTodaySession", () => {
  it("creates one when none exists today", async () => {
    const db = freshDb("create");
    const session = await getOrCreateTodaySession(db, "c1");
    expect(session.classId).toBe("c1");
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it("reuses today's session instead of making a second", async () => {
    const db = freshDb("reuse");
    const first = await getOrCreateTodaySession(db, "c1");
    const second = await getOrCreateTodaySession(db, "c1");
    expect(second.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it("does not reuse another class's session", async () => {
    const db = freshDb("other-class");
    await getOrCreateTodaySession(db, "c1");
    await getOrCreateTodaySession(db, "c2");
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });

  it("does not reuse yesterday's session", async () => {
    const db = freshDb("yesterday");
    const yesterday = startOfDay(Date.now()) - 86_400_000;
    await db.sessions.put({
      id: "old",
      classId: "c1",
      date: yesterday,
      createdAt: yesterday,
    });
    const session = await getOrCreateTodaySession(db, "c1");
    expect(session.id).not.toBe("old");
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });

  it("returns the most recent when a second was forced today", async () => {
    const db = freshDb("forced");
    await getOrCreateTodaySession(db, "c1");
    const forced = await createSession(db, "c1");
    const found = await getOrCreateTodaySession(db, "c1");
    expect(found.id).toBe(forced.id);
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });
});

describe("sessionsForClass", () => {
  it("returns newest first", async () => {
    const db = freshDb("order");
    const day = startOfDay(Date.now());
    await db.sessions.bulkPut([
      { id: "a", classId: "c1", date: day - 2 * 86_400_000, createdAt: 1 },
      { id: "b", classId: "c1", date: day, createdAt: 2 },
      { id: "c", classId: "c2", date: day, createdAt: 3 },
    ]);
    expect((await sessionsForClass(db, "c1")).map((s) => s.id)).toEqual(["b", "a"]);
    db.close();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `yarn test src/db/sessions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/db/sessions.ts`**

```ts
import type { AppDatabase, Session } from ".";

/**
 * Sessions: one row per lesson.
 *
 * A session is fetched lazily rather than started deliberately — a teacher
 * mid-lesson has no patience for a setup step, and a forgotten one would leave
 * a sanction with nowhere to go. The explicit `createSession` exists for the
 * case a lazy fetch cannot express: the same class taught twice in one day.
 */

/** Local midnight of the day containing `ms`. Sessions are dated, not timed. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Always makes a new row, even if today already has one. */
export async function createSession(
  db: AppDatabase,
  classId: string,
  subjectId?: string,
): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(subjectId === undefined ? {} : { subjectId }),
    date: startOfDay(Date.now()),
    createdAt: Date.now(),
  };
  await db.sessions.add(session);
  return session;
}

/**
 * Today's session for a class, created if absent.
 *
 * When a second session was forced today, the most recently created one wins:
 * that is the lesson currently happening.
 */
export async function getOrCreateTodaySession(
  db: AppDatabase,
  classId: string,
  subjectId?: string,
): Promise<Session> {
  const today = startOfDay(Date.now());
  const todays = await db.sessions.where({ classId, date: today }).toArray();
  if (todays.length > 0) {
    return todays.reduce((latest, s) => (s.createdAt > latest.createdAt ? s : latest));
  }
  return await createSession(db, classId, subjectId);
}

/** Every session of a class, newest first. */
export async function sessionsForClass(db: AppDatabase, classId: string): Promise<Session[]> {
  const sessions = await db.sessions.where("classId").equals(classId).toArray();
  return sessions.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/db/sessions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat: add lazily created lesson sessions"
```

---

### Task 5: Cascades and seed

**Files:**
- Modify: `src/db/cascade.ts`, `src/db/cascade.test.ts`
- Modify: `src/db/seed.ts`

**Interfaces:**
- Consumes: every phase 2 table.
- Produces: widened `deleteStudent`, `deleteClass`; new `deleteSession`, `deleteBehaviourEvent`, `deleteSeatingLayout`.

- [ ] **Step 1: Write the failing cascade tests**

Append to `src/db/cascade.test.ts` (keep the file's existing helpers and imports; add the new functions to the import list):

```ts
describe("deleteStudent — phase 2 rows", () => {
  it("takes attendance, behaviour events and rubric-free seat state with it", async () => {
    const db = freshDb("student-phase2");
    await db.students.add({
      id: "p1",
      classId: "c1",
      firstName: "Emma",
      lastName: "Martin",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.attendance.put({
      sessionId: "s1",
      studentId: "p1",
      value: "absent",
      updatedAt: 1,
    });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "yellow",
      createdAt: 1,
    });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });

    await deleteStudent(db, "p1");

    expect(await db.students.count()).toBe(0);
    expect(await db.attendance.count()).toBe(0);
    expect(await db.behaviourEvents.count()).toBe(0);
    // The seat survives, emptied: deleting a pupil must not punch a hole in
    // the room's geometry.
    expect(await db.seats.get(["l1", 0, 0])).toEqual({
      layoutId: "l1",
      row: 0,
      col: 0,
      studentId: null,
    });
    db.close();
  });

  it("leaves another pupil's rows alone", async () => {
    const db = freshDb("student-neighbour");
    await db.attendance.bulkPut([
      { sessionId: "s1", studentId: "p1", value: "absent", updatedAt: 1 },
      { sessionId: "s1", studentId: "p2", value: "present", updatedAt: 1 },
    ]);
    await deleteStudent(db, "p1");
    expect(await db.attendance.count()).toBe(1);
    expect((await db.attendance.toArray())[0].studentId).toBe("p2");
    db.close();
  });
});

describe("deleteClass — phase 2 rows", () => {
  it("leaves zero orphans across every classroom table", async () => {
    const db = freshDb("class-phase2");
    await db.classes.add({ id: "c1", name: "3B", createdAt: 1, updatedAt: 1 });
    await db.students.add({
      id: "p1",
      classId: "c1",
      firstName: "Emma",
      lastName: "Martin",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.attendance.put({ sessionId: "s1", studentId: "p1", value: "late", updatedAt: 1 });
    await db.behaviourEvents.add({
      id: "e1",
      sessionId: "s1",
      studentId: "p1",
      classId: "c1",
      type: "red",
      createdAt: 1,
    });
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 1, cols: 1, updatedAt: 1 });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });

    await deleteClass(db, "c1");

    for (const table of [
      db.classes,
      db.students,
      db.sessions,
      db.attendance,
      db.behaviourEvents,
      db.seatingLayouts,
      db.seats,
    ]) {
      expect(await table.count()).toBe(0);
    }
    db.close();
  });
});

describe("deleteSession", () => {
  it("takes its attendance and behaviour events", async () => {
    const db = freshDb("session");
    await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
    await db.sessions.add({ id: "s2", classId: "c1", date: 2, createdAt: 2 });
    await db.attendance.bulkPut([
      { sessionId: "s1", studentId: "p1", value: "absent", updatedAt: 1 },
      { sessionId: "s2", studentId: "p1", value: "present", updatedAt: 1 },
    ]);
    await db.behaviourEvents.bulkAdd([
      { id: "e1", sessionId: "s1", studentId: "p1", classId: "c1", type: "yellow", createdAt: 1 },
      { id: "e2", sessionId: "s2", studentId: "p1", classId: "c1", type: "green", createdAt: 2 },
    ]);

    await deleteSession(db, "s1");

    expect(await db.sessions.count()).toBe(1);
    expect(await db.attendance.count()).toBe(1);
    expect(await db.behaviourEvents.count()).toBe(1);
    expect((await db.behaviourEvents.toArray())[0].id).toBe("e2");
    db.close();
  });
});

describe("deleteSeatingLayout", () => {
  it("takes its seats", async () => {
    const db = freshDb("layout");
    await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 1, cols: 2, updatedAt: 1 });
    await db.seats.bulkPut([
      { layoutId: "l1", row: 0, col: 0, studentId: null },
      { layoutId: "l1", row: 0, col: 1, studentId: "p1" },
      { layoutId: "l2", row: 0, col: 0, studentId: null },
    ]);
    await deleteSeatingLayout(db, "l1");
    expect(await db.seatingLayouts.count()).toBe(0);
    expect(await db.seats.count()).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `yarn test src/db/cascade.test.ts`
Expected: FAIL — `deleteSession` is not exported; `deleteStudent` leaves attendance behind.

- [ ] **Step 3: Widen the cascades**

Replace `deleteStudent` in `src/db/cascade.ts`:

```ts
/**
 * A pupil's rows reach into six tables. The seat is emptied rather than
 * deleted: removing it would punch a hole in the room's geometry, and a gap
 * means something different from an empty chair.
 */
export async function deleteStudent(db: AppDatabase, studentId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.students, db.grades, db.attendance, db.behaviourEvents, db.seats],
    async () => {
      await db.grades.where("studentId").equals(studentId).delete();
      await db.attendance.where("studentId").equals(studentId).delete();
      await db.behaviourEvents.where("studentId").equals(studentId).delete();
      await db.seats.where("studentId").equals(studentId).modify({ studentId: null });
      await db.students.delete(studentId);
    },
  );
}
```

Replace `deleteClass`'s transaction to add the classroom tables, keeping its existing gradebook and student sweeps and appending:

```ts
      const sessionIds = await db.sessions.where("classId").equals(classId).primaryKeys();
      if (sessionIds.length > 0) {
        await db.attendance.where("sessionId").anyOf(sessionIds).delete();
        await db.sessions.bulkDelete(sessionIds);
      }
      await db.behaviourEvents.where("classId").equals(classId).delete();

      const layoutIds = await db.seatingLayouts.where("classId").equals(classId).primaryKeys();
      if (layoutIds.length > 0) {
        await db.seats.where("layoutId").anyOf(layoutIds).delete();
        await db.seatingLayouts.bulkDelete(layoutIds);
      }
```

with the transaction's table list extended to
`[db.classes, db.students, db.gradebooks, db.periods, db.columns, db.grades, db.sessions, db.attendance, db.behaviourEvents, db.seatingLayouts, db.seats]`.

Note the ordering: the student sweep must run **before** the session sweep is relied upon for attendance, but since both delete the same rows idempotently the order is not load-bearing — what matters is that every table appears in the transaction list, or Dexie throws.

Add:

```ts
/** A lesson and everything recorded during it. */
export async function deleteSession(db: AppDatabase, sessionId: string): Promise<void> {
  await db.transaction("rw", [db.sessions, db.attendance, db.behaviourEvents], async () => {
    await db.attendance.where("sessionId").equals(sessionId).delete();
    await db.behaviourEvents.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

/**
 * Behaviour events are append-only, so removing one is the only correction
 * available. Single-table, but it lives here so every delete is in one place.
 */
export async function deleteBehaviourEvent(db: AppDatabase, eventId: string): Promise<void> {
  await db.behaviourEvents.delete(eventId);
}

/** The room and its cells. */
export async function deleteSeatingLayout(db: AppDatabase, layoutId: string): Promise<void> {
  await db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
    await db.seats.where("layoutId").equals(layoutId).delete();
    await db.seatingLayouts.delete(layoutId);
  });
}
```

- [ ] **Step 4: Update the seed**

In `src/db/seed.ts`:

- Remove the `{ type: "attendance", label: "Présence", weight: 1, max: 20 }` column (line ~144) and the `else if (column.type === "attendance")` branch (lines ~181–189).
- After the gradebook seeding, add classroom data for each class: a seating layout at `DEFAULT_ROWS × DEFAULT_COLS` with pupils seated in roster order, three sessions on the last three weekdays, attendance for each session (mostly `present`, a scattering of the others driven by the existing deterministic LCG), and roughly a dozen behaviour events spread over the sessions and skewed toward `green` and `yellow`.
- Import `buildSeats`, `DEFAULT_ROWS`, `DEFAULT_COLS` from `@domain/seating`, `ATTENDANCE_VALUES` from `@domain/attendance`, `BEHAVIOUR_TYPES` from `@domain/behaviour`, and `startOfDay` from `./sessions`.
- Keep the existing LCG seed (`20260901`) so the demo school stays reproducible. Do **not** seed photographs — a seeded Blob would be a fabricated photograph of a fictional child, and the empty state is what a real teacher sees anyway.

- [ ] **Step 5: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 6: Verify the seed by hand**

Run a throwaway Node script against `fake-indexeddb` that seeds a workspace and prints row counts per table, then deletes a class and asserts every classroom table is empty. Delete the script afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/db/cascade.ts src/db/cascade.test.ts src/db/seed.ts
git commit -m "feat: cascade and seed the classroom tables"
```

---

### Task 6: Backup v2

**Files:**
- Modify: `src/db/backup.ts`, `src/db/backup.test.ts`

**Interfaces:**
- Consumes: every phase 2 table.
- Produces: `WorkspaceBackup` with `version: 2` and five new arrays.

- [ ] **Step 1: Write the failing test**

Add to `src/db/backup.test.ts`:

```ts
it("exports version 2 with the classroom tables", async () => {
  const db = freshDb("export-v2");
  await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
  await db.attendance.put({ sessionId: "s1", studentId: "p1", value: "late", updatedAt: 1 });
  const backup = await exportWorkspace(db);
  expect(backup.version).toBe(2);
  expect(backup.sessions).toHaveLength(1);
  expect(backup.attendance).toHaveLength(1);
  db.close();
});

it("rejects a version 1 backup rather than half-importing it", async () => {
  const db = freshDb("import-v1");
  expect(() =>
    validateBackup({
      version: 1,
      exportedAt: 1,
      classes: [],
      students: [],
      subjects: [],
      gradebooks: [],
      periods: [],
      columns: [],
      grades: [],
    }),
  ).toThrow();
  db.close();
});

it("round-trips the classroom tables", async () => {
  const db = freshDb("round-trip-v2");
  await db.sessions.add({ id: "s1", classId: "c1", date: 1, createdAt: 1 });
  await db.behaviourEvents.add({
    id: "e1",
    sessionId: "s1",
    studentId: "p1",
    classId: "c1",
    type: "red",
    comment: "bavardage",
    createdAt: 1,
  });
  await db.seatingLayouts.add({ id: "l1", classId: "c1", rows: 2, cols: 2, updatedAt: 1 });
  await db.seats.put({ layoutId: "l1", row: 1, col: 1, studentId: "p1" });

  const backup = await exportWorkspace(db);
  await importWorkspace(db, backup);

  expect(await db.behaviourEvents.get("e1")).toMatchObject({ type: "red", comment: "bavardage" });
  expect(await db.seats.get(["l1", 1, 1])).toMatchObject({ studentId: "p1" });
  db.close();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `yarn test src/db/backup.test.ts`
Expected: FAIL — `backup.version` is 1 and `sessions` is undefined.

- [ ] **Step 3: Implement**

In `src/db/backup.ts`: extend `WorkspaceBackup` with `version: 2` and `sessions`, `attendance`, `behaviourEvents`, `seatingLayouts`, `seats` arrays; extend `backupSchema` with `z.literal(2)` and a matching loose array per table (mirror the `grades` treatment for the compound-key tables — assert their key fields, leave the rest loose); read and write all twelve tables in `exportWorkspace` and `importWorkspace`.

The photo strip on students stays exactly as it is. Add a comment noting that `notes` **is** exported and now carries accommodations, pointing at `PRIVACY.md`.

- [ ] **Step 4: Run tests, then the gate**

Run: `yarn test src/db/backup.test.ts && yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts
git commit -m "feat: carry the classroom tables through export and import"
```

---

### Task 7: Routes and translations

**Files:**
- Modify: `src/router.ts`, `src/app.tsx`, `src/modules/class/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Create: `src/modules/plan/page.tsx` (placeholder), `src/modules/student/page.tsx` (placeholder)

**Interfaces:**
- Consumes: nothing.
- Produces: `Router.Plan({ classId })`, `Router.Student({ studentId })`; `PlanPage`, `StudentPage`.

- [ ] **Step 1: Add the routes**

`src/router.ts`:

```ts
export const Router = createRouter(
  {
    Home: "/",
    Class: "/classes/:classId",
    Plan: "/classes/:classId/plan",
    Student: "/students/:studentId",
    Gradebook: "/gradebooks/:gradebookId",
    Entry: "/gradebooks/:gradebookId/entry/:columnId",
    Settings: "/settings",
  },
  { basePath },
);
```

`Plan` must be declared **after** `Class` is irrelevant to Chicane (it matches on the full pattern), but keep the ordering above for readability.

- [ ] **Step 2: Wire them into `src/app.tsx`**

Add `"Plan"` and `"Student"` to the `useRoute` array, to the `AppRoute` union, and to the switch:

```ts
    case "Plan":
      return <PlanPage classId={route.params.classId} />;
    case "Student":
      return <StudentPage studentId={route.params.studentId} />;
```

- [ ] **Step 3: Create the two placeholder pages**

`src/modules/plan/page.tsx`:

```tsx
export function PlanPage({ classId }: { classId: string }) {
  return <p>{classId}</p>;
}
```

`src/modules/student/page.tsx`: the same shape with `studentId`. Both are replaced in Tasks 8–11.

- [ ] **Step 4: Link the class page to its plan**

In `src/modules/class/page.tsx`, add to the header button row, before "Importer CSV":

```tsx
          <Link className="btn" to={Router.Plan({ classId })}>
            {t("plan.title")}
          </Link>
```

Import `Link` from `@swan-io/chicane`.

- [ ] **Step 5: Add every translation key this plan needs**

Add to both locale files, in parity. French values:

```json
"plan": {
  "title": "Plan de classe",
  "newSession": "Nouvelle séance",
  "sessionOf": "Séance du {{date}}",
  "unseated": "Élèves sans place",
  "allSeated": "Tous les élèves sont placés",
  "tapSeatThenStudent": "Touchez une place, puis un élève",
  "emptySeat": "Place libre",
  "makeGap": "Retirer la place",
  "makeSeat": "Ajouter une place",
  "clearSeat": "Libérer la place",
  "resize": "Dimensions",
  "rows": "Rangées",
  "cols": "Colonnes",
  "resizeWarning_one": "{{count}} élève perdra sa place.",
  "resizeWarning_other": "{{count}} élèves perdront leur place.",
  "noLayout": "Aucun plan de classe"
},
"attendance": {
  "present": "Présent",
  "absent": "Absent",
  "late": "En retard",
  "excused": "Excusé",
  "title": "Présence"
},
"behaviour": {
  "title": "Comportement",
  "green": "Encouragement",
  "yellow": "Avertissement",
  "red": "Mot dans le carnet",
  "note": "Observation",
  "comment": "Commentaire",
  "add": "Ajouter",
  "none": "Aucun événement",
  "confirmDelete": "Supprimer cet événement ?",
  "thisTerm": "Ce trimestre"
},
"student": {
  "photo": "Photo",
  "addPhoto": "Ajouter une photo",
  "removePhoto": "Retirer la photo",
  "notes": "Notes et aménagements",
  "notesHint": "PAP, PPRE, tiers-temps, contraintes de placement…",
  "timeline": "Historique",
  "notFound": "Élève introuvable",
  "attendanceSummary": "Présence"
}
```

`student.lastName` and `student.firstName` already exist — extend the existing `student` object rather than replacing it. English mirrors it exactly.

- [ ] **Step 6: Run the gate and verify in the browser**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Then with `yarn dev` running, navigate to a class and click "Plan de classe"; the placeholder must render and the URL must be `/classes/<id>/plan` with no full page reload.

- [ ] **Step 7: Commit**

```bash
git add src/router.ts src/app.tsx src/modules/plan src/modules/student src/modules/class/page.tsx src/i18n/locales
git commit -m "feat: add the plan and student routes"
```

---

### Task 8: The photo input

**Files:**
- Create: `src/modules/design-system/components/photo-input.tsx`
- Create: `src/domain/photo.ts`, `src/domain/photo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PHOTO_SIZE`, `squareCrop(width, height)` from `@domain/photo`; `<PhotoInput value onChange />` where `onChange` receives `Blob | null`.

The canvas work is not unit-testable in a `node` Jest environment, so the geometry is extracted into a pure function that is, and the canvas call is thin enough to verify in the browser.

- [ ] **Step 1: Write the failing test**

Create `src/domain/photo.test.ts`:

```ts
import { PHOTO_SIZE, squareCrop } from "./photo";

describe("squareCrop", () => {
  it("takes the centre of a landscape image", () => {
    expect(squareCrop(1000, 500)).toEqual({ sx: 250, sy: 0, size: 500 });
  });

  it("takes the centre of a portrait image", () => {
    expect(squareCrop(500, 1000)).toEqual({ sx: 0, sy: 250, size: 500 });
  });

  it("leaves a square alone", () => {
    expect(squareCrop(400, 400)).toEqual({ sx: 0, sy: 0, size: 400 });
  });

  it("targets a small square", () => {
    expect(PHOTO_SIZE).toBe(256);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `yarn test src/domain/photo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/photo.ts`**

```ts
/**
 * Pupil photographs are downscaled before they are stored.
 *
 * A phone camera produces several megabytes per shot; thirty of those in
 * IndexedDB for one class is an avoidable liability as well as a slow page.
 * A centre square at 256px is enough to recognise a face in a seating grid.
 */

export const PHOTO_SIZE = 256;

export interface Crop {
  sx: number;
  sy: number;
  size: number;
}

/** The largest centred square that fits inside the source image. */
export function squareCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return {
    sx: Math.round((width - size) / 2),
    sy: Math.round((height - size) / 2),
    size,
  };
}
```

- [ ] **Step 4: Implement the component**

Create `src/modules/design-system/components/photo-input.tsx`:

```tsx
import { PHOTO_SIZE, squareCrop } from "@domain/photo";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A pupil photograph, downscaled in the browser and never uploaded.
 *
 * The file never leaves the device: it goes into an object URL, onto a canvas,
 * and back out as a Blob for IndexedDB. `createObjectURL` results are revoked
 * on unmount and between selections, or a long editing session leaks them.
 */
export function PhotoInput({
  value,
  onChange,
}: {
  value: Blob | undefined;
  onChange: (photo: Blob | null) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFile = async (file: File): Promise<void> => {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      const { sx, sy, size } = squareCrop(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, sx, sy, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (blob) onChange(blob);
    } finally {
      URL.revokeObjectURL(url);
      // Clearing the input lets the same file be chosen again after a removal.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-16 w-16 rounded-full object-cover"
          width={64}
          height={64}
        />
      ) : (
        <div className="h-16 w-16 rounded-full bg-surface-muted" />
      )}
      <div className="flex flex-col gap-1">
        <label className="btn cursor-pointer">
          {value ? t("student.photo") : t("student.addPhoto")}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {value && (
          <button type="button" className="text-sm text-danger" onClick={() => onChange(null)}>
            {t("student.removePhoto")}
          </button>
        )}
      </div>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = src;
  });
}
```

- [ ] **Step 5: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`

- [ ] **Step 6: Commit**

```bash
git add src/domain/photo.ts src/domain/photo.test.ts src/modules/design-system/components/photo-input.tsx
git commit -m "feat: add a downscaling pupil photo input"
```

---

### Task 9: The seating grid

**Files:**
- Create: `src/modules/plan/components/seat-grid.tsx`, `src/modules/plan/components/unseated-pool.tsx`, `src/modules/plan/components/layout-size-form.tsx`
- Rewrite: `src/modules/plan/page.tsx`

**Interfaces:**
- Consumes: `@domain/seating`, `db.seats`, `db.seatingLayouts`, `seatKey`.
- Produces: a working plan page; `<StudentCard />` is stubbed here and built in Task 10.

- [ ] **Step 1: The page shell**

Rewrite `src/modules/plan/page.tsx`:

```tsx
import { DEFAULT_COLS, DEFAULT_ROWS, buildSeats, unseatedStudentIds } from "@domain/seating";
import { useDb } from "@db/provider";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SeatGrid } from "./components/seat-grid";
import { UnseatedPool } from "./components/unseated-pool";
import { LayoutSizeForm } from "./components/layout-size-form";

export function PlanPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  // Armed seat, as "row:col". Anchored to the cell's coordinates, which are
  // its identity — nothing here is index-keyed.
  const [armedSeat, setArmedSeat] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);

  const schoolClass = useLiveQuery(
    async () => (await db.classes.get(classId)) ?? null,
    [db, classId],
  );
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );
  const layout = useLiveQuery(
    async () => (await db.seatingLayouts.where("classId").equals(classId).first()) ?? null,
    [db, classId],
  );
  const seats = useLiveQuery(
    async () => (layout ? await db.seats.where("layoutId").equals(layout.id).toArray() : []),
    [db, layout?.id],
  );

  // A class gets its room the first time someone looks at it. Creating it in
  // an effect rather than in the live query keeps the query a pure read.
  useEffect(() => {
    if (layout !== null) return;
    const id = crypto.randomUUID();
    void db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
      const existing = await db.seatingLayouts.where("classId").equals(classId).first();
      if (existing) return;
      await db.seatingLayouts.add({
        id,
        classId,
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        updatedAt: Date.now(),
      });
      await db.seats.bulkPut(buildSeats(id, DEFAULT_ROWS, DEFAULT_COLS));
    });
  }, [db, classId, layout]);

  if (schoolClass === undefined || students === undefined || seats === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;
  if (layout === null) return <p className="text-text-muted">{t("common.loading")}</p>;

  const unseated = unseatedStudentIds(students, seats);
  const byId = new Map(students.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">
          {t("plan.title")} — {schoolClass.name}
        </h2>
        <button type="button" className="btn" onClick={() => setResizing((v) => !v)}>
          {t("plan.resize")}
        </button>
      </div>

      {resizing && (
        <LayoutSizeForm key={layout.id} layout={layout} seats={seats} onDone={() => setResizing(false)} />
      )}

      <SeatGrid
        layout={layout}
        seats={seats}
        studentsById={byId}
        armedSeat={armedSeat}
        onArmSeat={setArmedSeat}
      />

      <UnseatedPool
        students={unseated.map((id) => byId.get(id)).filter((s) => s !== undefined)}
        armedSeat={armedSeat}
        onAssign={async (studentId) => {
          if (!armedSeat) return;
          const [row, col] = armedSeat.split(":").map(Number);
          await db.seats.put({ layoutId: layout.id, row, col, studentId });
          setArmedSeat(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: The grid**

Create `src/modules/plan/components/seat-grid.tsx`. Requirements, not a transcription — build it to these:

- Renders a CSS grid of `layout.cols` columns. Each cell is a `<button>` at least 44px square.
- A cell with no seat row renders as a faint dashed placeholder labelled `t("plan.makeSeat")`; clicking it `put`s a seat with `studentId: null`.
- An empty seat renders `t("plan.emptySeat")`; clicking arms it (`onArmSeat("row:col")`), and clicking an armed seat disarms it. An armed seat has a visible ring and `aria-pressed`.
- An occupied seat renders the pupil's photo (object URL, revoked on unmount) or their initials on a coloured disc, plus the surname. Clicking opens the student card — in this task, that is a `console.log`; Task 10 replaces it.
- Each cell's React key is `` `${row}:${col}` `` — the cell's identity, never an array index.
- The grid scrolls horizontally inside its own `overflow-x-auto` container; the page body never scrolls sideways.

- [ ] **Step 3: The pool**

Create `src/modules/plan/components/unseated-pool.tsx`: a wrapping list of pupil chips. When `armedSeat` is null it renders `t("plan.tapSeatThenStudent")` and the chips are disabled; when a seat is armed the chips are enabled and clicking one calls `onAssign(studentId)`. Renders `t("plan.allSeated")` when the list is empty. Each chip is keyed by student id.

- [ ] **Step 4: The size form**

Create `src/modules/plan/components/layout-size-form.tsx`: two number inputs bounded by `MAX_ROWS` / `MAX_COLS`, a live `resizeSeats` preview showing `t("plan.resizeWarning", { count })` when pupils would be unseated, and an apply button that writes the layout and `bulkPut`s the new seats inside one `rw` transaction, deleting seats that fall outside the new bounds. Keyed on `layout.id` by the caller.

Note the plural key: `resizeWarning_one` / `resizeWarning_other`, and `count` is deliberately the interpolation variable because plural resolution is wanted here.

- [ ] **Step 5: Verify in the browser**

With `yarn dev`: open a class plan. Confirm the grid renders, arming a seat then tapping a pupil seats them, the pool shrinks, a reload preserves the assignment, removing a seat leaves a gap that survives reload, and resizing warns before unseating. Take a screenshot of the seated grid.

- [ ] **Step 6: Run the gate and commit**

```bash
git add src/modules/plan
git commit -m "feat: add the seating plan grid"
```

---

### Task 10: The student card — attendance and behaviour

**Files:**
- Create: `src/modules/plan/components/student-card.tsx`
- Modify: `src/modules/plan/page.tsx`, `src/modules/plan/components/seat-grid.tsx`

**Interfaces:**
- Consumes: `getOrCreateTodaySession`, `attendanceKey`, `@domain/attendance`, `@domain/behaviour`, `PhotoInput`.
- Produces: `<StudentCard student session onClose />`.

- [ ] **Step 1: Hold the session on the page**

In `PlanPage`, add:

```tsx
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // The session is fetched once the class is known, not on every render: a
  // lazy get-or-create is idempotent but still a write.
  useEffect(() => {
    let cancelled = false;
    void getOrCreateTodaySession(db, classId).then((s) => {
      if (!cancelled) setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, [db, classId]);
```

and a `t("plan.newSession")` button calling `createSession(db, classId).then(setSession)`, with the current session's date shown via `t("plan.sessionOf", { date })` formatted through the app locale (`new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" })` — never the browser default, per the v1 export-date bug).

- [ ] **Step 2: The card**

Create `src/modules/plan/components/student-card.tsx`:

- Header: `PhotoInput` bound to `student.photo`, writing through `db.students.update(student.id, { photo, updatedAt: Date.now() })`; full name; a `Link` to `Router.Student({ studentId })`.
- A `notes` textarea labelled `t("student.notes")` with `t("student.notesHint")` as helper text, saved on blur.
- Attendance: four buttons, one per `ATTENDANCE_VALUES`, labelled `t(\`attendance.${v}\`)`, minimum 44px, the current value visibly selected with `aria-pressed`. Tapping writes `db.attendance.put({ sessionId, studentId, value, updatedAt })` — one row, no read-modify-write. Tapping the already-selected value clears it (`db.attendance.delete(attendanceKey(...))`), so a mis-tap is recoverable without a dialog.
- Behaviour: four buttons, one per `BEHAVIOUR_TYPES`, coloured from `BEHAVIOUR_COLORS`, labelled `t(\`behaviour.${type}\`)`. Tapping adds an event immediately with the optional comment from a small adjacent input, then clears the input. No save button.
- Below: this session's events for this pupil, each with a `ConfirmButton` delete keyed on the event id.
- The card takes `key={student.id}` from its caller — this is the identity-anchoring requirement, and without it switching pupils would carry the previous pupil's notes draft.

- [ ] **Step 3: Open the card from a seat**

`seat-grid.tsx` gains an `onSelectStudent(studentId)` prop; `PlanPage` renders `<StudentCard key={selectedStudentId} ... />` when one is selected, and closing sets it back to null.

- [ ] **Step 4: Verify in the browser**

Confirm, on a real page: marking absent then reloading keeps it; tapping the same value twice clears the row; adding a yellow card appends one event and the input clears; deleting an event needs two clicks; switching from one pupil to another does **not** carry over an unsaved notes draft; adding a photo shrinks and persists it.

Record the flow as a GIF for the record.

- [ ] **Step 5: Run the gate and commit**

```bash
git add src/modules/plan
git commit -m "feat: take attendance and log behaviour from the seating plan"
```

---

### Task 11: The pupil page

**Files:**
- Rewrite: `src/modules/student/page.tsx`

**Interfaces:**
- Consumes: `countByType`, `sessionsForClass`, `deleteBehaviourEvent`.
- Produces: the pupil detail page.

- [ ] **Step 1: Build it**

- Header: photo, full name, class name as a `Link` to `Router.Class`.
- Behaviour counts as four chips from `countByType`, over all events (a period filter is a Plan B concern — do not invent one here).
- Timeline: every event newest first, each showing its coloured type, the session date formatted with the app locale, the comment, and a `ConfirmButton` delete keyed on the event id.
- Attendance summary: a count per `ATTENDANCE_VALUES` across every session of the pupil's class.
- `t("student.notFound")` for an unknown id, distinguishing null from undefined exactly as `ClassPage` does — the v1 "Chargement… forever" bug.

- [ ] **Step 2: Verify in the browser**

Navigate from a seat's card to the pupil page; confirm the counts match the events just added, deleting an event updates the count live, and an unknown id shows "Élève introuvable" rather than a spinner.

- [ ] **Step 3: Run the gate and commit**

```bash
git add src/modules/student
git commit -m "feat: add the pupil page with its behaviour timeline"
```

---

### Task 12: Documentation

**Files:**
- Modify: `PRIVACY.md`, `README.md`, `CLAUDE.md`, `docs/BACKLOG.md`

- [ ] **Step 1: `PRIVACY.md`**

Add one chapter, in French to match the file, covering:

- Photographs of pupils: stored as blobs on the device, never transmitted, never included in an export, deletable per pupil.
- `Student.notes` may carry accommodations (PAP, PPRE, tiers-temps). This is sensitive data, and unlike photographs, **notes are included in the JSON export** — the export is the teacher's own file, and this is stated so it is not discovered.
- Behaviour records: timestamped observations about minors, kept until deleted.
- All of it is removed by "supprimer toutes les données", which stays permanent.

- [ ] **Step 2: `README.md`**

Add the three features to the feature list; keep the export caveat accurate (photos excluded, notes included).

- [ ] **Step 3: `CLAUDE.md`**

- Architecture: the five new tables and the three-state seat encoding.
- Invariants: attendance is a session property, not a column type; behaviour events are append-only; rubrics (Plan B) never feed averages.
- The identity-anchoring list gains the armed seat and the selected pupil card.
- Note the disposable-data posture: `version(2)` with no upgrade, and a stale workspace is wiped rather than migrated.

- [ ] **Step 4: `docs/BACKLOG.md`**

Mark items 2 and 3 as delivered by this plan, leave item 1 pointing at Plan B, and add the deferred multiple-layouts trade-off as a new entry.

- [ ] **Step 5: Run the gate and commit**

```bash
git add PRIVACY.md README.md CLAUDE.md docs/BACKLOG.md
git commit -m "docs: describe the classroom features and their privacy weight"
```

---

## Self-Review

**Spec coverage.** Session (T4), attendance move (T2), seat three-state model (T1, T3, T9), tap-only assignment (T9), behaviour types with `green` (T3, T10), denormalised `classId` (T1), photos downscaled (T8), pupil page (T11), cascades with zero-orphan tests (T5), seed (T5), backup v2 rejecting v1 (T6), live-entry pattern (T9, T10), identity anchoring (T9, T10), privacy chapter (T12). Rubrics are deliberately absent — Plan B.

**Placeholders.** Tasks 9, 10, and 11 give requirements rather than complete component code. That is deliberate and bounded: they are presentational React whose exact markup is a matter of taste, every behavioural requirement that could be got wrong is spelled out, and each ends with a browser verification listing the specific things to prove. The domain and database layers — the parts that silently corrupt data — carry complete code and tests.

**Type consistency.** `AttendanceRecord` (not `Attendance`) is the row type, avoiding a collision with the table name. `Seat.studentId` is `string | null` everywhere. `BehaviourType` and `AttendanceValue` are imported from `@domain/*`, never redeclared. `seatKey` returns `[string, number, number]`, matching the `Table<Seat, ...>` parameter.

**Ordering hazard.** Tasks 1–3 are one commit: Task 1's types import from modules Task 2 and Task 3 create. This is stated in Task 1 Step 5 rather than left to be discovered.
