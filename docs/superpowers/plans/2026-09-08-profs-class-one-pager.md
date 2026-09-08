# The class as one page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-tab class page with one page holding the séance — seating and register, its note, and access to the carnets — and move notes from the day onto the séance.

**Architecture:** A `Session` becomes a slot rather than a fact: it gains a `startsAt` and a `note`, and writing a note creates it. Slot resolution is a pure domain function over sessions plus scheduled entries; the class page reads a slot from the URL, falls back to today or the last taught, and renders the plan (or a roster register when the class has no salle). `diaryEntries` is dropped and the journal reads sessions instead.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), Chicane router, i18next, Jest + fake-indexeddb, Biome, rspack.

**Spec:** `docs/superpowers/specs/2026-09-08-profs-class-one-pager-design.md`

## Global Constraints

- **Node is not on the default PATH.** Every command below assumes
  `export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"` has been run in the shell first, or it fails with `command not found`.
- **Validation gate — all four green before any task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.
- **No network of any kind.** No `fetch`, no CDN font, no analytics. This is a documented product promise.
- **i18n:** every user-visible string goes through `t()`, and every key must exist in BOTH `src/i18n/locales/fr.json` and `en.json`. A parity test fails the build otherwise. Plurals use `_one` / `_other`.
- **No `window.confirm`, `alert`, `beforeunload`, or any blocking browser dialog.** Destructive actions use `ConfirmButton`, which opens a `Modal`.
- **Times are minutes from midnight, never `"10:05"`.** Dates are epoch-ms at `startOfDay`.
- **IDs come from `crypto.randomUUID()`; timestamps from `Date.now()`.**
- **State bound to a record is anchored to that record's id, never to its position.**
- **Pupil names render through `PupilName`**, surname first, capitals via CSS.
- **Domain (`src/domain/`) is pure**: no React, no Dexie, no I/O.
- **Schema changes are disposable**: bump a version, write no upgrade function.

---

### Task 1: A séance carries its time and its note

**Files:**
- Modify: `src/db/types.ts` (the `Session` interface)
- Modify: `src/db/sessions.ts`
- Test: `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `Session.startsAt?: number` — minutes from midnight, absent when unscheduled.
  - `Session.note?: string` — absent when there is no note.
  - `createSession(db, classId, date, options?: { subjectId?: string; startsAt?: number }): Promise<Session>`
  - `setSessionNote(db: AppDatabase, sessionId: string, note: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `src/db/sessions.test.ts`:

```ts
describe("setSessionNote", () => {
  it("writes the note onto the séance", async () => {
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "Théorème de Pythagore");
    expect((await db.sessions.get(session.id))?.note).toBe("Théorème de Pythagore");
  });

  it("trims it", async () => {
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "  Pythagore  ");
    expect((await db.sessions.get(session.id))?.note).toBe("Pythagore");
  });

  /**
   * Cleared, never emptied. A séance with `note: ""` is the husk `writeGrade`
   * refuses for a grade: it survives export, and makes "does this lesson have
   * a note?" answer yes for a lesson that has none.
   */
  it("removes the field when the text is blank", async () => {
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "Pythagore");
    await setSessionNote(db, session.id, "   ");
    const after = await db.sessions.get(session.id);
    expect(after).toBeDefined();
    expect("note" in (after ?? {})).toBe(false);
  });

  it("ignores a séance that no longer exists", async () => {
    await expect(setSessionNote(db, "gone", "x")).resolves.toBeUndefined();
  });
});

describe("createSession with a time", () => {
  it("keeps the start time it was given", async () => {
    const date = startOfDay(Date.now());
    const session = await createSession(db, "c1", date, { startsAt: 600 });
    expect(session.startsAt).toBe(600);
  });

  it("leaves it absent for an unscheduled séance", async () => {
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    expect("startsAt" in session).toBe(false);
  });
});
```

Add `setSessionNote` to the import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/db/sessions.test.ts`
Expected: FAIL — `setSessionNote is not a function`.

- [ ] **Step 3: Add the fields**

In `src/db/types.ts`, inside `export interface Session`, after `date`:

```ts
  /**
   * Minutes from midnight, when the lesson has a time. Absent for an
   * unscheduled séance — a cover lesson, a catch-up.
   *
   * This records WHEN THIS LESSON WAS; it is not a foreign key into the
   * timetable. A lesson moved to another hour next term leaves every past
   * séance holding the time it actually happened at.
   */
  startsAt?: number;
  /** What was done in this lesson. Free text, written and read whole. */
  note?: string;
```

- [ ] **Step 4: Implement the writes**

In `src/db/sessions.ts`, widen `createSession` to accept a time. Its current
signature takes `(db, classId, date, subjectId?)`; replace the trailing
argument with an options object and update the one call site inside
`getOrCreateTodaySession`:

```ts
export async function createSession(
  db: AppDatabase,
  classId: string,
  date: number,
  options: { subjectId?: string; startsAt?: number } = {},
): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(options.subjectId === undefined ? {} : { subjectId: options.subjectId }),
    ...(options.startsAt === undefined ? {} : { startsAt: options.startsAt }),
    date: startOfDay(date),
    createdAt: Date.now(),
  };
  await db.sessions.add(session);
  return session;
}
```

Then append:

```ts
/**
 * What was done in this lesson.
 *
 * Blank text CLEARS the field rather than storing an empty string — the same
 * rule `writeGrade` applies to a grade with neither value nor note. A husk
 * survives every export and makes "does this séance have a note?" answer yes
 * for a lesson that has none.
 */
export async function setSessionNote(
  db: AppDatabase,
  sessionId: string,
  note: string,
): Promise<void> {
  const text = note.trim();
  if (text === "") {
    // `delete` is Dexie's own sentinel for removing a key in an update.
    await db.sessions.update(sessionId, { note: undefined });
    return;
  }
  await db.sessions.update(sessionId, { note: text });
}
```

If `update` with `undefined` leaves the key present under the installed Dexie
version, read the row, `delete` the property and `put` it back inside a
transaction — the test in Step 1 is what decides which is needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test src/db/sessions.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/db/types.ts src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat(db): a séance carries the time it happened and what was done"
```

---

### Task 2: Finding and creating a séance by slot

**Files:**
- Modify: `src/db/sessions.ts`
- Test: `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `createSession`, `Session.startsAt` from Task 1.
- Produces:
  - `sessionsForDay(db, classId, date): Promise<Session[]>` — that day's séances, earliest first, untimed last.
  - `getOrCreateSessionAt(db, classId, at: { date: number; startsAt?: number; subjectId?: string }): Promise<Session>`

- [ ] **Step 1: Write the failing tests**

Append to `src/db/sessions.test.ts`:

```ts
describe("sessionsForDay", () => {
  it("returns the day's séances earliest first, untimed last", async () => {
    const date = startOfDay(Date.now());
    await createSession(db, "c1", date, { startsAt: 840 });
    await createSession(db, "c1", date, { startsAt: 600 });
    await createSession(db, "c1", date);
    await createSession(db, "c2", date, { startsAt: 60 });

    const day = await sessionsForDay(db, "c1", date);
    expect(day.map((s) => s.startsAt)).toEqual([600, 840, undefined]);
  });
});

describe("getOrCreateSessionAt", () => {
  it("creates the séance for a slot that has none", async () => {
    const date = startOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    expect(session.startsAt).toBe(600);
    expect(await db.sessions.count()).toBe(1);
  });

  it("returns the existing séance for that slot", async () => {
    const date = startOfDay(Date.now());
    const first = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const again = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    expect(again.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
  });

  /**
   * The whole reason `startsAt` exists: two lessons on one day are two
   * séances, each with its own register and its own note.
   */
  it("keeps two lessons on one day apart", async () => {
    const date = startOfDay(Date.now());
    const morning = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const afternoon = await getOrCreateSessionAt(db, "c1", { date, startsAt: 840 });
    expect(afternoon.id).not.toBe(morning.id);
    expect(await db.sessions.count()).toBe(2);
  });

  it("treats an unscheduled séance as its own slot", async () => {
    const date = startOfDay(Date.now());
    const timed = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const untimed = await getOrCreateSessionAt(db, "c1", { date });
    expect(untimed.id).not.toBe(timed.id);
    expect(untimed.startsAt).toBeUndefined();
  });

  /**
   * Read and write inside ONE transaction. React StrictMode double-invokes
   * effects, and a read-then-write outside a transaction let both reads run
   * before either write — which is how the plan page once created two
   * sessions for one lesson.
   */
  it("creates one séance when called twice at once", async () => {
    const date = startOfDay(Date.now());
    const [a, b] = await Promise.all([
      getOrCreateSessionAt(db, "c1", { date, startsAt: 600 }),
      getOrCreateSessionAt(db, "c1", { date, startsAt: 600 }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.sessions.count()).toBe(1);
  });
});
```

Add `sessionsForDay` and `getOrCreateSessionAt` to the import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/db/sessions.test.ts`
Expected: FAIL — `sessionsForDay is not a function`.

- [ ] **Step 3: Implement both**

In `src/db/sessions.ts`:

```ts
/**
 * A class's séances on one day, earliest first.
 *
 * An unscheduled séance has no time and sorts last: it has nothing to sort
 * by, and a teacher reads a day as a clock.
 */
export async function sessionsForDay(
  db: AppDatabase,
  classId: string,
  date: number,
): Promise<Session[]> {
  const day = await db.sessions.where({ classId, date: startOfDay(date) }).toArray();
  return day.sort((a, b) => {
    if (a.startsAt === b.startsAt) return a.createdAt - b.createdAt;
    if (a.startsAt === undefined) return 1;
    if (b.startsAt === undefined) return -1;
    return a.startsAt - b.startsAt;
  });
}

/**
 * The séance for one slot, created if absent.
 *
 * A slot is a class, a day, and — when the lesson has one — a start time.
 * Two lessons on one day are two slots and therefore two séances, each with
 * its own register and its own note.
 *
 * Read and write inside ONE transaction: StrictMode's double-invoked effects
 * ran both reads before either write and produced two sessions for one lesson.
 */
export async function getOrCreateSessionAt(
  db: AppDatabase,
  classId: string,
  at: { date: number; startsAt?: number; subjectId?: string },
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
      ...(at.startsAt === undefined ? {} : { startsAt: at.startsAt }),
    });
  });
}
```

Leave `getOrCreateTodaySession` in place for now; Task 7 removes its last caller.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/db/sessions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/db/sessions.ts src/db/sessions.test.ts
git commit -m "feat(db): a séance belongs to a slot, and a day may hold two"
```

---

### Task 3: Slots, as a pure domain

**Files:**
- Create: `src/domain/seance.ts`
- Create: `src/domain/seance.test.ts`

**Interfaces:**
- Consumes: `ScheduleEntryLike` and `entriesForDate` from `src/domain/schedule.ts`; `Session` shape from Task 1 (structurally, not by import — the domain imports no db types).
- Produces:
  - `interface Slot { date: number; startsAt: number | null; sessionId: string | null; entryId: string | null }`
  - `slotsForDay(sessions, entries, date): Slot[]`
  - `resolveSlot(slots, wanted: { startsAt: number | null } | null): Slot | null`

- [ ] **Step 1: Write the failing tests**

Create `src/domain/seance.test.ts`:

```ts
import { resolveSlot, type Slot, slotsForDay } from "./seance";

const DAY = 1_757_289_600_000; // an arbitrary startOfDay

const session = (id: string, startsAt?: number) => ({
  id,
  classId: "c1",
  date: DAY,
  createdAt: 1,
  ...(startsAt === undefined ? {} : { startsAt }),
});
const entry = (id: string, startMinute: number) => ({
  id,
  classId: "c1",
  weekday: 1,
  startMinute,
  endMinute: startMinute + 55,
  weekCycle: "all" as const,
});

describe("slotsForDay", () => {
  it("pairs a séance with the lesson it was taught at", () => {
    const slots = slotsForDay([session("s1", 600)], [entry("e1", 600)], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" }]);
  });

  /**
   * The timetable predicts. A lesson with no séance is still a slot — that is
   * what lets a teacher open it and write next week's plan.
   */
  it("keeps a scheduled lesson that has no séance", () => {
    const slots = slotsForDay([], [entry("e1", 600)], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: 600, sessionId: null, entryId: "e1" }]);
  });

  it("keeps a séance no lesson predicted", () => {
    const slots = slotsForDay([session("s1")], [], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: null, sessionId: "s1", entryId: null }]);
  });

  it("orders by time, untimed last", () => {
    const slots = slotsForDay(
      [session("s1"), session("s2", 840)],
      [entry("e1", 600)],
      DAY,
    );
    expect(slots.map((s) => s.startsAt)).toEqual([600, 840, null]);
  });

  it("does not pair two séances with one lesson", () => {
    const slots = slotsForDay([session("s1", 600), session("s2", 600)], [entry("e1", 600)], DAY);
    expect(slots).toHaveLength(2);
    expect(slots.filter((s) => s.entryId === "e1")).toHaveLength(1);
  });
});

describe("resolveSlot", () => {
  const slots: Slot[] = [
    { date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" },
    { date: DAY, startsAt: 840, sessionId: null, entryId: "e2" },
  ];

  it("finds the slot at the time asked for", () => {
    expect(resolveSlot(slots, { startsAt: 840 })?.entryId).toBe("e2");
  });

  /**
   * A lesson moved from 10h to 11h leaves older links naming a time nothing
   * sits at. Falling back to the day's first séance beats an empty screen.
   */
  it("falls back to the day's first slot when the time matches nothing", () => {
    expect(resolveSlot(slots, { startsAt: 1200 })?.startsAt).toBe(600);
  });

  it("takes the day's first slot when no time is asked for", () => {
    expect(resolveSlot(slots, null)?.startsAt).toBe(600);
  });

  it("finds an untimed slot when one is asked for", () => {
    const withUntimed = [...slots, { date: DAY, startsAt: null, sessionId: "s3", entryId: null }];
    expect(resolveSlot(withUntimed, { startsAt: null })?.sessionId).toBe("s3");
  });

  it("gives nothing for a day with nothing on it", () => {
    expect(resolveSlot([], { startsAt: 600 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/domain/seance.test.ts`
Expected: FAIL — cannot find module `./seance`.

- [ ] **Step 3: Implement the domain**

Create `src/domain/seance.ts`:

```ts
/**
 * A slot: a lesson that is scheduled, taught, or merely prepared.
 *
 * The timetable predicts and never pre-creates, so a lesson exists on screen
 * before any row exists in the database. A slot is that lesson — the pairing
 * of what the timetable expects with what was actually recorded — and it is
 * what a link names and what the séance strip lists.
 */
export interface Slot {
  date: number;
  /** Minutes from midnight, or null for an unscheduled séance. */
  startsAt: number | null;
  /** The séance, once something has been recorded against it. */
  sessionId: string | null;
  /** The timetable entry that predicted it, if any. */
  entryId: string | null;
}

interface SessionLike {
  id: string;
  startsAt?: number;
}

interface EntryLike {
  id: string;
  startMinute: number;
}

/**
 * Every slot on one day, earliest first.
 *
 * A séance is paired with a scheduled lesson by TIME, not by class. Today's
 * page pairs by class and accepts being wrong when a class is taught twice in
 * a day; with `startsAt` that compromise is no longer needed.
 *
 * An untimed séance sorts last: it has nothing to sort by.
 */
export function slotsForDay(
  sessions: readonly SessionLike[],
  entries: readonly EntryLike[],
  date: number,
): Slot[] {
  const claimed = new Set<string>();
  const slots: Slot[] = sessions.map((session) => {
    const entry =
      session.startsAt === undefined
        ? undefined
        : entries.find((e) => e.startMinute === session.startsAt && !claimed.has(e.id));
    if (entry) claimed.add(entry.id);
    return {
      date,
      startsAt: session.startsAt ?? null,
      sessionId: session.id,
      entryId: entry?.id ?? null,
    };
  });

  for (const entry of entries) {
    if (claimed.has(entry.id)) continue;
    slots.push({ date, startsAt: entry.startMinute, sessionId: null, entryId: entry.id });
  }

  return slots.sort((a, b) => {
    if (a.startsAt === b.startsAt) return 0;
    if (a.startsAt === null) return 1;
    if (b.startsAt === null) return -1;
    return a.startsAt - b.startsAt;
  });
}

/**
 * The slot a link asked for, or the day's first.
 *
 * The fallback is the point: a lesson moved to another hour leaves older
 * links naming a time nothing sits at, and an empty screen is a worse answer
 * than the day's first lesson.
 */
export function resolveSlot(
  slots: readonly Slot[],
  wanted: { startsAt: number | null } | null,
): Slot | null {
  if (slots.length === 0) return null;
  if (wanted === null) return slots[0];
  return slots.find((slot) => slot.startsAt === wanted.startsAt) ?? slots[0];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/domain/seance.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/domain/seance.ts src/domain/seance.test.ts
git commit -m "feat(domain): a slot is a lesson scheduled, taught or prepared"
```

---

### Task 4: The journal reads séances

**Files:**
- Modify: `src/modules/diary/page.tsx`
- Modify: `src/modules/diary/components/day-entry.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`
- Modify: `src/db/sessions.ts` (a range read)
- Test: `src/db/sessions.test.ts`

**Interfaces:**
- Consumes: `setSessionNote`, `sessionsForDay` (Tasks 1–2).
- Produces: `sessionsInRange(db, from: number, to: number): Promise<Session[]>` — every class, newest day first.

This task leaves `diaryEntries` in the database, unused. Task 5 drops it. Splitting
that way keeps every commit building.

- [ ] **Step 1: Write the failing test**

Append to `src/db/sessions.test.ts`:

```ts
describe("sessionsInRange", () => {
  it("returns every class's séances in the window, newest day first", async () => {
    const day = 86_400_000;
    const today = startOfDay(Date.now());
    await createSession(db, "c1", today, { startsAt: 600 });
    await createSession(db, "c2", today, { startsAt: 840 });
    await createSession(db, "c1", today - day);
    await createSession(db, "c1", today - 30 * day);

    const range = await sessionsInRange(db, today - day, today);
    expect(range).toHaveLength(3);
    expect(range[0].date).toBe(today);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/db/sessions.test.ts -t "sessionsInRange"`
Expected: FAIL — `sessionsInRange is not a function`.

- [ ] **Step 3: Implement the range read**

In `src/db/sessions.ts`:

```ts
/**
 * Every class's séances between two days, newest day first and earliest
 * lesson first within a day — the order the journal reads them in.
 */
export async function sessionsInRange(
  db: AppDatabase,
  from: number,
  to: number,
): Promise<Session[]> {
  const rows = await db.sessions
    .where("date")
    .between(startOfDay(from), startOfDay(to), true, true)
    .toArray();
  return rows.sort(
    (a, b) => b.date - a.date || (a.startsAt ?? Number.MAX_SAFE_INTEGER) - (b.startsAt ?? Number.MAX_SAFE_INTEGER),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn test src/db/sessions.test.ts -t "sessionsInRange"`
Expected: PASS.

- [ ] **Step 5: Rewrite the journal around séances**

`day-entry.tsx` currently takes `classId` and `date` and calls `setDiaryEntry`
on blur. Change its props to a séance and call `setSessionNote`, keeping the
blur behaviour and the `.carreaux` writing surface exactly as they are:

```tsx
export function SeanceNote({
  sessionId,
  text,
  readOnly = false,
}: {
  sessionId: string;
  text: string;
  readOnly?: boolean;
}) {
  const db = useDb();
  const [draft, setDraft] = useState(text);
  return (
    <textarea
      className="carreaux field"
      value={draft}
      readOnly={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === text) return;
        void setSessionNote(db, sessionId, draft);
      }}
    />
  );
}
```

Rename the file to `src/modules/diary/components/seance-note.tsx`.

In `diary/page.tsx`, replace the `diaryForClass` / `diaryInRange` queries with
`sessionsInRange`, and group the rows by `date` so a day renders its séances:

```tsx
const byDay = new Map<number, Session[]>();
for (const session of sessions) {
  const day = byDay.get(session.date) ?? [];
  day.push(session);
  byDay.set(session.date, day);
}
```

Each row shows the time (`formatTimeRange` is not right here — a séance has a
start only, so use `minutesToHm` and the app locale), the class name, and the
note. Search filters on `session.note`.

New keys in both locale files, under `diary`:

```json
"seanceAt": "{{time}}",
"unscheduled": "Séance non planifiée",
"noNote": "Aucune note"
```

(English: `"unscheduled": "Unscheduled lesson"`, `"noNote": "No note"`.)

- [ ] **Step 6: Verify in the browser**

Run `yarn dev`, open `/diary`, and confirm: days group their séances, the note
saves on blur, and search matches note text. Fixture note — the seeded
workspace has sessions but no notes yet, so write one first.

- [ ] **Step 7: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add src/db/sessions.ts src/db/sessions.test.ts src/modules/diary src/i18n/locales
git commit -m "feat(diary): a day groups the séances taught in it"
```

---

### Task 5: Drop the day-keyed entry

**Files:**
- Modify: `src/db/index.ts` (version 14)
- Modify: `src/db/types.ts` (remove `DiaryEntry`)
- Delete: `src/db/diary.ts`, `src/db/diary.test.ts`
- Modify: `src/db/backup.ts`
- Modify: `src/db/index.test.ts`, `src/db/backup.test.ts`, `src/db/cascade.ts` (+ its test) — anywhere `diaryEntries` is named

**Interfaces:**
- Consumes: Task 4 must be done, or the journal stops building.
- Produces: nothing new; removes `DiaryEntry`, `setDiaryEntry`, `clearDiaryEntry`, `diaryForClass`, `diaryInRange`.

- [ ] **Step 1: Write the failing regression test**

In `src/db/index.test.ts`, beside the existing v2→v6 test, add:

```ts
it("opens a v13 database with current code", async () => {
  const name = `profs-${crypto.randomUUID()}`;
  // A v13 database, built with the schema as it stood before diaryEntries went.
  const old = new Dexie(name);
  old.version(13).stores({
    classes: "id, name",
    sessions: "id, classId, date, [classId+date], subjectId",
    diaryEntries: "[classId+date], classId, date",
  });
  await old.open();
  await old.table("sessions").add({
    id: "s1",
    classId: "c1",
    date: 0,
    createdAt: 0,
  });
  await old.table("diaryEntries").add({ classId: "c1", date: 0, text: "vieux" });
  old.close();

  const db = openWorkspaceDb(name.replace("profs-", ""));
  await db.open();
  expect(await db.sessions.get("s1")).toMatchObject({ classId: "c1" });
  expect(db.tables.map((t) => t.name)).not.toContain("diaryEntries");
  db.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/db/index.test.ts -t "v13"`
Expected: FAIL — `diaryEntries` is still a table.

- [ ] **Step 3: Drop the store**

In `src/db/index.ts`, after `db.version(13)`:

```ts
  /**
   * A note belongs to a séance, not to a day.
   *
   * The store is dropped rather than migrated, per the standing rule: schema
   * changes are disposable, and a stale workspace is wiped rather than
   * upgraded. Every existing journal entry goes, which is accepted — the text
   * now lives on `Session.note`, which needed no version of its own because
   * `.stores()` declares indexes, not fields.
   */
  db.version(14).stores({ diaryEntries: null });
```

Remove `diaryEntries` from the `EntityTable` declarations and delete the
`DiaryEntry` interface from `types.ts`.

- [ ] **Step 4: Take it out of the backup**

In `src/db/backup.ts`, remove `diaryEntries` from all five places: the
`WorkspaceBackup` interface, the zod schema, the export literal, the
`Promise.all` read, and the import's table list. The double-import test compares
row counts across two passes, so a table missing entirely would keep its count
on both passes — that is why the removal must be by hand and complete.

- [ ] **Step 5: Delete the module and fix every caller**

```bash
git rm src/db/diary.ts src/db/diary.test.ts
grep -rn "diaryEntries\|DiaryEntry\|setDiaryEntry\|diaryForClass\|diaryInRange" src/
```

Every hit must go. The wipe test and the schema table-list test in
`src/db/index.test.ts` seed a row per table; remove `diaryEntries` from both.

- [ ] **Step 6: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```
Expected: all green, including the new v13 test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): the day-keyed journal entry goes, notes live on the séance"
```

---

### Task 6: One route for a class, two for its detours

**Files:**
- Modify: `src/router.ts`
- Modify: `src/app.tsx`
- Modify: `src/modules/class/page.tsx` (accept the slot params; the body is rewritten in Task 7)
- Modify: every `Router.ClassPlan(...)` / `ClassStudents` / `ClassBooks` / `ClassDiary` call site

**Interfaces:**
- Consumes: nothing.
- Produces: `Router.Class({ classId })`, `Router.ClassStudents({ classId })` at `/classes/:classId/eleves`, `Router.ClassDiary({ classId })` at `/classes/:classId/journal`.

- [ ] **Step 1: Rewrite the routes**

In `src/router.ts`:

```ts
    // A class is ONE page: the séance, with the roster and the archive as
    // detours that keep their own URLs. The four tab routes it replaced
    // redirect, so older links and bookmarks still land somewhere real.
    Class: "/classes/:classId",
    ClassStudents: "/classes/:classId/eleves",
    ClassDiary: "/classes/:classId/journal",
```

Remove `ClassPlan` and `ClassBooks`.

- [ ] **Step 2: Redirect the old paths**

In `src/app.tsx`, where the class routes are matched, add redirects for
`/classes/:classId/plan`, `/students`, `/books` and `/diary` to
`Router.Class({ classId })`. Chicane matches by name, so the old names must
stay in the router with new paths for the redirect to be expressible:

```ts
    ClassPlanLegacy: "/classes/:classId/plan",
    ClassBooksLegacy: "/classes/:classId/books",
    ClassStudentsLegacy: "/classes/:classId/students",
    ClassDiaryLegacy: "/classes/:classId/diary",
```

and in the route switch, each renders nothing and calls
`Router.replace("Class", { classId })` in an effect.

- [ ] **Step 3: Fix every call site**

```bash
grep -rn "ClassPlan\|ClassBooks\|ClassStudents\|ClassDiary" src/ --include=*.tsx --include=*.ts
```

`today/page.tsx` links to `ClassPlan`; that becomes `Class` and, in Task 9,
gains the slot parameters.

- [ ] **Step 4: Run the gate and check the redirects**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```
Then `yarn dev` and open `/classes/<id>/plan` — it must land on `/classes/<id>`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(router): one route for a class, and redirects for its four tabs"
```

---

### Task 7: The one page

**Files:**
- Rewrite: `src/modules/class/page.tsx`
- Create: `src/modules/class/components/seance-strip.tsx`
- Create: `src/modules/class/components/carnets-panel.tsx`
- Delete: `src/modules/class/tabs/` (its `students.tsx` moves to the `eleves` route in Task 6's structure), `src/modules/plan/components/session-bar.tsx`
- Modify: `src/modules/plan/page.tsx` (drop session selection; take a `sessionId` prop)
- Modify: `src/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `slotsForDay`, `resolveSlot`, `Slot` (Task 3); `sessionsForDay`, `getOrCreateSessionAt`, `setSessionNote` (Tasks 1–2); `Router.Class` (Task 6).
- Produces: the page; no exported API other than `ClassPage`.

- [ ] **Step 1: Build the séance strip**

Create `src/modules/class/components/seance-strip.tsx`:

```tsx
import { deleteSession } from "@db/cascade";
import { useDb } from "@db/provider";
import { minutesToHm } from "@domain/schedule";
import type { Slot } from "@domain/seance";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * Which lesson is on screen, and the ones either side of it.
 *
 * It states the day rather than offering a list: the séance is resolved from
 * the URL, from the clock, or from the last one taught, and the strip exists
 * so the neighbours are one tap away — not so a teacher has to choose before
 * they can take the register. That was the `<select>` this replaces.
 */
export function SeanceStrip({
  slots,
  current,
  className,
  onSelect,
  onStart,
}: {
  /** The neighbouring slots, earliest first, current one included. */
  slots: Slot[];
  current: Slot | null;
  className?: string;
  onSelect: (slot: Slot) => void;
  onStart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });
  const shortFormat = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });

  const label = (slot: Slot): string => {
    if (slot.startsAt === null) return t("seance.unscheduled");
    const { hours, minutes } = minutesToHm(slot.startsAt);
    return t("seance.at", { hours, minutes: String(minutes).padStart(2, "0") });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="font-semibold">
        {current === null ? t("seance.none") : dayFormat.format(current.date)}
      </span>

      <div className="flex flex-wrap gap-1">
        {slots.map((slot) => {
          const isCurrent =
            current !== null && slot.date === current.date && slot.startsAt === current.startsAt;
          return (
            <button
              // Anchored to the slot's day and time, never to its position in
              // the strip: the list reorders as séances are created.
              key={`${slot.date}-${slot.startsAt ?? "x"}`}
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              className={`btn h-9 min-h-9 ${isCurrent ? "border-accent text-accent" : ""}`}
              onClick={() => onSelect(slot)}
            >
              {slot.date === current?.date
                ? label(slot)
                : `${shortFormat.format(slot.date)} ${label(slot)}`}
            </button>
          );
        })}
      </div>

      <button type="button" className="btn" onClick={onStart}>
        {t("seance.start")}
      </button>

      {/* Deleting cascades the register and the behaviour with it, so it sits
          behind a confirm rather than under a thumb operating this page
          one-handed with a class in front of it. */}
      {current?.sessionId ? (
        <ConfirmButton
          key={current.sessionId}
          variant="link"
          label={t("seance.delete")}
          confirmLabel={t("seance.confirmDelete", { day: dayFormat.format(current.date) })}
          body={t("seance.confirmDeleteBody")}
          onConfirm={() => deleteSession(db, current.sessionId as string)}
        />
      ) : null}
    </div>
  );
}
```

Keys in both locale files under a new `seance` namespace — French first,
English alongside:

```json
"seance": {
  "at": "{{hours}}h{{minutes}}",
  "unscheduled": "Hors emploi du temps",
  "none": "Aucune séance",
  "start": "Commencer une séance",
  "delete": "Supprimer la séance",
  "confirmDelete": "Supprimer la séance du {{day}} ?",
  "confirmDeleteBody": "Sa présence et son comportement partent avec elle."
}
```

- [ ] **Step 2: Read the slot from the URL**

In `ClassPage`, read `date` and `at` from the Chicane route params, build the
day's slots from `sessionsForDay` + `entriesForDate`, and resolve:

```tsx
const wanted = params.date === undefined
  ? null
  : { startsAt: params.at === undefined ? null : Number(params.at) };
const slot = resolveSlot(slots, wanted);
```

With no `date` param: today's slots if the day has any, otherwise the most
recent day that has a séance. **Never an empty today** — that was the ruling.

- [ ] **Step 3: Write nothing on arrival**

The page must not call `getOrCreateSessionAt` in an effect. It is called only
from a recording:

```tsx
const ensureSeance = useCallback(async (): Promise<string> => {
  if (slot?.sessionId) return slot.sessionId;
  const session = await getOrCreateSessionAt(db, classId, {
    date: slot?.date ?? startOfDay(Date.now()),
    ...(slot?.startsAt === null || slot?.startsAt === undefined ? {} : { startsAt: slot.startsAt }),
  });
  return session.id;
}, [db, classId, slot]);
```

Attendance, behaviour and the note all await `ensureSeance()` before writing.

- [ ] **Step 4: Build the carnets panel**

Create `src/modules/class/components/carnets-panel.tsx`:

```tsx
import type { Gradebook } from "@db";
import { useDb } from "@db/provider";
import { classStats } from "@domain/gradebook/stats";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

/**
 * Access, not a grid.
 *
 * A gradebook grid is a wide scrolling table and stays a full-screen route of
 * its own — that is why the flat `/gradebooks` list was removed and marking
 * starts at the class. What belongs here is the way in, and enough of a
 * summary to choose between two carnets.
 */
export function CarnetsPanel({ classId, gradebooks }: { classId: string; gradebooks: Gradebook[] }) {
  const { t } = useTranslation();
  const db = useDb();

  const averages = useLiveQuery(async () => {
    const entries = await Promise.all(
      gradebooks.map(async (book) => {
        const columns = await db.columns.where("gradebookId").equals(book.id).toArray();
        const grades = await db.grades.where("gradebookId").equals(book.id).toArray();
        const students = await db.students.where("classId").equals(classId).toArray();
        return [book.id, classStats(students, columns, grades, null).mean] as const;
      }),
    );
    return Object.fromEntries(entries);
  }, [db, classId, gradebooks]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
          {t("class.books")}
        </h3>
      </div>

      {gradebooks.length === 0 ? (
        <p className="text-sm text-text-muted">{t("gradebook.none")}</p>
      ) : (
        gradebooks.map((book) => (
          <div key={book.id} className="flex flex-col gap-1 border-border border-t pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-sm">{book.name}</span>
              <span className="tabular text-sm">{averages?.[book.id] ?? "—"}</span>
            </div>
            <Link className="btn self-start" to={Router.Gradebook({ gradebookId: book.id })}>
              {t("gradebook.open")}
            </Link>
          </div>
        ))
      )}
    </div>
  );
}
```

Check `classStats`'s real signature in `src/domain/gradebook/stats.ts` before
writing this — it takes the FULL column list and filters by period internally,
and passing an already-filtered list changes the result silently.

- [ ] **Step 5: Assemble the page**

`ClassPage` renders, in order: the header (class name, level, pupil count,
links to `eleves` and `journal`, and the rename and delete controls it already
has), the `SeanceStrip`, then a two-column body — the plan with its group
chips on the left, `SeanceNote` and `CarnetsPanel` on the right. On a narrow
screen the right column falls under the plan, so what is touched mid-lesson
comes first and the marks come last.

Reuse the existing `GroupFilter` component unchanged. The chips filter the
roster and the unseated rail, never the seats: filtering seats would leave
holes in a room.

- [ ] **Step 6: Verify the whole flow in the browser**

With `yarn dev`, on a seeded workspace:
1. Open a class — confirm **no session row is written** (check the count in
   IndexedDB before and after).
2. Mark an absence — one session appears, and only one.
3. Write a note, blur — it persists, and no second session appears.
4. Reload — the note is there and the strip shows the same séance.

- [ ] **Step 7: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(class): one page — the séance, its note, and the carnets"
```

---

### Task 8: A register without furniture

**Files:**
- Create: `src/modules/class/components/roster-register.tsx`
- Modify: `src/modules/class/page.tsx`
- Modify: locales

**Interfaces:**
- Consumes: the pupil card from `src/modules/plan/components/student-card.tsx`.
- Produces: `RosterRegister`, rendered in place of the plan when the workspace has no salle.

- [ ] **Step 1: Build it**

Create `src/modules/class/components/roster-register.tsx`:

```tsx
import type { AttendanceRecord, Student } from "@db";
import type { AttendanceValue } from "@domain/attendance";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * The register, when the class has no salle.
 *
 * Attendance is a property of a séance, not of a chair. A salle is an upgrade
 * to the register, never a prerequisite for it — a teacher who never makes a
 * seating plan still takes the register every lesson.
 *
 * A row behaves exactly like a seat: tapping it opens the pupil card, which
 * stays the ONLY place attendance is set. Marks set inline here and through a
 * card on the plan would be two ways to record one fact.
 */
export function RosterRegister({
  students,
  attendance,
  onOpen,
}: {
  students: Student[];
  attendance: AttendanceRecord[];
  onOpen: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const byStudent = new Map(attendance.map((row) => [row.studentId, row.value as AttendanceValue]));

  return (
    <ul className="flex flex-col gap-0 rounded-md border border-border">
      {students.map((student) => {
        const mark = byStudent.get(student.id);
        return (
          // Keyed by the pupil's id, never by position: the list re-sorts as
          // pupils are added and an index would retarget the row.
          <li key={student.id} className="border-border border-b last:border-b-0">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-hover"
              onClick={() => onOpen(student.id)}
            >
              <PupilName student={student} />
              <span
                className={mark === undefined ? "text-text-faint text-sm" : "text-danger text-sm"}
              >
                {mark === undefined ? "" : t(`gradebook.attendance.${mark}`)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

Nothing is rendered for an unmarked pupil: a missing row means *not recorded*,
never *present*, and `domain/attendance.ts` refuses a default value for exactly
that reason.

- [ ] **Step 2: Verify with no salle**

In the browser, delete every salle in a scratch workspace (Réglages → or the
salles page) and confirm the class page still records attendance.

- [ ] **Step 3: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(class): the register does not depend on the furniture"
```

---

### Task 9: Aujourd'hui and the timetable point at a séance

**Files:**
- Modify: `src/modules/today/page.tsx`
- Modify: `src/modules/schedule/page.tsx`

- [ ] **Step 1: Carry the slot in the link**

```tsx
<Link to={Router.Class({ classId: lesson.classId, date: String(startOfDay(now)), at: lesson.startMinute === null ? undefined : String(lesson.startMinute) })}>
```

- [ ] **Step 2: Pair by time, not by class**

Today's merge pairs a session to an entry **by class**, with a comment
admitting it is wrong when a class is taught twice in a day. With `startsAt`
that compromise is unnecessary: replace the body with `slotsForDay` from Task 3
and render its slots.

- [ ] **Step 3: Verify**

Two lessons for one class on one day must open two different séances from
Today.

- [ ] **Step 4: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "feat(today): a lesson links to its own séance"
```

---

### Task 10: The documentation catches up

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-08-profs-class-one-pager-design.md` (status line)

- [ ] **Step 1: Rewrite the rulings that changed**

In `CLAUDE.md`: the class-is-the-page section (four tabs → one page), the
schedule section (a session is a slot, and what still forbids materialising
one per scheduled lesson), the journal section (per séance, not per day, and
the `[classId+date]` paragraph that is now false), and the known gap about the
group filter.

- [ ] **Step 2: Mark the spec implemented**

- [ ] **Step 3: Run the gate and commit**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
git add -A
git commit -m "docs: the class is one page, and a séance is a slot"
```

---

## Notes for the executor

- **The fixture is the demo school.** Reset it by deleting every `profs-*`
  IndexedDB database and every `profs-*` localStorage key, then reloading:
  `seedIfEmpty` gates on `profs-seeded-workspaces`, so emptying the tables
  alone will not bring the demo data back.
- **There are deliberately no component tests.** UI is verified by reading and
  by driving a real browser against `yarn dev` on port 3000. Pointer-event
  gestures can be synthesised; HTML5 drag cannot.
- **When a step says "verify in the browser", do it.** The three tasks that
  touch writes (1, 2, 7) are where a wrong effect writes rows a teacher never
  asked for, and no unit test in this repo covers an effect.
