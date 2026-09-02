# Phase 5 — Seating by Direct Manipulation, and a 100-Pupil Ceiling: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invert the seating plan's gesture — pick up a pupil, then choose a seat — and enforce a hard ceiling of 100 pupils per class at every write site.

**Architecture:** The rule that decides what a drop *means* moves into `src/domain/seating.ts` as a pure `resolveDrop`, so the trickiest part of the interaction is unit-tested rather than read off a component. `src/db/seating.ts` gains one function, `swapSeats`; `seatStudent` is untouched because it already displaces an occupant. The ceiling is a domain constant plus two pure helpers, applied at the three sites that add pupils. No schema change, no new table, no migration.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Chicane router, i18next (fr default + en), Tailwind, Jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-02-profs-phase5-seating-direct-manipulation.md` — read it before Task 1. It carries the two rulings this plan implements without re-arguing: the bare tap on a seated pupil stays the pupil card, and an over-capacity backup is refused whole.

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN, no font or image from a remote host. This is a documented promise in `README.md` and `PRIVACY.md`, not a preference.
- **Never `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation used to verify these pages. Destructive actions use `ConfirmButton` (two-step, in place).
- **Every user-visible string goes through `t()`**, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json` — a parity test fails the build otherwise. `fr` is default and fallback.
- **Writes live in `src/db/`, never inline in a component.** Multi-table deletes live in `src/db/cascade.ts`.
- **Identifiers are English; only translation values are French.**
- **State bound to a record is anchored to that record's identity, never to its position** (id or coordinates, never a list index).
- **44px minimum tap target** on live-entry controls (`min-h-11` in Tailwind here).
- **IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.**
- **Validation gate, all four green before any task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- **No component tests.** Domain and `src/db` are TDD against `fake-indexeddb`; UI is verified by driving a real browser against `yarn dev` on port 3000.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/domain/class-size.ts` | create | `MAX_STUDENTS_PER_CLASS`, `remainingCapacity`, `classesOverCapacity` |
| `src/domain/class-size.test.ts` | create | its unit tests |
| `src/domain/seating.ts` | modify | adds `Held`, `DropAction`, `resolveDrop` beside the existing grid helpers |
| `src/domain/seating.test.ts` | modify | `resolveDrop` cases |
| `src/db/seating.ts` | modify | adds `swapSeats` |
| `src/db/seating.test.ts` | modify | `swapSeats` cases + a `seatStudent` displacement assertion |
| `src/db/backup.ts` | modify | `BackupOverCapacityError`, thrown from `parseBackup` |
| `src/db/backup.test.ts` | modify | refusal, and the workspace intact after it |
| `src/modules/settings/page.tsx` | modify | distinguishes the over-capacity refusal from a malformed file |
| `src/modules/class/components/student-form.tsx` | modify | refuses to add past the ceiling |
| `src/modules/class/components/csv-import.tsx` | modify | shows remaining places, blocks an over-capacity import |
| `src/modules/plan/components/student-rail.tsx` | create | the unseated rail (replaces `unseated-pool.tsx`) |
| `src/modules/plan/components/unseated-pool.tsx` | delete | superseded by the rail |
| `src/modules/plan/components/seat-grid.tsx` | modify | hold/drop targets instead of arming |
| `src/modules/plan/components/student-card.tsx` | modify | gains a `Déplacer` action |
| `src/modules/plan/page.tsx` | modify | `held` state, layout of grid + rail |
| `src/i18n/locales/fr.json`, `en.json` | modify | new keys, one removed |
| `CLAUDE.md` | modify | three passages, last task |

---

### Task 1: The class-size ceiling, in the domain

**Files:**
- Create: `src/domain/class-size.ts`
- Test: `src/domain/class-size.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MAX_STUDENTS_PER_CLASS: 100`, `remainingCapacity(currentCount: number): number`, `classesOverCapacity(students: { classId: string }[]): string[]`. Tasks 3, 4 and 5 import all three.

- [ ] **Step 1: Write the failing test**

Create `src/domain/class-size.test.ts`:

```ts
import { classesOverCapacity, MAX_STUDENTS_PER_CLASS, remainingCapacity } from "./class-size";

describe("remainingCapacity", () => {
  it("is the whole ceiling for an empty class", () => {
    expect(remainingCapacity(0)).toBe(MAX_STUDENTS_PER_CLASS);
  });

  it("is one place at the last free seat", () => {
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS - 1)).toBe(1);
  });

  it("is zero exactly at the ceiling, not negative", () => {
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS)).toBe(0);
  });

  it("never reports a negative number for a class already over the ceiling", () => {
    // A workspace can hold an over-capacity class only if it predates this
    // rule. The UI must read "0 places left", never "-5 places left".
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS + 5)).toBe(0);
  });
});

describe("classesOverCapacity", () => {
  function roster(classId: string, count: number): { classId: string }[] {
    return Array.from({ length: count }, () => ({ classId }));
  }

  it("finds nothing in an empty roster", () => {
    expect(classesOverCapacity([])).toEqual([]);
  });

  it("accepts a class sitting exactly on the ceiling", () => {
    expect(classesOverCapacity(roster("c1", MAX_STUDENTS_PER_CLASS))).toEqual([]);
  });

  it("reports a class one pupil over the ceiling", () => {
    expect(classesOverCapacity(roster("c1", MAX_STUDENTS_PER_CLASS + 1))).toEqual(["c1"]);
  });

  it("counts each class separately and reports only the offenders", () => {
    const students = [
      ...roster("small", 30),
      ...roster("big", MAX_STUDENTS_PER_CLASS + 1),
      ...roster("huge", MAX_STUDENTS_PER_CLASS + 40),
    ];
    expect(classesOverCapacity(students).sort()).toEqual(["big", "huge"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/domain/class-size.test.ts`
Expected: FAIL — `Cannot find module './class-size'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/class-size.ts`:

```ts
/**
 * The ceiling on a class roster.
 *
 * 100 is far above any real French secondary class (a full one is around 35).
 * It is not a pedagogical rule: it is the bound that keeps the seating rail,
 * a room of at most 12×12 = 144 cells, and a class average from ever meeting
 * a roster nobody intended to paste.
 *
 * It lives here rather than in the form that enforces it because three
 * separate write sites add pupils, and a constant inlined into one of them is
 * a rule the other two do not have.
 */
export const MAX_STUDENTS_PER_CLASS = 100;

/**
 * Places left in a class of `currentCount` pupils.
 *
 * Clamped at zero: a workspace imported before this rule existed can hold an
 * over-capacity class, and the UI must say "0 places left" rather than
 * offering a negative number of them.
 */
export function remainingCapacity(currentCount: number): number {
  return Math.max(0, MAX_STUDENTS_PER_CLASS - currentCount);
}

/** The ids of every class in `students` that exceeds the ceiling. */
export function classesOverCapacity(students: { classId: string }[]): string[] {
  const counts = new Map<string, number>();
  for (const student of students) {
    counts.set(student.classId, (counts.get(student.classId) ?? 0) + 1);
  }
  const over: string[] = [];
  for (const [classId, count] of counts) {
    if (count > MAX_STUDENTS_PER_CLASS) over.push(classId);
  }
  return over;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/domain/class-size.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/class-size.ts src/domain/class-size.test.ts
git commit -m "feat(domain): a 100-pupil ceiling per class"
```

---

### Task 2: `swapSeats`, and the displacement `seatStudent` already does

**Files:**
- Modify: `src/db/seating.ts` (add after `moveSeat`, around line 88)
- Test: `src/db/seating.test.ts`

**Interfaces:**
- Consumes: `seatKey` from `src/db/index.ts`, already imported by the module.
- Produces: `swapSeats(db: AppDatabase, layoutId: string, a: { row: number; col: number }, b: { row: number; col: number }): Promise<void>`. Task 7 calls it.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/seating.test.ts`, and add `swapSeats` to the existing import list at the top of the file:

```ts
describe("swapSeats", () => {
  it("exchanges two occupants", async () => {
    const db = freshDb("swap-two");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await seatStudent(db, layout.id, 2, 3, "s2");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 2, col: 3 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s2");
    expect((await db.seats.get(seatKey(layout.id, 2, 3)))?.studentId).toBe("s1");
    db.close();
  });

  it("behaves as a move when the target is an empty seat", async () => {
    const db = freshDb("swap-empty");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 4, col: 5 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 4, 5)))?.studentId).toBe("s1");
    db.close();
  });

  it("changes nothing when a cell is swapped with itself", async () => {
    const db = freshDb("swap-self");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 1, 1, "s1");

    await swapSeats(db, layout.id, { row: 1, col: 1 }, { row: 1, col: 1 });

    expect((await db.seats.get(seatKey(layout.id, 1, 1)))?.studentId).toBe("s1");
    db.close();
  });

  it("refuses to swap into a gap rather than creating a seat there", async () => {
    // A gap is an aisle, a doorway, a pillar. Writing a seat row into one
    // would put a chair where the teacher carved the room open, and the grid
    // would render it as if they had asked for it.
    const db = freshDb("swap-gap");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await makeGap(db, layout.id, 3, 3);

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 3, col: 3 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s1");
    expect(await db.seats.get(seatKey(layout.id, 3, 3))).toBeUndefined();
    db.close();
  });

  it("does nothing when the source seat is empty", async () => {
    const db = freshDb("swap-empty-source");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 2, 2, "s1");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 2, col: 2 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 2, 2)))?.studentId).toBe("s1");
    db.close();
  });
});

describe("seatStudent displacement", () => {
  it("displaces the pupil already sitting there, leaving them unseated", async () => {
    // This is the rule the rail relies on: dropping a pupil from the rail
    // onto an occupied seat always completes, and the occupant reappears in
    // the rail rather than the gesture being refused. It was already true and
    // asserted nowhere, which is how an invariant leaves.
    const db = freshDb("seat-displace");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 1, 1, "sitting");

    await seatStudent(db, layout.id, 1, 1, "incoming");

    expect((await db.seats.get(seatKey(layout.id, 1, 1)))?.studentId).toBe("incoming");
    const stillSeated = await db.seats
      .where("layoutId")
      .equals(layout.id)
      .filter((s) => s.studentId === "sitting")
      .count();
    expect(stillSeated).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/db/seating.test.ts`
Expected: FAIL — `swapSeats is not exported` / TypeScript error on the import.

- [ ] **Step 3: Write the implementation**

Add to `src/db/seating.ts`, directly after `moveSeat`:

```ts
/**
 * Exchange the occupants of two cells.
 *
 * The whole point of the seating plan is rearranging, and rearranging is
 * mostly swapping: before this, exchanging two pupils meant clearing one seat,
 * moving, re-arming and moving back — four writes, through a state that is not
 * the room.
 *
 * Both seats are read INSIDE the transaction rather than taken from what the
 * caller last rendered, for the same reason `resizeLayout` does it: a swap
 * submitted from a stale grid must not write back a pupil another tab has
 * already moved.
 *
 * A gap at either end is refused rather than filled: no row means the teacher
 * carved that cell out of the room, and a swap must not put a chair back.
 */
export async function swapSeats(
  db: AppDatabase,
  layoutId: string,
  a: { row: number; col: number },
  b: { row: number; col: number },
): Promise<void> {
  if (a.row === b.row && a.col === b.col) return;
  await db.transaction("rw", db.seats, async () => {
    const source = await db.seats.get(seatKey(layoutId, a.row, a.col));
    const target = await db.seats.get(seatKey(layoutId, b.row, b.col));
    if (!source || !target) return;
    await db.seats.put({ layoutId, row: a.row, col: a.col, studentId: target.studentId });
    await db.seats.put({ layoutId, row: b.row, col: b.col, studentId: source.studentId });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/db/seating.test.ts`
Expected: PASS, including the six new cases.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`

- [ ] **Step 6: Commit**

```bash
git add src/db/seating.ts src/db/seating.test.ts
git commit -m "feat(db): swapSeats, and assert seatStudent displaces an occupant"
```

---

### Task 3: `resolveDrop` — what a drop means

**Files:**
- Modify: `src/domain/seating.ts` (append; keep the existing exports untouched)
- Test: `src/domain/seating.test.ts`

**Interfaces:**
- Consumes: `Seat` from `@db/types`, already imported at the top of `src/domain/seating.ts`.
- Produces:
  - `type Held = { kind: "pool"; studentId: string } | { kind: "seat"; row: number; col: number }`
  - `type DropAction = { kind: "none" } | { kind: "seat"; studentId: string; row: number; col: number } | { kind: "swap"; from: { row: number; col: number }; to: { row: number; col: number } }`
  - `resolveDrop(held: Held, target: Seat | undefined, at: { row: number; col: number }): DropAction`
  Tasks 6 and 7 import all three.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/seating.test.ts`, adding `resolveDrop` and the two types to its import from `./seating`:

```ts
describe("resolveDrop", () => {
  const seat = (studentId: string | null) => ({ layoutId: "l1", row: 9, col: 9, studentId });

  it("seats a pupil held from the rail on an empty seat", () => {
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, seat(null), { row: 1, col: 2 })).toEqual({
      kind: "seat",
      studentId: "s1",
      row: 1,
      col: 2,
    });
  });

  it("seats a pupil held from the rail on an occupied seat, displacing its occupant", () => {
    // seatStudent overwrites the occupant, who returns to the rail. The
    // gesture always completes; a refusal would put back the round trip this
    // whole change removes.
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, seat("s2"), { row: 1, col: 2 })).toEqual({
      kind: "seat",
      studentId: "s1",
      row: 1,
      col: 2,
    });
  });

  it("swaps two seated pupils", () => {
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, seat("s2"), { row: 3, col: 4 })).toEqual({
      kind: "swap",
      from: { row: 0, col: 0 },
      to: { row: 3, col: 4 },
    });
  });

  it("moves a seated pupil onto an empty seat, as a swap with nobody", () => {
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, seat(null), { row: 3, col: 4 })).toEqual({
      kind: "swap",
      from: { row: 0, col: 0 },
      to: { row: 3, col: 4 },
    });
  });

  it("does nothing when a seated pupil is dropped back on their own chair", () => {
    expect(resolveDrop({ kind: "seat", row: 2, col: 2 }, seat("s1"), { row: 2, col: 2 })).toEqual({
      kind: "none",
    });
  });

  it("does nothing over a gap, whoever is held", () => {
    // No seat row means no chair. Neither branch may invent one.
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, undefined, { row: 1, col: 1 })).toEqual({
      kind: "none",
    });
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, undefined, { row: 1, col: 1 })).toEqual({
      kind: "none",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/domain/seating.test.ts`
Expected: FAIL — `resolveDrop` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/domain/seating.ts`:

```ts
/**
 * Who is currently in the teacher's hand.
 *
 * Anchored to a pupil's id or to a cell's coordinates, never to a position in
 * the rail: the rail reorders every time somebody is seated, and an
 * index-held selection would retarget onto whoever slid into that slot. This
 * codebase has produced that bug three times already.
 */
export type Held =
  | { kind: "pool"; studentId: string }
  | { kind: "seat"; row: number; col: number };

/** What a drop resolves to. The caller turns it into exactly one write. */
export type DropAction =
  | { kind: "none" }
  | { kind: "seat"; studentId: string; row: number; col: number }
  | { kind: "swap"; from: { row: number; col: number }; to: { row: number; col: number } };

/**
 * Decide what dropping `held` on the cell at `at` means.
 *
 * Pure, and tested, because this is the rule the whole interaction rests on
 * and it is far too easy to read wrong off a click handler: a pupil from the
 * rail always *seats* (displacing whoever was there, which `seatStudent`
 * already does in one transaction), a pupil from a seat always *swaps* (which
 * degrades to a move when the target is empty), and a gap is never a target.
 */
export function resolveDrop(
  held: Held,
  target: Seat | undefined,
  at: { row: number; col: number },
): DropAction {
  if (target === undefined) return { kind: "none" };
  if (held.kind === "pool") {
    return { kind: "seat", studentId: held.studentId, row: at.row, col: at.col };
  }
  if (held.row === at.row && held.col === at.col) return { kind: "none" };
  return { kind: "swap", from: { row: held.row, col: held.col }, to: { row: at.row, col: at.col } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/domain/seating.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`

- [ ] **Step 6: Commit**

```bash
git add src/domain/seating.ts src/domain/seating.test.ts
git commit -m "feat(domain): resolveDrop decides what a seating drop means"
```

---

### Task 4: An over-capacity backup is refused whole

**Files:**
- Modify: `src/db/backup.ts` (the `parseBackup` function, around line 222)
- Modify: `src/modules/settings/page.tsx` (the two `catch` blocks, around lines 73 and 84)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Test: `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `classesOverCapacity`, `MAX_STUDENTS_PER_CLASS` from Task 1.
- Produces: `class BackupOverCapacityError extends Error` with a `classIds: string[]` field, exported from `src/db/backup.ts`. The settings page distinguishes it from a malformed file.

- [ ] **Step 1: Write the failing tests**

Append to `src/db/backup.test.ts`, adding `BackupOverCapacityError` to its import from `./backup`:

```ts
describe("class-size ceiling on import", () => {
  /** A minimal, schema-valid backup carrying `count` pupils in one class. */
  function backupWithRoster(count: number) {
    return {
      version: 6,
      exportedAt: Date.now(),
      classes: [{ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 }],
      students: Array.from({ length: count }, (_, i) => ({
        id: `s${i}`,
        classId: "c1",
        lastName: `NOM${i}`,
        firstName: "Test",
        createdAt: 1,
        updatedAt: 1,
      })),
      subjects: [],
      gradebooks: [],
      periods: [],
      columns: [],
      grades: [],
      sessions: [],
      attendance: [],
      behaviourEvents: [],
      seatingLayouts: [],
      seats: [],
      rubricTemplates: [],
      rubricAssessments: [],
      rubricScores: [],
      studentGroups: [],
      groupMembers: [],
      scheduleEntries: [],
      diaryEntries: [],
    };
  }

  it("accepts a class sitting exactly on the ceiling", () => {
    expect(() => parseBackup(backupWithRoster(100))).not.toThrow();
  });

  it("refuses a file whose class exceeds the ceiling, naming the class", () => {
    try {
      parseBackup(backupWithRoster(101));
      throw new Error("expected parseBackup to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BackupOverCapacityError);
      expect((error as BackupOverCapacityError).classIds).toEqual(["c1"]);
    }
  });

  it("leaves the workspace untouched when it refuses", async () => {
    // The refusal has to happen before the transaction that clears every
    // table, or a rejected file would still have destroyed the workspace.
    const db = openWorkspaceDb("backup-over-capacity");
    await seedIfEmpty(db, "backup-over-capacity");
    const before = await db.students.count();

    await expect(importWorkspace(db, backupWithRoster(101))).rejects.toBeInstanceOf(
      BackupOverCapacityError,
    );

    expect(await db.students.count()).toBe(before);
    expect(await db.classes.count()).toBeGreaterThan(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/db/backup.test.ts`
Expected: FAIL — `BackupOverCapacityError` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/db/backup.ts`, add the import at the top:

```ts
import { classesOverCapacity, MAX_STUDENTS_PER_CLASS } from "@domain/class-size";
```

Add above `parseBackup`:

```ts
/**
 * A backup file carrying a class larger than the ceiling.
 *
 * Its own type, not a generic `Error`, because the settings page must tell
 * the teacher which of the two refusals happened: a malformed file is a bad
 * file, an over-capacity one is their own data hitting a rule added after it
 * was exported, and those need different words.
 */
export class BackupOverCapacityError extends Error {
  readonly classIds: string[];

  constructor(classIds: string[]) {
    super(`Class over capacity: ${classIds.join(", ")} (max ${MAX_STUDENTS_PER_CLASS})`);
    this.name = "BackupOverCapacityError";
    this.classIds = classIds;
  }
}
```

Then, inside `parseBackup`, after the schema check and before the return:

```ts
export function parseBackup(backup: unknown): WorkspaceBackup {
  const parsed = backupSchema.safeParse(backup);
  if (!parsed.success) {
    throw new Error("Invalid backup file");
  }
  const data = parsed.data as unknown as WorkspaceBackup;

  // Refused whole, never imported and capped afterwards: a backup that
  // violates an invariant is rejected the same way a v5 file is rejected
  // rather than upgraded. Half a legal workspace looks like a whole one.
  //
  // This runs BEFORE `importWorkspace`'s transaction clears every table, so a
  // refusal costs the teacher nothing.
  const over = classesOverCapacity(data.students);
  if (over.length > 0) throw new BackupOverCapacityError(over);

  return data;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/db/backup.test.ts`
Expected: PASS, including the three new cases.

- [ ] **Step 5: Tell the teacher which refusal it was**

In `src/modules/settings/page.tsx`, import the error:

```ts
import { BackupOverCapacityError, exportWorkspace, importWorkspace, parseBackup, type WorkspaceBackup } from "@db/backup";
```

and replace both bare `catch {` blocks with a discriminating one. In `onFileChosen`:

```ts
    } catch (error) {
      setError(
        error instanceof BackupOverCapacityError
          ? t("settings.importOverCapacity", { max: MAX_STUDENTS_PER_CLASS })
          : t("settings.importFailed"),
      );
      resetFileInput();
    }
```

and in `onConfirmImport`:

```ts
    } catch (error) {
      setError(
        error instanceof BackupOverCapacityError
          ? t("settings.importOverCapacity", { max: MAX_STUDENTS_PER_CLASS })
          : t("settings.importFailed"),
      );
    } finally {
```

Add `import { MAX_STUDENTS_PER_CLASS } from "@domain/class-size";` to that file.

- [ ] **Step 6: Add the strings to both locales**

`src/i18n/locales/fr.json`, inside `settings`:

```json
"importOverCapacity": "Import refusé : ce fichier contient une classe de plus de {{max}} élèves.",
```

`src/i18n/locales/en.json`, inside `settings`:

```json
"importOverCapacity": "Import refused: this file contains a class of more than {{max}} pupils.",
```

- [ ] **Step 7: Run the full gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green, including the i18n parity test.

- [ ] **Step 8: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts src/modules/settings/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(backup): refuse a file carrying a class over the ceiling"
```

---

### Task 5: The ceiling at the two roster-editing sites

**Files:**
- Modify: `src/modules/class/components/student-form.tsx`
- Modify: `src/modules/class/components/csv-import.tsx`
- Modify: `src/modules/class/page.tsx` (pass the current count into both, around lines 162-179)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `MAX_STUDENTS_PER_CLASS`, `remainingCapacity` from Task 1.
- Produces: `StudentForm` gains a required `studentCount: number` prop; `CsvImport` gains a required `studentCount: number` prop.

There are no component tests in this project (see Global Constraints). This task is verified in the browser at Step 5.

- [ ] **Step 1: Refuse a new pupil past the ceiling in `student-form.tsx`**

Add the imports:

```ts
import { MAX_STUDENTS_PER_CLASS, remainingCapacity } from "@domain/class-size";
```

Add `studentCount: number` to the component's props, and derive:

```ts
  // Only an ADD can breach the ceiling. Editing an existing pupil must stay
  // possible in a class that is already at or over it — otherwise a teacher
  // who imported an over-sized roster could no longer correct a name in it.
  const full = student === undefined && remainingCapacity(studentCount) === 0;
```

Guard the submit, so that a form submitted by keyboard cannot bypass the disabled button:

```ts
  const onSubmit = handleSubmit(async (values) => {
    if (full) return;
    const now = Date.now();
    // ... unchanged
```

and in the JSX, above the buttons:

```tsx
      {full && (
        <p role="alert" className="text-danger text-sm">
          {t("class.rosterFull", { max: MAX_STUDENTS_PER_CLASS })}
        </p>
      )}
```

and add `|| full` to the submit button's existing `disabled={isSubmitting}`.

- [ ] **Step 2: Bound the import in `csv-import.tsx`**

Add the imports:

```ts
import { MAX_STUDENTS_PER_CLASS, remainingCapacity } from "@domain/class-size";
```

Add `studentCount: number` to the props, and derive, next to the existing `duplicates` memo:

```ts
  const remaining = remainingCapacity(studentCount);
  const selectedCount = roster.length - excluded.size;
  const excess = Math.max(0, selectedCount - remaining);
```

Replace the existing summary paragraph with the summary plus a capacity line:

```tsx
          <p className="text-sm text-text-muted">
            {t("csv.summary", {
              total: selectedCount,
              duplicates: duplicates.size,
            })}
            {" — "}
            {t("csv.capacity", { remaining })}
          </p>

          {excess > 0 && (
            <p role="alert" className="text-danger text-sm">
              {t("csv.overCapacity", { excess, max: MAX_STUDENTS_PER_CLASS })}
            </p>
          )}
```

and extend the import button's `disabled`:

```tsx
          disabled={roster.length === 0 || roster.length === excluded.size || excess > 0}
```

- [ ] **Step 3: Pass the count from the class page**

In `src/modules/class/page.tsx`, the roster is already loaded as `students`. Add `studentCount={students.length}` to all three call sites — the two `StudentForm`s and the `CsvImport`.

- [ ] **Step 4: Add the strings to both locales**

`fr.json`, inside `class`:

```json
"rosterFull": "Cette classe a atteint {{max}} élèves : impossible d'en ajouter un autre.",
```

`fr.json`, inside `csv`:

```json
"capacity": "{{remaining}} place(s) restante(s) dans la classe",
"overCapacity": "Décochez {{excess}} ligne(s) : la classe dépasserait {{max}} élèves.",
```

`en.json`, inside `class`:

```json
"rosterFull": "This class has reached {{max}} pupils: no more can be added.",
```

`en.json`, inside `csv`:

```json
"capacity": "{{remaining}} place(s) left in the class",
"overCapacity": "Untick {{excess}} row(s): the class would exceed {{max}} pupils.",
```

Note: none of these use an interpolation variable named `count`, which would trigger i18next plural resolution.

- [ ] **Step 5: Run the gate, then verify in the browser**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`

Then with `yarn dev` on port 3000, on a class page: paste a CSV of 200 rows into the import, confirm the capacity line reads the remaining places, the red line names how many rows to untick, and the import button is disabled until enough are unticked.

- [ ] **Step 6: Commit**

```bash
git add src/modules/class src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(class): enforce the roster ceiling when adding and importing pupils"
```

---

### Task 6: The rail

**Files:**
- Create: `src/modules/plan/components/student-rail.tsx`
- Delete: `src/modules/plan/components/unseated-pool.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

This task creates the component; Task 7 wires it in. Between the two the app does not compile — they are one commit if you prefer, but the file is large enough to be worth its own review. If you run them separately, do not run the gate at the end of this task; run it at the end of Task 7.

**Interfaces:**
- Consumes: `fuzzyMatchAny` from `@domain/search`, `Held` from `@domain/seating` (Task 3), `PupilName` from `../../design-system/components/pupil-name`.
- Produces:

```ts
export function StudentRail(props: {
  students: Student[];
  held: Held | null;
  onHold: (studentId: string) => void;
}): JSX.Element
```

- [ ] **Step 1: Write the component**

Create `src/modules/plan/components/student-rail.tsx`:

```tsx
import type { Student } from "@db";
import { fuzzyMatchAny } from "@domain/search";
import type { Held } from "@domain/seating";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/** Above this many chips the rail stops being scannable and grows a search field. */
const SEARCH_THRESHOLD = 12;

/**
 * The pupils holding no seat, beside the grid rather than under it.
 *
 * Tap a chip to pick that pupil up, tap it again to put them down, then tap a
 * seat. Nothing here is ever disabled: the old pool was inert until a seat had
 * been armed, and its hint line appeared and disappeared with that state,
 * which moved every chip by a line height between the two taps of a single
 * gesture. The hint is always present now, and only its text changes.
 */
export function StudentRail({
  students,
  held,
  onHold,
}: {
  students: Student[];
  held: Held | null;
  onHold: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const showSearch = students.length > SEARCH_THRESHOLD;
  const visible = showSearch
    ? students.filter((s) => fuzzyMatchAny([s.lastName, s.firstName], query))
    : students;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 lg:sticky lg:top-4 lg:w-64 lg:shrink-0">
      <h3 className="flex items-center justify-between gap-2 font-medium text-sm text-text-muted">
        {t("plan.unseated")}
        <span className="rounded-full bg-accent px-2 py-0.5 text-white text-xs">
          {students.length}
        </span>
      </h3>

      {students.length === 0 ? (
        <p className="text-sm text-text-muted">{t("plan.allSeated")}</p>
      ) : (
        <>
          {showSearch && (
            <input
              className="field"
              type="search"
              placeholder={t("plan.searchPupil")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          <div className="flex flex-wrap gap-2 lg:max-h-[28rem] lg:flex-col lg:overflow-y-auto">
            {visible.map((student) => {
              const isHeld = held?.kind === "pool" && held.studentId === student.id;
              return (
                <button
                  key={student.id}
                  type="button"
                  aria-pressed={isHeld}
                  className={`btn flex min-h-11 items-center gap-1.5 text-sm lg:justify-start ${
                    isHeld ? "border-accent ring-2 ring-accent" : ""
                  }`}
                  onClick={() => onHold(student.id)}
                >
                  <PupilName student={student} />
                </button>
              );
            })}
          </div>

          <p className="text-text-faint text-xs">
            {held === null ? t("plan.hintPick") : t("plan.hintPlace")}
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete the pool**

```bash
git rm src/modules/plan/components/unseated-pool.tsx
```

- [ ] **Step 3: Move the strings**

In `fr.json`, inside `plan`: remove `"tapSeatThenStudent"` and add

```json
"hintPick": "Touchez un élève, puis une place.",
"hintPlace": "Posez-le sur une place. Occupée, les deux échangent.",
"searchPupil": "Rechercher un élève",
"movePupil": "Déplacer",
"putDown": "Reposer",
```

In `en.json`, inside `plan`: remove `"tapSeatThenStudent"` and add

```json
"hintPick": "Tap a pupil, then a seat.",
"hintPlace": "Drop them on a seat. If it is taken, the two swap.",
"searchPupil": "Search for a pupil",
"movePupil": "Move",
"putDown": "Put down",
```

- [ ] **Step 4: Commit (the tree does not compile until Task 7)**

```bash
git add -A src/modules/plan src/i18n/locales
git commit -m "feat(plan): the unseated rail replaces the pool strip"
```

---

### Task 7: Hold and drop, in the page and the grid

**Files:**
- Modify: `src/modules/plan/page.tsx`
- Modify: `src/modules/plan/components/seat-grid.tsx`
- Modify: `src/modules/plan/components/student-card.tsx`

**Interfaces:**
- Consumes: `resolveDrop`, `Held`, `DropAction` (Task 3); `swapSeats` (Task 2); `StudentRail` (Task 6).
- Produces: the finished interaction. Nothing downstream depends on it.

- [ ] **Step 1: Replace `armedSeat` with `held` in `page.tsx`**

Swap the imports:

```ts
import { getOrCreateLayout, seatStudent, swapSeats } from "@db/seating";
import { type Held, resolveDrop, unseatedStudentIds } from "@domain/seating";
import { useEscape } from "../shared/use-escape";
import { StudentRail } from "./components/student-rail";
```

(remove the `UnseatedPool` import).

Replace the `armedSeat` state with:

```ts
  // Who is in the teacher's hand: a pupil id from the rail, or a seat's
  // coordinates. Never a list index — the rail reorders on every placement.
  const [held, setHeld] = useState<Held | null>(null);
```

Add, after the other callbacks:

```ts
  const releaseHeld = useCallback(() => setHeld(null), []);
  useEscape(releaseHeld);
```

Add the drop handler (place it after `seats` and `layout` are resolved, inside the component body below the loading guards so `layout` is non-null):

```ts
  const onDrop = async (row: number, col: number): Promise<void> => {
    if (held === null) return;
    const target = seats.find((s) => s.row === row && s.col === col);
    const action = resolveDrop(held, target, { row, col });
    if (action.kind === "seat") {
      await seatStudent(db, layout.id, action.row, action.col, action.studentId);
    } else if (action.kind === "swap") {
      await swapSeats(db, layout.id, action.from, action.to);
    }
    setHeld(null);
  };
```

In the `Modifier le plan` button's `onClick`, replace `setArmedSeat(null)` with `setHeld(null)` — a held pupil is a live gesture and must not survive a mode change, exactly as the armed seat did not.

- [ ] **Step 2: Lay the grid and the rail side by side**

Replace the `SeatGrid` element, the `GroupFilter` block and the `UnseatedPool` block with:

```tsx
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The rail comes first in the DOM so that on a narrow screen the
            pupil you are about to place is not below the fold while you look
            at where to put them. */}
        <div className="flex flex-col gap-2 lg:order-2 lg:w-64 lg:shrink-0">
          {groups.length > 0 && (
            <GroupFilter
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={setSelectedGroupId}
            />
          )}
          <StudentRail
            students={visibleUnseated}
            held={held}
            onHold={(studentId) =>
              setHeld((current) =>
                current?.kind === "pool" && current.studentId === studentId
                  ? null
                  : { kind: "pool", studentId },
              )
            }
          />
        </div>

        <div className="lg:order-1 lg:min-w-0 lg:flex-1">
          <SeatGrid
            layout={layout}
            seats={seats}
            studentsById={byId}
            held={held}
            onHoldSeat={(row, col) => setHeld({ kind: "seat", row, col })}
            onDrop={(row, col) => void onDrop(row, col)}
            onSelectStudent={setSelectedStudentId}
            editing={resizing}
          />
        </div>
      </div>
```

Keep the `StudentCard` block where it is, and give it the move action:

```tsx
            <StudentCard
              key={student.id}
              student={student}
              session={session}
              onClose={() => setSelectedStudentId(null)}
              onMove={() => {
                const seat = seats.find((s) => s.studentId === student.id);
                if (!seat) return;
                setSelectedStudentId(null);
                setHeld({ kind: "seat", row: seat.row, col: seat.col });
              }}
            />
```

- [ ] **Step 3: Rewrite the grid's click rules in `seat-grid.tsx`**

Replace the `armedSeat` / `onArmSeat` props with:

```ts
  /** Who is held, or null. A seat is a target only while something is held. */
  held: Held | null;
  /** Pick up the occupant of a seat. Only reachable in layout-edit mode. */
  onHoldSeat: (row: number, col: number) => void;
  /** Drop whoever is held onto this cell. */
  onDrop: (row: number, col: number) => void;
```

Import `Held` from `@domain/seating`, and drop the now-unused `moveSeat` import.

Empty seat — a target while something is held, inert otherwise:

```tsx
          if (seat.studentId === null) {
            return (
              <div key={coord} className="relative">
                <button
                  type="button"
                  disabled={held === null}
                  className={`flex h-14 w-16 flex-col items-center justify-center rounded-md border text-[11px] text-text-muted disabled:cursor-default ${
                    held !== null
                      ? "border-accent border-dashed bg-accent/10 hover:bg-bg-hover"
                      : "border-border"
                  }`}
                  onClick={() => onDrop(row, col)}
                >
                  {t("plan.emptySeat")}
                </button>
                {editing && (
                  /* the existing × button, unchanged */
                )}
              </div>
            );
          }
```

Occupied seat — the three-way rule, and the one line that protects the lesson:

```tsx
          return (
            <div key={coord} className="relative">
              <button
                type="button"
                title={held ? t("plan.moveHere") : undefined}
                className={`flex h-14 w-16 flex-col items-center justify-center gap-0.5 rounded-md border p-1 hover:bg-bg-hover ${
                  isHeldSeat
                    ? "border-accent ring-2 ring-accent"
                    : held
                      ? "border-accent border-dashed"
                      : "border-border"
                }`}
                onClick={() => {
                  // Something held: this seat is a target.
                  // Nothing held, layout-edit mode: pick this pupil up.
                  // Nothing held, normal mode: open their card. That last
                  // branch is the gesture of the lesson itself — attendance
                  // and behaviour — and it stays the bare tap.
                  if (held) onDrop(row, col);
                  else if (editing) onHoldSeat(row, col);
                  else onSelectStudent(student.id);
                }}
              >
                <PupilDisc student={student} />
                <span className="w-full truncate text-[10px] text-text">
                  <PupilName student={student} format="surname" />
                </span>
              </button>
              {editing && (
                /* the existing × button, unchanged */
              )}
            </div>
          );
```

with, above the return of that branch:

```tsx
          const isHeldSeat = held?.kind === "seat" && held.row === row && held.col === col;
```

The gap branch and the stale-pupil branch are unchanged. Delete the `movePupil` helper — `onDrop` replaces it.

- [ ] **Step 4: Add the move action to `student-card.tsx`**

Add `onMove: () => void` to the props, and put the button beside the close button:

```tsx
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={onMove}>
            {t("plan.movePupil")}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
```

- [ ] **Step 5: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all four green. `resolveDrop` and `swapSeats` carry the logic tests; nothing here is component-tested.

- [ ] **Step 6: Verify in a real browser**

With `yarn dev` on port 3000, open a class's `Plan de classe` and walk every branch:

1. Tap a chip in the rail → it shows as held, the hint changes, every seat lights up.
2. Tap an empty seat → the pupil is seated, the counter drops by one, the rail does **not** move under the pointer.
3. Tap a chip, then tap an **occupied** seat → the pupils exchange places: the occupant is now in the rail, the counter is unchanged.
4. Tap a seated pupil with nothing held → their **card** opens (attendance, behaviour). This is the regression that matters most.
5. In the card, tap `Déplacer` → the card closes, that pupil is held, tap another occupied seat → the two swap.
6. `Modifier le plan` → tap a seated pupil → they are picked up directly. Leave the mode → nobody is held.
7. Pick someone up, press `Escape` → released.
8. Tap the held chip again → released.
9. With more than 12 unseated pupils, the search field appears; type a lowercase unaccented fragment of an accented surname and confirm it matches.

- [ ] **Step 7: Commit**

```bash
git add src/modules/plan
git commit -m "feat(plan): pick up a pupil, then choose a seat"
```

---

### Task 8: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite the three passages**

1. In the architecture section, the seating paragraph: the armed seat becomes a held pupil; say that `resolveDrop` in `src/domain/seating.ts` owns the rule, that a pupil from the rail displaces an occupant while a pupil from a seat swaps with them, and that the bare tap on a seated pupil is still the pupil card — picking one up goes through the card's `Déplacer` or through layout-edit mode.
2. In the identity-anchor list, replace the armed-seat bullet with one for `held`: it carries a pupil id or a seat's coordinates, never a rail index, *because the rail reorders on every placement*.
3. Add to the invariants: a class holds at most `MAX_STUDENTS_PER_CLASS` (100) pupils, enforced at `student-form.tsx`, `csv-import.tsx` and `parseBackup`; an over-capacity backup is refused whole, and the check sits before the clearing transaction on purpose.
4. In "Known v1 gaps": drag and drop, and a fill mode with auto-arrangements, were deliberately deferred in phase 5 — not forgotten.

- [ ] **Step 2: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record phase 5's seating gesture and the roster ceiling"
```

---

## Self-Review

**Spec coverage:** inverted gesture → Tasks 3, 7. Displacement vs swap → Tasks 2, 3. Bare tap stays the card → Task 7 Steps 3-4, verified at Step 6.4. Empty seats inert → Task 7 Step 3. Rail (sticky, count, always enabled, scroll, search above 12, stable hint line) → Task 6. Mode change releases → Task 7 Step 1. `swapSeats` incl. gap refusal → Task 2. `seatStudent` untouched but asserted → Task 2. Ceiling constant + helpers → Task 1. Three write sites → Tasks 4, 5. Backup refused whole, workspace intact → Task 4. Drag & drop and fill mode deferred → recorded in Task 8. CLAUDE.md → Task 8.

**Placeholders:** none. The two `/* the existing × button, unchanged */` markers in Task 7 point at code already in the file being edited, which the implementer has open; they are not new code left unwritten.

**Type consistency:** `Held`, `DropAction` and `resolveDrop` are defined in Task 3 and used with those exact names in Tasks 6 and 7. `swapSeats(db, layoutId, a, b)` is defined in Task 2 and called with `action.from` / `action.to` in Task 7, matching `{ row, col }`. `remainingCapacity` / `MAX_STUDENTS_PER_CLASS` / `classesOverCapacity` are defined in Task 1 and used in Tasks 4 and 5. `StudentRail`'s props match its call site. `studentCount` is the prop name at all three call sites in Task 5.
