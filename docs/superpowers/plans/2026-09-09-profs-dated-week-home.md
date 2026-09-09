# The Front Door as a Dated Week — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/` with the `/schedule` hour grid drawn on real dates around today, and make every séance carry a start and an end so that every séance can be placed on it.

**Architecture:** Two phases. **Phase A** is a data-model change: `Session.startsAt` becomes required, `Session.endsAt` is added, `db.version(16)` carries the repo's first `upgrade()` to backfill existing rows, and the class page's séance strip gains a time editor. **Phase B** is the screen: `TimeGrid` generalises from weekday columns to opaque column keys and moves to `design-system/`, the diary's calendar navigation is extracted beside it, and `today/page.tsx` becomes the dated grid behind `Home: "/?:date"`.

Phase A must land first: the grid has no way to place an untimed séance, which is the whole reason the field stops being optional.

**Tech Stack:** TypeScript, React 19, Dexie (IndexedDB), Chicane router, TanStack Virtual, i18next, Tailwind, Jest + fake-indexeddb, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-09-profs-dated-week-home-design.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN font, no analytics, no external image. This is a documented promise in `README.md` and `PRIVACY.md`, not a preference.
- **Node is not on the default PATH.** Every command below fails with `command not found` until you prepend it:
  `export PATH="$HOME/.local/share/fnm/node-versions/$(ls $HOME/.local/share/fnm/node-versions | tail -1)/installation/bin:$PATH"`
- **Validation gate, all four green before any task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`
- **Never `window.confirm`, `alert`, `beforeunload`,** or any blocking browser dialog. They freeze the browser automation these pages are verified with.
- **Every user-visible string goes through `t()`,** and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json` — a parity test fails the build otherwise. `fr` is default and fallback.
- **Identifiers are English; only translation values are French.**
- **Never add days by arithmetic.** `+ 86_400_000` is wrong at each DST change. Walk the calendar with `nextDay` / `previousDay`.
- **Times are minutes from midnight,** never `"10:05"`.
- **IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.**
- **State bound to a record is anchored to that record's identity, never to its position** in a list.
- **Never assert an exact session, attendance or behaviour count in a test.** The demo seed's history runs from the rentrée to today, so those counts grow with the calendar.
- **Working directory:** `/Users/zoidberg/Projects/profs/.claude/worktrees/dated-week-home`, branch `worktree-dated-week-home`.

---

# Phase A — A séance has a start and an end

### Task 1: `DEFAULT_SEANCE_MINUTES` and `backfillSeanceTimes`

The pure repair rule, written first because two callers in two layers depend on it — the Dexie `upgrade()` in Task 2 and `parseBackup` in Task 5. A repair rule kept in two places eventually disagrees with itself.

**Files:**
- Modify: `src/domain/seance.ts`
- Test: `src/domain/seance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const DEFAULT_SEANCE_MINUTES = 55`
  - `export function hourOfDay(ms: number): number` — local hour of a timestamp, as minutes from midnight
  - `export function backfillSeanceTimes(row: { startsAt?: number; endsAt?: number; createdAt: number }): { startsAt: number; endsAt: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/seance.test.ts`:

```ts
import {
  backfillSeanceTimes,
  DEFAULT_SEANCE_MINUTES,
  hourOfDay,
} from "./seance";

describe("hourOfDay", () => {
  it("floors a timestamp to its local hour, in minutes from midnight", () => {
    // 10:37 local on an arbitrary day.
    const at = new Date(2026, 8, 9, 10, 37, 12).getTime();
    expect(hourOfDay(at)).toBe(10 * 60);
  });

  it("keeps an exact hour where it is", () => {
    expect(hourOfDay(new Date(2026, 8, 9, 14, 0, 0).getTime())).toBe(14 * 60);
  });

  it("reads midnight as zero", () => {
    expect(hourOfDay(new Date(2026, 8, 9, 0, 12, 0).getTime())).toBe(0);
  });
});

describe("backfillSeanceTimes", () => {
  it("takes the hour a séance was created in when it has no start", () => {
    // A séance is created BY a mid-lesson act — a mark, a behaviour event —
    // so the hour it was created in is the hour it was taught in.
    const createdAt = new Date(2026, 8, 9, 10, 37, 0).getTime();
    expect(backfillSeanceTimes({ createdAt })).toEqual({
      startsAt: 600,
      endsAt: 600 + DEFAULT_SEANCE_MINUTES,
    });
  });

  it("keeps a start it already has, and gives it the default end", () => {
    const createdAt = new Date(2026, 8, 9, 21, 4, 0).getTime();
    expect(backfillSeanceTimes({ startsAt: 480, createdAt })).toEqual({
      startsAt: 480,
      endsAt: 480 + DEFAULT_SEANCE_MINUTES,
    });
  });

  it("returns a fully timed row unchanged", () => {
    const createdAt = new Date(2026, 8, 9, 10, 0, 0).getTime();
    expect(backfillSeanceTimes({ startsAt: 480, endsAt: 600, createdAt })).toEqual({
      startsAt: 480,
      endsAt: 600,
    });
  });

  it("never lets a repaired end run past midnight", () => {
    // 23:30 floors to 23:00; 23:00 + 55 is 23:55, still inside the day.
    const createdAt = new Date(2026, 8, 9, 23, 30, 0).getTime();
    const { startsAt, endsAt } = backfillSeanceTimes({ createdAt });
    expect(startsAt).toBe(23 * 60);
    expect(endsAt).toBeLessThanOrEqual(24 * 60);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/$(ls $HOME/.local/share/fnm/node-versions | tail -1)/installation/bin:$PATH"
yarn test src/domain/seance.test.ts
```

Expected: FAIL — `backfillSeanceTimes is not a function` (and the same for `hourOfDay`).

- [ ] **Step 3: Write the implementation**

Add to the top of `src/domain/seance.ts`, after the existing imports:

```ts
/**
 * The ordinary French lesson, in minutes.
 *
 * It is the default END of a séance that has no lesson to take one from —
 * never a stored duration, and never a render-time guess. A séance's end is
 * a fact about that lesson, so it is written down.
 */
export const DEFAULT_SEANCE_MINUTES = 55;

/**
 * The local hour of a timestamp, as minutes from midnight.
 *
 * `getHours` rather than any arithmetic on the epoch value: the offset from
 * UTC is not constant, so dividing a timestamp would land an hour out for
 * half the year.
 */
export function hourOfDay(ms: number): number {
  return new Date(ms).getHours() * 60;
}

/**
 * A séance's times, repaired from whatever an older row does carry.
 *
 * Pure, and in the domain, because it has two callers in two layers — the
 * `db.version(16)` upgrade and `parseBackup` — and a repair rule kept in two
 * places is a repair rule that eventually disagrees with itself. This is the
 * argument that made `entriesForDay` one function.
 *
 * `createdAt` is the right source for a missing start because of how a séance
 * comes into being: all four things that create one — an attendance mark, a
 * behaviour event, note text, "Commencer une séance" — are acts performed
 * during the lesson, so the hour a séance was created in is the hour it was
 * taught in. Where it guesses wrong, the séance strip's editor corrects it.
 */
export function backfillSeanceTimes(row: {
  startsAt?: number;
  endsAt?: number;
  createdAt: number;
}): { startsAt: number; endsAt: number } {
  const startsAt = row.startsAt ?? hourOfDay(row.createdAt);
  return { startsAt, endsAt: row.endsAt ?? startsAt + DEFAULT_SEANCE_MINUTES };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
yarn test src/domain/seance.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/seance.ts src/domain/seance.test.ts
git commit -m "feat(seance): the repair rule for a séance with no times

Pure, and in the domain, because the Dexie upgrade and parseBackup both need
it — and a repair rule kept in two places eventually disagrees with itself.

createdAt is the right source for a missing start: all four things that
create a séance are acts performed during the lesson, so the hour it was
created in is the hour it was taught in."
```

---

### Task 2: `Session.endsAt`, and the first `upgrade()`

**Files:**
- Modify: `src/db/types.ts:96-113`
- Modify: `src/db/index.ts` (after the `db.version(15)` block, before `return db`)
- Test: `src/db/index.test.ts`

**Interfaces:**
- Consumes: `backfillSeanceTimes` from Task 1.
- Produces: `Session.startsAt: number` (required) and `Session.endsAt: number` on the row type every later task reads.

- [ ] **Step 1: Write the failing regression test**

This is the seam `CLAUDE.md` names as the suite's blind spot — nothing else runs new code against an old row. Append to `src/db/index.test.ts`, matching the style of the existing v2 / v9 / v13 regression tests in that file:

```ts
it("gives a v15 séance a start and an end, and keeps what hangs off it", async () => {
  // A v15 database: the séance carries no times, and an attendance row and a
  // behaviour event are keyed to it. Dropping the store — what the
  // disposable-schema rule prescribes for a changed shape — would destroy the
  // séance and leave these two as orphans nothing reads and every export
  // carries. That is why v16 backfills instead.
  const name = `profs-upgrade-${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  // 10:37 local, so the repaired start must be 10:00 and not 11:00.
  const createdAt = new Date(2026, 8, 9, 10, 37, 0).getTime();

  const legacy = new Dexie(name);
  legacy.version(15).stores({
    sessions: "id, classId, date, [classId+date]",
    attendance: "[sessionId+studentId], sessionId, studentId",
    behaviourEvents: "id, sessionId, studentId, date",
  });
  await legacy.open();
  await legacy.table("sessions").put({
    id: sessionId,
    classId: "c1",
    date: startOfDay(createdAt),
    createdAt,
  });
  await legacy.table("attendance").put({
    sessionId,
    studentId,
    value: "present",
    updatedAt: createdAt,
  });
  await legacy.table("behaviourEvents").put({
    id: crypto.randomUUID(),
    sessionId,
    studentId,
    type: "positive",
    date: startOfDay(createdAt),
    createdAt,
  });
  legacy.close();

  const db = openWorkspaceDb(name.replace("profs-", ""));
  await db.open();

  const session = await db.sessions.get(sessionId);
  expect(session?.startsAt).toBe(10 * 60);
  expect(session?.endsAt).toBe(10 * 60 + 55);

  // The two assertions the whole design hangs on.
  expect(await db.attendance.where("sessionId").equals(sessionId).count()).toBe(1);
  expect(await db.behaviourEvents.where("sessionId").equals(sessionId).count()).toBe(1);

  db.close();
});
```

Check the top of `src/db/index.test.ts` for how it already constructs a legacy database — it imports `Dexie` and `openWorkspaceDb` and uses `fake-indexeddb/auto`. Reuse whatever helper is there rather than adding a second way; and copy the v15 index strings for `sessions`, `attendance` and `behaviourEvents` **verbatim from `src/db/index.ts`** rather than from this plan, so the fixture matches the real prior schema.

- [ ] **Step 2: Run it to verify it fails**

```bash
yarn test src/db/index.test.ts
```

Expected: FAIL — `session?.startsAt` is `undefined`, not `600`.

- [ ] **Step 3: Make `endsAt` part of the row type**

In `src/db/types.ts`, replace the `startsAt` field and its comment (lines 101-109) with:

```ts
  /**
   * Minutes from midnight. Required: a séance always has a time.
   *
   * It was optional until v16, and the absence meant "recorded before séances
   * carried a time, or opened outside the timetable". That absence had to be
   * covered by everything that read a séance, and on an hour grid it has no
   * answer at all — a lesson with no time has no position.
   *
   * This records WHEN THIS LESSON WAS; it is not a foreign key into the
   * timetable. A lesson moved to another hour next term leaves every past
   * séance holding the time it actually happened at, which is why both ends
   * are COPIED from the schedule entry rather than read through it.
   */
  startsAt: number;
  /** Minutes from midnight. `startsAt + DEFAULT_SEANCE_MINUTES` by default. */
  endsAt: number;
```

- [ ] **Step 4: Write the upgrade**

In `src/db/index.ts`, add `import { backfillSeanceTimes } from "@domain/seance";` to the imports, then insert immediately before `return db;`:

```ts
  /**
   * A séance gets a start and an end. THE FIRST UPGRADE FUNCTION HERE, and a
   * deliberate exception to "schema changes are disposable".
   *
   * The standing rule's move for a store whose SHAPE changed is to drop it and
   * redeclare it in the next version. That is wrong for `sessions`:
   * `attendance` and `behaviourEvents` are both keyed to `sessions.id`, so
   * dropping it destroys every séance and leaves a term of attendance and
   * behaviour as rows nothing reads, nothing counts, and every export carries
   * — the invisible-orphan failure `cascade.ts` exists to prevent, produced
   * deliberately by the rule meant to keep the schema simple.
   *
   * The rule is not abandoned. It still stands for every change that ADDS a
   * table or a field. What it does not cover — as it already admits for a
   * changed primary key — is a field becoming required underneath rows that
   * carry dependents.
   *
   * No `.stores()`: no index changes, so the schema is inherited.
   */
  db.version(16).upgrade(async (tx) => {
    await tx
      .table("sessions")
      .toCollection()
      .modify((session) => {
        const { startsAt, endsAt } = backfillSeanceTimes(session);
        session.startsAt = startsAt;
        session.endsAt = endsAt;
      });
  });
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
yarn test src/db/index.test.ts
```

Expected: PASS. If Dexie rejects a version with no `.stores()` call, change it to `db.version(16).stores({}).upgrade(async (tx) => { ... })` — an empty object inherits rather than clearing — and re-run.

`yarn typecheck` will now report errors across `src/db/sessions.ts`, `src/db/seed.ts`, `src/domain/seance.ts` and their tests, because `startsAt` is required and `endsAt` does not exist yet at the write sites. **That is expected**; Tasks 3 and 4 fix them. Do not chase them here.

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/db/index.ts src/db/index.test.ts
git commit -m "feat(db): a séance carries a start and an end

Dropping and redeclaring \`sessions\`, which the disposable-schema rule
prescribes for a changed shape, would destroy every séance and leave a term
of attendance and behaviour as orphans nothing reads and every export
carries. So v16 backfills instead — the first upgrade() in this codebase.

The regression test asserts the two things that justify it: the séance's
attendance row and its behaviour event both still resolve to it."
```

---

### Task 3: Every creation path supplies both times

**Files:**
- Modify: `src/db/sessions.ts:24-52` (`createSession`), `:128-145` (`getOrCreateSessionAt`)
- Modify: `src/db/seed.ts` (wherever it writes a `sessions` row)
- Modify: `src/modules/class/page.tsx:157-165` (`ensureSeance`), `:190-207` (`startSeance`)
- Test: `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SEANCE_MINUTES`, `hourOfDay` (Task 1); `Session.endsAt` (Task 2).
- Produces:
  - `createSession(db, classId, date, options: { subjectId?: string; startsAt: number; endsAt?: number }): Promise<Session>` — `endsAt` defaults to `startsAt + DEFAULT_SEANCE_MINUTES`
  - `getOrCreateSessionAt(db, classId, at: { date: number; startsAt: number; endsAt?: number; subjectId?: string }): Promise<Session>`
  - `setSessionTimes(db, sessionId: string, times: { startsAt: number; endsAt: number }): Promise<void>` — used by Task 6

- [ ] **Step 1: Write the failing tests**

Append to `src/db/sessions.test.ts`:

```ts
it("gives a created séance the default end when none is asked for", async () => {
  const session = await createSession(db, "c1", DAY, { startsAt: 480 });
  expect(session.startsAt).toBe(480);
  expect(session.endsAt).toBe(480 + DEFAULT_SEANCE_MINUTES);
});

it("keeps an end it was given", async () => {
  const session = await createSession(db, "c1", DAY, { startsAt: 480, endsAt: 600 });
  expect(session.endsAt).toBe(600);
});

it("reuses the séance already at that time rather than making a second", async () => {
  const first = await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
  const again = await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
  expect(again.id).toBe(first.id);
  expect(await db.sessions.where({ classId: "c1", date: DAY }).count()).toBe(1);
});

it("writes a second séance for a different hour of the same day", async () => {
  await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
  await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 660 });
  expect(await db.sessions.where({ classId: "c1", date: DAY }).count()).toBe(2);
});

it("setSessionTimes moves both ends", async () => {
  const session = await createSession(db, "c1", DAY, { startsAt: 480 });
  await setSessionTimes(db, session.id, { startsAt: 540, endsAt: 630 });
  const after = await db.sessions.get(session.id);
  expect(after?.startsAt).toBe(540);
  expect(after?.endsAt).toBe(630);
});
```

Add `DEFAULT_SEANCE_MINUTES` to the `@domain/seance` import and `setSessionTimes` to the `./sessions` import at the top of that test file. `DAY` is the local-midnight constant the file already defines — reuse it rather than adding another.

- [ ] **Step 2: Run to verify they fail**

```bash
yarn test src/db/sessions.test.ts
```

Expected: FAIL — `setSessionTimes is not a function`, and `endsAt` is `undefined`.

- [ ] **Step 3: Update `createSession`**

In `src/db/sessions.ts`, add `import { DEFAULT_SEANCE_MINUTES } from "@domain/seance";` and change the signature and body:

```ts
export async function createSession(
  db: AppDatabase,
  classId: string,
  date: number,
  options: { subjectId?: string; startsAt: number; endsAt?: number },
): Promise<Session> {
```

and inside, replace the conditional spread of `startsAt` with both times written unconditionally:

```ts
    startsAt: options.startsAt,
    endsAt: options.endsAt ?? options.startsAt + DEFAULT_SEANCE_MINUTES,
```

Leave the `createdAt` strictly-increasing logic exactly as it is — `getOrCreateSessionAt` still resolves ties by it.

- [ ] **Step 4: Update `getOrCreateSessionAt`**

```ts
export async function getOrCreateSessionAt(
  db: AppDatabase,
  classId: string,
  at: { date: number; startsAt: number; endsAt?: number; subjectId?: string },
): Promise<Session> {
  const date = startOfDay(at.date);
  return db.transaction("rw", db.sessions, async () => {
    const day = await db.sessions.where({ classId, date }).toArray();
    const existing = day.filter((s) => s.startsAt === at.startsAt);
    if (existing.length > 0) {
      return existing.reduce((latest, s) => (s.createdAt > latest.createdAt ? s : latest));
    }
    return createSession(db, classId, date, {
      ...(at.subjectId === undefined ? {} : { subjectId: at.subjectId }),
      startsAt: at.startsAt,
      ...(at.endsAt === undefined ? {} : { endsAt: at.endsAt }),
    });
  });
}
```

- [ ] **Step 5: Add `setSessionTimes`**

Beside `setSessionNote` in the same file:

```ts
/**
 * Move a séance's start, its end, or both.
 *
 * Both ends are written together because they are one fact: an end before its
 * start is not a lesson, and letting them move separately would make that
 * state reachable between two writes. The caller validates the order; this
 * records the result.
 */
export async function setSessionTimes(
  db: AppDatabase,
  sessionId: string,
  times: { startsAt: number; endsAt: number },
): Promise<void> {
  await db.sessions.update(sessionId, times);
}
```

- [ ] **Step 6: Update the seed**

`src/db/seed.ts` writes séances for the history it generates. Every one already knows the schedule entry it came from, so give it that entry's `startMinute` and `endMinute`:

```ts
startsAt: entry.startMinute,
endsAt: entry.endMinute,
```

Find each `sessions` write in that file and supply both. Do not invent a duration where the entry has one.

- [ ] **Step 7: Update the class page's two creation paths**

In `src/modules/class/page.tsx`, `ensureSeance` currently spreads `startsAt` conditionally. A slot always has a start after Task 4, but this task runs first, so use the slot's start when it has one and the current hour otherwise:

```ts
  const ensureSeance = useCallback(async (): Promise<string> => {
    if (slotSessionId !== null) return slotSessionId;
    const startsAt = slotStartsAt ?? hourOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, classId, {
      date: seanceDay,
      startsAt,
      ...(slotEndsAt === null || slotEndsAt === undefined ? {} : { endsAt: slotEndsAt }),
      ...(slotSubjectId === undefined ? {} : { subjectId: slotSubjectId }),
    });
    return session.id;
  }, [db, classId, slotSessionId, seanceDay, slotStartsAt, slotEndsAt, slotSubjectId]);
```

`slotEndsAt` does not exist yet — add it alongside the existing `slotStartsAt` derivation as `current?.endsAt ?? null`, typed `number | null`; Task 4 makes it a real value.

Then `startSeance`. Its old contract was "open the day's UNSCHEDULED séance, creating it only if the day has none", which existed because two untimed séances both answered to "no time" and the second would be unreachable. With times required that reasoning changes shape: a séance started now lands on the current hour, and `getOrCreateSessionAt` reuses one already there. Replace the body with:

```ts
  const startSeance = useCallback(async (): Promise<void> => {
    if (slotSessionId === null) {
      await ensureSeance();
      return;
    }
    const startsAt = hourOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, classId, { date: seanceDay, startsAt });
    selectSlot({
      date: session.date,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sessionId: session.id,
      entryId: null,
    });
  }, [db, classId, ensureSeance, slotSessionId, seanceDay, selectSlot]);
```

Import `hourOfDay` from `@domain/seance`. The `Slot` literal above gains `endsAt` in Task 4; if `typecheck` complains here before that task lands, leave the error — Task 4 closes it.

Update `canStart` where it is computed in the same file: it was "the day does not already hold both this séance and an unscheduled one". It becomes "this lesson is already recorded, and no séance sits on the current hour", which keeps the rule that a button which cannot do anything is worse than no button:

```ts
  const canStart =
    slotSessionId !== null && !daySessions.some((s) => s.startsAt === hourOfDay(Date.now()));
```

Use whatever the file already calls the day's séance list in place of `daySessions`.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
yarn test src/db/sessions.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
yarn format && yarn lint
git add src/db/sessions.ts src/db/sessions.test.ts src/db/seed.ts src/modules/class/page.tsx
git commit -m "feat(sessions): every creation path supplies both times

A séance started now lands on the current hour, and getOrCreateSessionAt
reuses one already there — so the old 'at most one unscheduled séance per
day' rule relaxes to one per hour, and the reason it existed (two untimed
séances both answering to 'no time', the second unreachable) is gone."
```

`typecheck` still fails against `src/domain/seance.ts` at this point. Task 4 is next.

---

### Task 4: `Slot` gains an end, and loses its untimed branch

**Files:**
- Modify: `src/domain/seance.ts` (`Slot`, `SessionLike`, `slotsForDay`, `resolveSlot`)
- Modify: `src/modules/class/page.tsx`, `src/modules/class/components/seance-strip.tsx` (callers)
- Test: `src/domain/seance.test.ts`

**Interfaces:**
- Consumes: `Session.startsAt: number`, `Session.endsAt: number` (Task 2).
- Produces:
  - `Slot { date: number; startsAt: number; endsAt: number; sessionId: string | null; entryId: string | null }`
  - `slotsForDay(sessions: readonly SessionLike[], entries: readonly EntryLike[], date: number): Slot[]` where `SessionLike` is `{ id, classId, startsAt: number, endsAt: number }` and `EntryLike` is `{ id, classId, startMinute: number, endMinute: number }`
  - `resolveSlot(slots: readonly Slot[], wanted: { startsAt: number } | null): Slot | null` — unchanged behaviour, narrower type

- [ ] **Step 1: Write the failing tests**

In `src/domain/seance.test.ts`, update the existing `slotsForDay` tests so every session fixture carries `startsAt` and `endsAt` and every entry carries `endMinute`, then **delete the tests covering the untimed-séance branch** — that behaviour no longer exists. Add:

```ts
it("gives a slot the entry's end when the timetable predicted it", () => {
  const slots = slotsForDay(
    [],
    [{ id: "e1", classId: "c1", startMinute: 600, endMinute: 655 }],
    DAY,
  );
  expect(slots).toEqual([
    { date: DAY, startsAt: 600, endsAt: 655, sessionId: null, entryId: "e1" },
  ]);
});

it("gives an unpaired séance its own stored end, not a guess", () => {
  const slots = slotsForDay(
    [{ id: "s1", classId: "c1", startsAt: 840, endsAt: 950 }],
    [],
    DAY,
  );
  expect(slots).toEqual([
    { date: DAY, startsAt: 840, endsAt: 950, sessionId: "s1", entryId: null },
  ]);
});

it("still pairs a séance only with a lesson of its own class", () => {
  // Two classes at one minute is legal, and Aujourd'hui reads every class at
  // once — so time alone would let one class's séance claim another's lesson.
  const slots = slotsForDay(
    [{ id: "s1", classId: "c2", startsAt: 600, endsAt: 655 }],
    [
      { id: "e1", classId: "c1", startMinute: 600, endMinute: 655 },
      { id: "e2", classId: "c2", startMinute: 600, endMinute: 655 },
    ],
    DAY,
  );
  expect(slots.find((s) => s.sessionId === "s1")?.entryId).toBe("e2");
  expect(slots).toHaveLength(2);
});

it("takes the séance's end over the entry's when a paired lesson ran long", () => {
  // The séance records what happened; the entry records what was intended.
  const slots = slotsForDay(
    [{ id: "s1", classId: "c1", startsAt: 600, endsAt: 720 }],
    [{ id: "e1", classId: "c1", startMinute: 600, endMinute: 655 }],
    DAY,
  );
  expect(slots).toEqual([
    { date: DAY, startsAt: 600, endsAt: 720, sessionId: "s1", entryId: "e1" },
  ]);
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
yarn test src/domain/seance.test.ts
```

Expected: FAIL — slots have no `endsAt`.

- [ ] **Step 3: Rewrite the types and `slotsForDay`**

In `src/domain/seance.ts`:

```ts
export interface Slot {
  date: number;
  /** Minutes from midnight. Every slot has one — see `Session.startsAt`. */
  startsAt: number;
  /** Minutes from midnight. What gives a block its height on the week grid. */
  endsAt: number;
  /** The séance, once something has been recorded against it. */
  sessionId: string | null;
  /** The timetable entry that predicted it, if any. */
  entryId: string | null;
}

interface SessionLike {
  id: string;
  classId: string;
  startsAt: number;
  endsAt: number;
}

interface EntryLike {
  id: string;
  classId: string;
  startMinute: number;
  endMinute: number;
}
```

Then in `slotsForDay`: delete the `if (session.startsAt === undefined) continue;` guard from the first pairing loop, and **delete the entire second loop** — the one commented "A séance with no time at all…" together with its comment. Nothing can match it now. Update the two map bodies and the sort:

```ts
  const slots: Slot[] = sessions.map((session) => {
    const entry = pairedEntry.get(session.id);
    return {
      date,
      // The séance's own times win over the entry's: the entry says what was
      // intended, the séance says what happened, and a lesson that ran long
      // must draw as long as it ran.
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sessionId: session.id,
      entryId: entry?.id ?? null,
    };
  });

  for (const entry of entries) {
    if (claimed.has(entry.id)) continue;
    slots.push({
      date,
      startsAt: entry.startMinute,
      endsAt: entry.endMinute,
      sessionId: null,
      entryId: entry.id,
    });
  }

  return slots.sort((a, b) => a.startsAt - b.startsAt);
}
```

Update the doc comment above `slotsForDay`: drop the paragraphs about untimed séances pairing and sorting last, and keep the own-class paragraph unchanged — it is the rule the week grid depends on.

Narrow `resolveSlot`'s parameter to `{ startsAt: number } | null`. Its body and its fallback are unchanged: a lesson moved to another hour still leaves older links naming a time nothing sits at, and the day's first slot is still a better answer than an empty screen.

- [ ] **Step 4: Fix the callers**

`src/modules/class/page.tsx`: `slotStartsAt` and `slotEndsAt` become plain `number | null` derived as `current?.startsAt ?? null` / `current?.endsAt ?? null`, and `selectSlot` drops its conditional on `target.startsAt === null`:

```ts
      Router.push("Class", {
        classId,
        date: String(target.date),
        at: String(target.startsAt),
      });
```

`src/modules/class/components/seance-strip.tsx`: the React key `` `${slot.date}-${slot.startsAt ?? "x"}` `` becomes `` `${slot.date}-${slot.startsAt}` ``, and any `slot.startsAt === null` branch in its `label` helper goes — every slot has a time to print. Keep the key anchored to the slot's day and time, never to its index.

- [ ] **Step 5: Run the whole suite**

```bash
yarn typecheck && yarn test
```

Expected: PASS, and `typecheck` is now clean for the first time since Task 2. Fix any remaining call sites `typecheck` names.

- [ ] **Step 6: Commit**

```bash
yarn format && yarn lint
git add src/domain/seance.ts src/domain/seance.test.ts src/modules/class
git commit -m "feat(seance): a slot has an end, and no untimed branch

slotsForDay's second pairing loop — and its careful qualifier that an untimed
séance pairs with its class's lesson only when it is that class's only séance
of the day — has nothing left to match once every séance carries a start.

A paired séance keeps its OWN times: the entry says what was intended, the
séance says what happened, and a lesson that ran long draws as long as it ran."
```

---

### Task 5: Backup format 12, accepting 11

**Files:**
- Modify: `src/db/backup.ts:29`, `:74`, `:190`
- Test: `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `backfillSeanceTimes` (Task 1).
- Produces: exports at format `12`; `parseBackup` accepts `11` and `12`.

- [ ] **Step 1: Write the failing tests**

```ts
it("accepts a version-11 file and gives its séances times", async () => {
  // Nothing in a v11 file is lost — the same backfill repairs it — so it is
  // accepted rather than refused. A v10 file is a different case: its journal
  // store no longer exists, and that is a loss no backfill can undo.
  const createdAt = new Date(2026, 8, 9, 14, 20, 0).getTime();
  const file = {
    ...(await exportWorkspace(db)),
    version: 11,
    sessions: [
      { id: "s1", classId: "c1", date: startOfDay(createdAt), createdAt },
    ],
  };
  const parsed = parseBackup(JSON.stringify(file));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.value.sessions[0].startsAt).toBe(14 * 60);
  expect(parsed.value.sessions[0].endsAt).toBe(14 * 60 + 55);
});

it("exports at version 12", async () => {
  expect((await exportWorkspace(db)).version).toBe(12);
});

it("still refuses a version-10 file", () => {
  const parsed = parseBackup(JSON.stringify({ version: 10 }));
  expect(parsed.ok).toBe(false);
});
```

Match the file's existing helpers for building and parsing a backup — read the top of `src/db/backup.test.ts` and reuse them rather than constructing a second way. If `parseBackup` returns something other than a `{ ok, value }` result, follow the shape that is actually there.

- [ ] **Step 2: Run to verify they fail**

```bash
yarn test src/db/backup.test.ts
```

Expected: FAIL — the export is still `11`, and a v11 file's séances have no `startsAt`.

- [ ] **Step 3: Implement**

In `src/db/backup.ts`: change the `version: 11` type literal (line 29) to `12`, and the `version: 11` written at export (line 190) to `12`.

Change the Zod schema (line 74) from `z.literal(11)` to `z.union([z.literal(11), z.literal(12)])`, and after the schema parses, map the sessions through the backfill before returning:

```ts
  // A v11 file's séances carry no times. The same function the v16 upgrade
  // uses repairs them — one implementation, two callers — so a v11 export
  // imports as a v12 workspace with every séance timed.
  const sessions = parsed.data.sessions.map((session) => ({
    ...session,
    ...backfillSeanceTimes(session),
  }));
```

and return that in place of `parsed.data.sessions`. Import `backfillSeanceTimes` from `@domain/seance`. Apply it unconditionally rather than branching on the version: a v12 file's séances are already timed, and `backfillSeanceTimes` returns those unchanged, so the branch would only be a second thing to keep right.

Make sure the session entry in the exported literal includes `endsAt` — the export builds an object per table by hand, and a field missing there survives every existing test, as `CLAUDE.md` records the journal store doing for a whole commit.

- [ ] **Step 4: Run to verify they pass**

```bash
yarn test src/db/backup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/db/backup.ts src/db/backup.test.ts
git commit -m "feat(backup): format 12, and a version-11 file is repaired not refused

Nothing in a v11 file is lost — the same backfill the v16 upgrade runs
repairs it — so refusing it whole, the way a v10 file is refused, would cost
a teacher last week's export for nothing. v10 stays refused: its journal
store no longer exists, and that is a loss no backfill can undo."
```

---

### Task 6: The séance strip edits both ends

**Files:**
- Modify: `src/modules/class/components/seance-strip.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `setSessionTimes` (Task 3), `Slot.startsAt` / `Slot.endsAt` (Task 4).
- Produces: no new exports. The editor is internal to the strip.

- [ ] **Step 1: Add the i18n keys**

Under the existing `seance` object in **both** locale files (the parity test fails the build if either is missing):

```jsonc
// fr.json
"editTimes": "Modifier l'horaire",
"startsAt": "Début",
"endsAt": "Fin",
"timesInvalid": "La fin doit suivre le début.",
"save": "Enregistrer",

// en.json
"editTimes": "Edit times",
"startsAt": "Start",
"endsAt": "End",
"timesInvalid": "The end must come after the start.",
"save": "Save",
```

Reuse `common.cancel` if the file already has it rather than adding a second cancel key.

- [ ] **Step 2: Render the current slot's range**

Beside the existing `ConfirmButton`, and only when `current !== null && currentSessionId !== null`, show the range using the `minutesToHm` the file already imports and the `formatTimeRange` in `@domain/schedule`:

```tsx
<span className="text-sm text-text-muted tabular-nums">
  {formatTimeRange(current.startsAt, current.endsAt, i18n.language)}
</span>
```

- [ ] **Step 3: Add the editor**

A `useState<boolean>` for whether the editor is open, plus two `useState<number>` for the draft times seeded from `current`. **Key the editor by `currentSessionId`** so switching séance resets the draft instead of carrying one lesson's times onto another — this is the same rule the pupil card's `key={student.id}` follows, and getting it wrong here writes one séance's times onto a different séance.

Two `<input type="time">` bound through `minutesToHm` / `hmToMinutes` from `@domain/schedule`, a save button, and a cancel. Save is **disabled** while `endsAt <= startsAt`, with `t("seance.timesInvalid")` shown beside it — refuse rather than silently correct, which is the same posture `parseGradeValue` takes for a bad mark. On save:

```ts
await setSessionTimes(db, currentSessionId, { startsAt: draftStart, endsAt: draftEnd });
setEditing(false);
```

No dialog: `ConfirmButton`'s modal is for destructive actions, and blocking browser dialogs are banned outright. An inline row is enough for a correction.

- [ ] **Step 4: Verify in the browser**

```bash
yarn dev   # port 3000
```

Open a class, pick a lesson in the strip, edit its end, and confirm: the range updates without a reload, the save button is disabled while the end precedes the start, switching to another séance in the strip shows that séance's times rather than the previous draft, and no console error appears.

- [ ] **Step 5: Commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/modules/class/components/seance-strip.tsx src/i18n/locales
git commit -m "feat(seance): the strip edits a séance's times

Where a séance is an object rather than a context, beside the delete that
already lives there. A lesson that ran long is noticed when it has run long,
and a séance the v16 backfill guessed at is corrected here.

Keyed by séance id: a draft must never carry one lesson's times onto another."
```

---

# Phase B — The dated week

### Task 7: `addDays`

**Files:**
- Modify: `src/domain/calendar.ts`
- Modify: `src/modules/diary/page.tsx` (its local `shift` collapses onto this)
- Test: `src/domain/calendar.test.ts`

**Interfaces:**
- Produces: `export function addDays(ms: number, n: number): number` — local midnight, `n` may be negative.

- [ ] **Step 1: Write the failing tests**

```ts
describe("addDays", () => {
  it("walks forward and back to the right calendar day", () => {
    const start = new Date(2026, 8, 9).getTime();
    expect(new Date(addDays(start, 7)).getDate()).toBe(16);
    expect(new Date(addDays(start, -7)).getDate()).toBe(2);
  });

  it("is identity for zero", () => {
    const start = new Date(2026, 8, 9).getTime();
    expect(addDays(start, 0)).toBe(start);
  });

  it("crosses a spring DST boundary without losing a day", () => {
    // Europe/Paris springs forward on 29 March 2026. Adding 7 × 86_400_000
    // lands an hour early and eventually a whole day out.
    const before = new Date(2026, 2, 26).getTime();
    const after = addDays(before, 7);
    expect(new Date(after).getDate()).toBe(2);
    expect(new Date(after).getMonth()).toBe(3);
    expect(new Date(after).getHours()).toBe(0);
  });

  it("crosses an autumn DST boundary without gaining one", () => {
    const before = new Date(2026, 9, 22).getTime();
    const after = addDays(before, 7);
    expect(new Date(after).getDate()).toBe(29);
    expect(new Date(after).getHours()).toBe(0);
  });

  it("crosses a year end", () => {
    const after = addDays(new Date(2026, 11, 29).getTime(), 5);
    expect(new Date(after).getFullYear()).toBe(2027);
    expect(new Date(after).getMonth()).toBe(0);
    expect(new Date(after).getDate()).toBe(3);
  });

  it("mirrors: forward then back returns to the start", () => {
    const start = new Date(2026, 2, 26).getTime();
    expect(addDays(addDays(start, 7), -7)).toBe(start);
  });
});
```

The DST tests assume the machine's zone observes European DST. If the suite already pins `TZ` (check `jest.config` / `jest.setup.js`), rely on that; if it does not, assert only the calendar date and the `0` hour, which hold in any zone that shifts on those dates.

- [ ] **Step 2: Run to verify they fail**

```bash
yarn test src/domain/calendar.test.ts
```

Expected: FAIL — `addDays is not a function`.

- [ ] **Step 3: Implement**

```ts
/**
 * `n` days from `ms`, at local midnight. `n` may be negative.
 *
 * Walks the calendar with `nextDay` / `previousDay` rather than adding
 * `n × 86_400_000`, for the reason `weekParity` and `monthGrid` do: that
 * offset slides an hour at each DST change and eventually a whole day, and a
 * week wrong by one is indistinguishable from a correct one.
 */
export function addDays(ms: number, n: number): number {
  let day = startOfDay(ms);
  for (let i = 0; i < Math.abs(n); i += 1) {
    day = n > 0 ? nextDay(day) : previousDay(day);
  }
  return day;
}
```

- [ ] **Step 4: Collapse the diary's copy**

In `src/modules/diary/page.tsx`, `shift` walks a week with its own seven-step loop. Replace that loop with `addDays(startOfIsoWeek(anchor), by > 0 ? 7 : -7)` and drop the now-unused `nextDay` / `previousDay` imports if nothing else in the file uses them.

- [ ] **Step 5: Run and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/calendar.ts src/domain/calendar.test.ts src/modules/diary/page.tsx
git commit -m "feat(calendar): addDays, walking the calendar

Third copy of the same seven-step loop. Adding n × 86_400_000 slides an hour
at each DST change and eventually a whole day, and a week wrong by one is
indistinguishable from a correct one."
```

---

### Task 8: `CalendarNav`

**Files:**
- Create: `src/modules/design-system/components/calendar-nav.tsx`
- Modify: `src/modules/diary/page.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Produces: `export function CalendarNav(props: { label: string; onPrevious: () => void; onNext: () => void; onToday: () => void }): JSX.Element`

- [ ] **Step 1: Move the i18n keys**

Move `previous`, `next` and `today` out of the `diary` object into a new top-level `calendar` object in **both** locale files. Their values do not change (`"Précédent"`, `"Suivant"`, `"Aujourd'hui"` / `"Previous"`, `"Next"`, `"Today"`). They belong to neither feature now, which is the reason attendance labels live under `attendance.*` rather than inside `gradebook`.

- [ ] **Step 2: Create the component**

```tsx
import { useTranslation } from "react-i18next";

/**
 * Previous / Aujourd'hui / next, and a label for the window they move.
 *
 * Purely presentational: it does not know whether it steps a day, a week or a
 * month, which is what lets the journal and the front door share it while
 * stepping differently. The label is composed by the caller for the same
 * reason `TimeGrid` takes its column headings rather than computing them.
 */
export function CalendarNav({
  label,
  onPrevious,
  onNext,
  onToday,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="btn" aria-label={t("calendar.previous")} onClick={onPrevious}>
          ‹
        </button>
        <button type="button" className="btn" onClick={onToday}>
          {t("calendar.today")}
        </button>
        <button type="button" className="btn" aria-label={t("calendar.next")} onClick={onNext}>
          ›
        </button>
      </div>
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}
```

- [ ] **Step 3: Use it in the diary**

In `src/modules/diary/page.tsx`, replace the inline `‹ / Aujourd'hui / ›` block and its window-label `<span>` with:

```tsx
<CalendarNav
  label={windowLabel(view, anchor, i18n.language)}
  onPrevious={() => setAnchor(shift(view, anchor, -1))}
  onNext={() => setAnchor(shift(view, anchor, 1))}
  onToday={() => setAnchor(startOfDay(Date.now()))}
/>
```

Keep the search input where it is; only the navigation moves.

- [ ] **Step 4: Verify and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
yarn dev   # open /classes/<id>/journal: the nav still walks weeks and months
git add src/modules/design-system/components/calendar-nav.tsx src/modules/diary/page.tsx src/i18n/locales
git commit -m "refactor(calendar): the journal's navigation becomes shared

Its three keys move to a top-level calendar.* — they belong to neither
feature now, the reason attendance labels are not inside gradebook."
```

---

### Task 9: `TimeGrid` stops knowing what a weekday is

**Files:**
- Create: `src/modules/design-system/components/time-grid.tsx` (moved)
- Delete: `src/modules/schedule/components/time-grid.tsx`
- Modify: `src/modules/schedule/page.tsx`

**Interfaces:**
- Produces:
  - `export interface GridColumn { key: string; label: string; today?: boolean }`
  - `export interface GridLesson { id: string; column: string; startMinute: number; endMinute: number; title: string; room?: string; cycle?: string; color?: string; href?: string; recorded?: boolean }`
  - `export function TimeGrid(props: { columns: GridColumn[]; lessons: GridLesson[]; selectedId?: string | null; onSelect?: (id: string) => void; now?: { column: string; minute: number } }): JSX.Element`

- [ ] **Step 1: Move the file**

```bash
git mv src/modules/schedule/components/time-grid.tsx src/modules/design-system/components/time-grid.tsx
```

Fix its relative imports — `@domain/schedule` and `@domain/timetable` are aliases and do not change.

- [ ] **Step 2: Generalise the interface**

Replace `GridLesson.weekday: number` with `column: string`, and add `href`, `recorded`. Add the `GridColumn` interface. Change the props: `days: number[]` becomes `columns: GridColumn[]`, `selectedId` and `onSelect` become optional, and `now` is added.

In the header row, replace `{t(\`schedule.day.${day}\`)}` with `{column.label}` and mark the current column:

```tsx
{columns.map((column) => (
  <h3
    key={column.key}
    className={`pb-1 font-medium text-sm ${column.today ? "text-accent" : "text-text-muted"}`}
  >
    {column.label}
  </h3>
))}
```

`layoutDay(lessons.filter((lesson) => lesson.weekday === day))` becomes `layoutDay(lessons.filter((lesson) => lesson.column === column.key))`.

Leave `gridWindow`, the `--hour` clamp, `--grid-height`, the gutter's sized `3.5rem` column and the hour-line gradient **exactly as they are**. The window is still computed from every lesson passed in, not from the columns drawn — switching the phone's day must not slide the grid.

- [ ] **Step 3: Make the block a link or a button**

Extract the block's `style` and `className` into locals so both branches share them verbatim, then:

```tsx
return entry.href === undefined ? (
  <button
    key={entry.id}
    type="button"
    onClick={() => onSelect?.(entry.id)}
    aria-label={t("schedule.editLesson", { lesson: description })}
    title={description}
    className={blockClass}
    style={blockStyle}
  >
    {blockBody}
  </button>
) : (
  // A real Link, not a click handler on a div: a div takes no focus and
  // Enter does not fire on it. Same rule DataTable follows for a row.
  <Link key={entry.id} to={entry.href} aria-label={description} title={description} className={blockClass} style={blockStyle}>
    {blockBody}
  </Link>
);
```

Import `Link` from `@swan-io/chicane` — never a raw `<a href>`, which causes a full page reload.

Add the recorded dot inside `blockBody`, after the title:

```tsx
{entry.recorded && (
  <span className="text-recorded" aria-hidden="true">●</span>
)}
{entry.recorded && <span className="sr-only">{t("today.recorded")}</span>}
```

Add `today.recorded` to both locale files (`"Séance enregistrée"` / `"Lesson recorded"`). Use an existing colour token for the dot rather than inventing one — check `global.css` for what is available and pick the nearest, or reuse `var(--color-accent)` if there is no success colour.

- [ ] **Step 4: Draw the now line**

Inside the per-column `<div>`, after the blocks:

```tsx
{now !== undefined && now.column === column.key && now.minute >= start && now.minute <= end && (
  <div
    className="pointer-events-none absolute inset-x-0 border-danger border-t-2"
    style={{ top: `calc(${(now.minute - start) / 60} * var(--hour))` }}
    aria-hidden="true"
  />
)}
```

Positioned off the same `--hour` and the same `start` as every block, so it cannot drift from them. `aria-hidden` because it says nothing a screen reader user cannot get from the clock. Use whatever danger/accent colour token the app already has.

- [ ] **Step 5: Update `/schedule`**

In `src/modules/schedule/page.tsx`, change the import path, build `columns` from the weekdays it already computes, and set `column` instead of `weekday`:

```tsx
const columns: GridColumn[] = days.map((day) => ({
  key: String(day),
  label: t(`schedule.day.${day}`),
  today: day === today,
}));
```

and in the `lessons` map, `column: String(entry.weekday)` in place of `weekday: entry.weekday`. On the narrow branch pass `columns.filter((c) => c.key === String(shownDay))`. Do not pass `href` — the editor needs buttons — and do not pass `now`.

- [ ] **Step 6: Verify in the browser**

```bash
yarn dev
```

Open `/schedule` and confirm nothing regressed: blocks still open the form, the A/B badges still draw, the day picker still works below `lg`, overlapping A and B lessons still split the column, and the hour labels still line up with the lines.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/modules/design-system/components/time-grid.tsx src/modules/schedule src/i18n/locales
git commit -m "refactor(timetable): the grid takes columns, not weekdays

It already took resolved text rather than rows; this extends that decision
rather than introducing one. A block is a Link or a button depending on href,
because the editor opens a form without navigating and the week needs a real
link that takes focus."
```

---

### Task 10: `/` becomes the dated week

**Files:**
- Modify: `src/router.ts:15` (`Home`)
- Modify: `src/app.tsx` (pass `date` through)
- Modify: `src/modules/today/page.tsx` (rewritten — but see the note on `InstallInvitation` in Step 5)
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `addDays` (7), `CalendarNav` (8), `TimeGrid` / `GridColumn` / `GridLesson` (9), `Slot` with `endsAt` (4), `InstallInvitation` from `../shared/components/install-invitation` (already on `main`).
- Produces: `export function TodayPage(props: { date?: string }): JSX.Element`

- [ ] **Step 1: Route and wiring**

`src/router.ts`: `Home: "/"` becomes `Home: "/?:date"`, with a comment saying the param names a **day** and the width decides whether its day or its week is drawn.

`src/app.tsx`: `case "Home": return <TodayPage date={route.params.date} />;`

- [ ] **Step 2: Resolve the anchor**

At the top of `TodayPage`:

```tsx
const wide = useMediaQuery("(min-width: 1024px)");
// Resolve-or-ignore: a URL can name a day that no longer parses — hand-edited,
// or truncated by a chat client — and the front door must never open on NaN.
const parsed = date === undefined ? Number.NaN : Number(date);
const anchor = Number.isFinite(parsed) ? startOfDay(parsed) : startOfDay(Date.now());
const days = wide ? weekDays(anchor) : [anchor];
const from = days[0];
const to = days[days.length - 1];
```

Navigation, always `replace` — walking to next week is a change of view, not a navigation, and a `push` per tap makes Back crawl backwards one week at a time:

```tsx
const step = (by: number): void =>
  Router.replace("Home", { date: String(addDays(anchor, wide ? by * 7 : by)) });
// Aujourd'hui clears the param rather than writing today's date into it: it
// keeps the common URL clean and makes the button's meaning exact.
const goToday = (): void => Router.replace("Home", {});
```

- [ ] **Step 3: Load the data**

```tsx
const data = useLiveQuery(async () => {
  const [entries, classes, subjects, sessions] = await Promise.all([
    db.scheduleEntries.toArray(),
    db.classes.toArray(),
    db.subjects.toArray(),
    sessionsInRange(db, from, to),
  ]);
  return { entries, classes, subjects, sessions };
}, [db, from, to]);
```

`db` must be in the dependency array — a live query that forgets it keeps rendering the previous school's data after a workspace switch.

- [ ] **Step 4: Build the columns and lessons**

```tsx
const today = startOfDay(Date.now());
const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" });

// Monday to Friday always; Saturday and Sunday earn a column only when that
// DATE carries something — a Saturday make-up lesson is a fact about the 12th,
// not about Saturdays.
const perDay = days.map((day) => {
  const scheduled = entriesForDay(data.entries, termStart, day);
  const daySessions = data.sessions.filter((s) => s.date === day);
  return { day, slots: slotsForDay(daySessions, scheduled, day), scheduled };
});
const shown = perDay.filter(
  ({ day, slots }) => isoWeekday(day) <= 5 || slots.length > 0,
);

const columns: GridColumn[] = shown.map(({ day }) => ({
  key: String(day),
  label: dayLabel.format(new Date(day)),
  today: day === today,
}));

const lessons: GridLesson[] = shown.flatMap(({ day, slots, scheduled }) =>
  slots.map((slot) => {
    const entry = scheduled.find((e) => e.id === slot.entryId);
    const session = data.sessions.find((s) => s.id === slot.sessionId);
    const classId = entry?.classId ?? session?.classId ?? "";
    return {
      id: `${day}-${slot.startsAt}-${classId}`,
      column: String(day),
      startMinute: slot.startsAt,
      endMinute: slot.endsAt,
      title: className(classId),
      ...(roomName(entry?.roomId) ? { room: roomName(entry.roomId) } : {}),
      ...(subjectColor(entry?.subjectId) ? { color: subjectColor(entry.subjectId) } : {}),
      ...(slot.sessionId === null ? {} : { recorded: true }),
      href: Router.Class({ classId, date: String(day), at: String(slot.startsAt) }),
    };
  }),
);
```

`className`, `subjectColor` and `roomName` are the same resolvers the old TodayPage had — keep them. `roomName` comes from the `useRoomNames()` hook the page already uses. The block `id` is composed from the slot's own identity (day, time, class), never from an index: a slot with no séance has no id of its own, and a positional key would retarget the selection when the list reorders.

- [ ] **Step 5: Render**

```tsx
<div className="flex flex-col gap-4">
  <CalendarNav
    label={windowLabel}
    onPrevious={() => step(-1)}
    onNext={() => step(1)}
    onToday={goToday}
  />
  {lessons.length === 0 ? (
    <EmptyToday hasEntries={data.entries.length > 0} termStart={termStart} />
  ) : (
    <TimeGrid
      columns={columns}
      lessons={lessons}
      now={{ column: String(today), minute: nowMinute }}
    />
  )}
</div>
```

`windowLabel` is `7 – 11 septembre 2026` on wide (an `Intl.DateTimeFormat` range over `days[0]` and the last shown day) and the full date on narrow. `nowMinute` is `new Date().getHours() * 60 + new Date().getMinutes()`.

Keep `EmptyToday` exactly as it is — it is already three correct directions rather than decoration. Change only its "nothing today" string to a "nothing this week" one when `wide`, adding `today.nothingThisWeek` to both locale files.

**Keep `<InstallInvitation />` as the last child of the page**, below the grid and below the empty state, exactly where it sits now:

```tsx
  {/* Last on the front door, and usually nothing at all: it renders only
      in a browser that can actually install, and only until the teacher
      has installed or said "plus tard" once. */}
  <InstallInvitation />
```

It arrived on `main` after this plan was written and is easy to delete by accident, since this task rewrites the file around it. It is outside the `lessons.length === 0` branch — it shows on a full week and an empty one alike.

- [ ] **Step 6: Verify in the browser**

```bash
yarn dev
```

Walk all seven flows:

1. `/` opens on this week, today's column marked, a now line in it.
2. `‹` / `›` step a week at ≥1024px and a day below it; the URL gains `?date=` and Back leaves the page rather than walking weeks.
3. `Aujourd'hui` returns to a bare `/`.
4. A block opens the right class at the right slot.
5. A lesson already recorded shows its dot and appears **once**, not twice.
6. `/?date=nonsense` opens on today.
7. `/schedule` still edits.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/router.ts src/app.tsx src/modules/today src/i18n/locales
git commit -m "feat(today): the front door is the week that is happening

Equal-sized cards made a fifty-five minute lesson and a two-hour gap look
alike — the argument that turned /schedule into an hour grid, applying with
more force to the screen opened every morning.

?date names a DAY, and the width decides whether its day or its week is
drawn, so the narrow branch is the same screen showing less of itself rather
than a second URL."
```

---

### Task 11: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-09-profs-dated-week-home-design.md` (status line)

- [ ] **Step 1: Update `CLAUDE.md`**

Six passages, all of which are now wrong:

1. **"The schedule predicts; it never pre-creates"** — the sentence describing a séance carrying no time ("A séance carrying no time at all is one recorded before séances carried one; it pairs with its class's lesson, and only when it is that class's only séance of the day") is gone. Replace it with the new rule: a séance carries a start and an end, copied from its lesson or floored from the clock, and `slotsForDay` has one pairing pass rather than two.
2. **`Session.startsAt`** — the paragraph describing it as optional becomes a description of two required fields, keeping the "not a foreign key into the timetable" argument, which still holds and now covers `endsAt`.
3. **"Schema changes are disposable, not migrated"** — add the exception this work established: the rule stands for changes that ADD a table or a field, and does not cover a field becoming required underneath rows that carry dependents. Name `db.version(16)` as the first `upgrade()` and say why dropping `sessions` was refused.
4. **The backup format** — 11 becomes 12, and record that a v11 file is accepted through the shared backfill while v10 stays refused.
5. **"The timetable is drawn as hours"** — note that `TimeGrid` now lives in `design-system/components/`, takes columns rather than weekdays, and draws a `<Link>` or a `<button>` depending on `href`.
6. **A new short section for `/`** — the dated week, the `?date` day-not-week rule, `replace` never `push`, and the ruling that it is a signpost: no note is written there, deliberately.

Also delete the "Known gaps" line about `/diary` if the earlier journal work left one, and check that nothing still describes Today as a list of cards.

- [ ] **Step 2: Flip the spec's status**

Change `Status: designed, not yet implemented.` to `Status: implemented.` at the top of the spec.

- [ ] **Step 3: Final gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add CLAUDE.md docs/superpowers/specs
git commit -m "docs: the front door is a dated week, and a séance has times

Records the exception this work established: the disposable-schema rule
stands for changes that add a table or a field, and does not cover a field
becoming required underneath rows that carry dependents."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the ruling and its backfill → 1–3; the backup → 5; the strip's editor → 6; `addDays` → 7; the shared navigation → 8; the shared grid → 9; routes, data and the page → 10; the regression test → 2; documentation → 11. The spec's "Out of Scope" items are absent from every task, as intended.

**Known deviation from the spec, flagged rather than hidden.** The spec says an unpaired séance "draws its own stored times". Task 4 goes slightly further: a séance that IS paired with an entry also draws its own times rather than the entry's, so a lesson that ran long draws as long as it ran. This follows from `endsAt` being editable (Task 6) — if the entry won, editing a paired séance's end would do nothing visible on `/`. Worth a nod from the reviewer.

**Type consistency.** `Slot` gains `endsAt` in Task 4 and is consumed with that shape in Tasks 6 and 10. `GridLesson.column` is a `string` everywhere — `String(day)` on `/`, `String(entry.weekday)` on `/schedule` — and `GridColumn.key` matches it in both. `backfillSeanceTimes` has one signature, used identically in Tasks 2 and 5. `getOrCreateSessionAt` takes a required `startsAt` from Task 3 onward, and both of the class page's call sites are updated in that same task.

**Ordering.** `typecheck` is knowingly red from Task 2 Step 5 until Task 4 Step 5; each of those tasks says so. No other task leaves the gate failing.
