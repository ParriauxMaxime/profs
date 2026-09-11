# Behaviour Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Y cartons jaunes over the last X séances read as a carton rouge — configurable in Réglages, seeded at 2/2, announced fullscreen, and visible on the plan de table as hollow cards from the preceding lessons.

**Architecture:** The red card is **derived on read**, never stored: a pure domain function counts a pupil's yellows inside a window of séances and answers *escalated*. The rule itself lives in a new one-row `settings` store so it rides the JSON export. Nothing is added to `behaviourEvents`, and `countByType` and the pupil page's timeline are untouched — they stay a record of what was observed.

**Tech Stack:** TypeScript, React 19, Dexie 4 (IndexedDB), dexie-react-hooks, Chicane router, Tailwind 4, i18next, Jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-11-profs-behaviour-escalation-design.md` — read it before Task 1; every "why" below is argued there.

## Global Constraints

- **Node is not on the default PATH.** Every `yarn` command in this plan fails with `command not found` until you prepend it. Run this once per shell:
  `export PATH="$HOME/.local/share/fnm/node-versions/$(ls "$HOME/.local/share/fnm/node-versions" | head -1)/installation/bin:$PATH"`
- **Validation gate — all four must be green before any task is done:**
  `yarn format && yarn lint && yarn typecheck && yarn test`
- **No network request of any kind.** No `fetch`, no CDN font, no external image. This is a documented product promise in `README.md` and `PRIVACY.md`.
- **No `window.confirm`, `alert`, `beforeunload`, or `<dialog>`.** They freeze the browser automation these screens are verified with.
- **Every user-visible string goes through `t()`**, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json` — a parity test fails the build otherwise. `fr` is default and fallback.
- **Plurals use i18next v4 suffixes** (`_one` / `_other`). Only pass an interpolation variable named `count` when you want plural resolution.
- **IDs come from `crypto.randomUUID()`; timestamps are epoch-ms from `Date.now()`.**
- **`src/domain/` is pure** — no React, no Dexie, no I/O. It is the only place with real unit tests.
- **There are deliberately no component tests.** UI is verified by reading and by driving a real browser against `yarn dev` on port 3000.
- **Pupil names are rendered only through `PupilName`** (`src/modules/design-system/components/pupil-name.tsx`). Never `toUpperCase()` a name — the capitals are CSS.
- **Schema changes are disposable.** Add a table, bump the version, write no upgrade function.
- Identifiers are English; only translation values are French.

---

### Task 1: The domain rule

**Files:**
- Create: `src/domain/escalation.ts`
- Create: `src/domain/escalation.test.ts`

**Interfaces:**
- Consumes: `BehaviourType` from `src/domain/behaviour.ts`.
- Produces:
  - `interface EscalationRule { enabled: boolean; seances: number; yellows: number }`
  - `const DEFAULT_ESCALATION: EscalationRule` = `{ enabled: true, seances: 2, yellows: 2 }`
  - `const MIN_ESCALATION_SEANCES = 1`, `MAX_ESCALATION_SEANCES = 10`, `MIN_ESCALATION_YELLOWS = 2`, `MAX_ESCALATION_YELLOWS = 10`
  - `clampRule(rule: EscalationRule): EscalationRule`
  - `interface WindowSession { id: string; date: number; startsAt: number }`
  - `escalationWindow(sessions: WindowSession[], currentSessionId: string | null, rule: EscalationRule): string[]`
  - `yellowsInWindow<E extends { sessionId: string; type: BehaviourType }>(events: E[], windowIds: string[]): E[]`
  - `isEscalated(yellowCount: number, rule: EscalationRule): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/domain/escalation.test.ts`:

```ts
import {
  clampRule,
  DEFAULT_ESCALATION,
  escalationWindow,
  isEscalated,
  yellowsInWindow,
} from "./escalation";

/** Three séances of one class, one per day, in the order they were taught. */
const SEANCES = [
  { id: "s1", date: 100, startsAt: 480 },
  { id: "s2", date: 200, startsAt: 480 },
  { id: "s3", date: 300, startsAt: 480 },
];

const RULE = DEFAULT_ESCALATION;

describe("escalationWindow", () => {
  it("ends at the séance on screen and counts it", () => {
    expect(escalationWindow(SEANCES, "s3", RULE)).toEqual(["s2", "s3"]);
  });

  it("orders by date then startsAt, not by input order", () => {
    const shuffled = [
      { id: "late", date: 100, startsAt: 600 },
      { id: "early", date: 100, startsAt: 480 },
    ];
    expect(escalationWindow(shuffled, "late", RULE)).toEqual(["early", "late"]);
  });

  it("stops at the start of history rather than padding", () => {
    expect(escalationWindow(SEANCES, "s1", { ...RULE, seances: 4 })).toEqual(["s1"]);
  });

  it("is empty when no séance exists yet", () => {
    expect(escalationWindow(SEANCES, null, RULE)).toEqual([]);
  });

  it("is empty for a séance that is not in the list", () => {
    expect(escalationWindow(SEANCES, "ghost", RULE)).toEqual([]);
  });
});

describe("yellowsInWindow", () => {
  const events = [
    { sessionId: "s1", type: "yellow" as const },
    { sessionId: "s1", type: "green" as const },
    { sessionId: "s2", type: "yellow" as const },
    { sessionId: "s2", type: "yellow" as const },
    { sessionId: "s3", type: "red" as const },
  ];

  it("keeps only yellows inside the window", () => {
    expect(yellowsInWindow(events, ["s2", "s3"])).toEqual([
      { sessionId: "s2", type: "yellow" },
      { sessionId: "s2", type: "yellow" },
    ]);
  });

  it("counts several yellows from one séance separately", () => {
    expect(yellowsInWindow(events, ["s2"])).toHaveLength(2);
  });

  it("drops a yellow from the séance just outside the window", () => {
    expect(yellowsInWindow(events, ["s2", "s3"]).some((e) => e.sessionId === "s1")).toBe(false);
  });
});

describe("isEscalated", () => {
  it("fires at exactly Y", () => {
    expect(isEscalated(2, RULE)).toBe(true);
  });

  it("does not fire below Y", () => {
    expect(isEscalated(1, RULE)).toBe(false);
  });

  it("stays true above Y — the window slides, it does not reset", () => {
    expect(isEscalated(5, RULE)).toBe(true);
  });

  it("never fires while the rule is off", () => {
    expect(isEscalated(9, { ...RULE, enabled: false })).toBe(false);
  });
});

describe("clampRule", () => {
  it("refuses a one-yellow rule, which would rename the button", () => {
    expect(clampRule({ enabled: true, seances: 2, yellows: 1 }).yellows).toBe(2);
  });

  it("refuses a window of zero séances", () => {
    expect(clampRule({ enabled: true, seances: 0, yellows: 2 }).seances).toBe(1);
  });

  it("caps both ends and truncates a fractional value", () => {
    expect(clampRule({ enabled: true, seances: 99, yellows: 3.7 })).toEqual({
      enabled: true,
      seances: 10,
      yellows: 3,
    });
  });

  it("falls back to the floor for a value that is not a number", () => {
    expect(clampRule({ enabled: true, seances: Number.NaN, yellows: 2 }).seances).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test src/domain/escalation.test.ts
```

Expected: FAIL — `Cannot find module './escalation'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/escalation.ts`:

```ts
/**
 * When a run of avertissements reads as a carton rouge.
 *
 * A practising teacher's own classroom mechanic: Y jaunes over the last X
 * séances make a rouge. The red is DERIVED here and never written as a
 * `BehaviourEvent`, the same posture `studentAverage` takes — a stored red
 * would go stale the moment the threshold moved, and deleting one of the
 * yellows behind it would leave an orphan the log still exported. A
 * `BehaviourEvent` records what a teacher OBSERVED; a red the app inferred is
 * not an observation.
 *
 * Pure, and structurally typed over its inputs, so a `Session` and a test
 * fixture both fit without the domain learning about Dexie.
 */

import type { BehaviourType } from "./behaviour";

export interface EscalationRule {
  enabled: boolean;
  /** X — how many séances the window spans, counting the one on screen. */
  seances: number;
  /** Y — yellows inside that window that make a red. */
  yellows: number;
}

/** What the demo school seeds, and what an absent settings row reads as. */
export const DEFAULT_ESCALATION: EscalationRule = { enabled: true, seances: 2, yellows: 2 };

export const MIN_ESCALATION_SEANCES = 1;
export const MAX_ESCALATION_SEANCES = 10;
/**
 * Two, not one. A rule of one yellow makes every avertissement instantly a
 * rouge — which is not an escalation, it is renaming the button, and it would
 * throw the fullscreen animation on every single tap.
 */
export const MIN_ESCALATION_YELLOWS = 2;
export const MAX_ESCALATION_YELLOWS = 10;

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

/**
 * The floors live HERE rather than in the settings form, so a hand-edited
 * import or a future second caller cannot install a rule the app refuses to
 * express. Every function below clamps before it reads.
 */
export function clampRule(rule: EscalationRule): EscalationRule {
  return {
    enabled: rule.enabled,
    seances: clamp(rule.seances, MIN_ESCALATION_SEANCES, MAX_ESCALATION_SEANCES),
    yellows: clamp(rule.yellows, MIN_ESCALATION_YELLOWS, MAX_ESCALATION_YELLOWS),
  };
}

/** Enough of a `Session` to order it. */
export interface WindowSession {
  id: string;
  date: number;
  startsAt: number;
}

/**
 * The séance ids the rule is counting over, oldest first.
 *
 * The CLASS's séances, not the pupil's attended ones: a per-pupil window would
 * depend on attendance being marked, which is lazy and routinely incomplete,
 * and two pupils in one room would be judged on different stretches of the
 * term. *Deux sur deux* has to mean the same thing in every seat.
 *
 * Empty for a séance that does not exist — which is the case that matters in
 * practice, since a lesson where nothing has been recorded has no row at all,
 * so there is nothing to count and nobody is at red.
 */
export function escalationWindow(
  sessions: WindowSession[],
  currentSessionId: string | null,
  rule: EscalationRule,
): string[] {
  if (currentSessionId === null) return [];
  const span = clampRule(rule).seances;
  const ordered = [...sessions].sort((a, b) => a.date - b.date || a.startsAt - b.startsAt);
  const index = ordered.findIndex((session) => session.id === currentSessionId);
  if (index === -1) return [];
  return ordered.slice(Math.max(0, index - span + 1), index + 1).map((session) => session.id);
}

/**
 * The yellows inside that window, in the order they were handed in.
 *
 * Input order is preserved rather than re-sorted: the caller reads them from
 * Dexie sorted by `createdAt`, and the seat draws them oldest first.
 */
export function yellowsInWindow<E extends { sessionId: string; type: BehaviourType }>(
  events: E[],
  windowIds: string[],
): E[] {
  const ids = new Set(windowIds);
  return events.filter((event) => event.type === "yellow" && ids.has(event.sessionId));
}

/**
 * Stateless, deliberately: a pupil is at red whenever their yellows in the
 * CURRENT window reach Y, and the window simply slides. Yellow in séance 2 plus
 * yellow in séance 3 fires again even though séance 1 and 2 already did — which
 * is the truer statement, and needs no record of which yellows were "consumed".
 */
export function isEscalated(yellowCount: number, rule: EscalationRule): boolean {
  const clamped = clampRule(rule);
  if (!clamped.enabled) return false;
  return yellowCount >= clamped.yellows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test src/domain/escalation.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/escalation.ts src/domain/escalation.test.ts
git commit -m "$(cat <<'MSG'
feat(escalation): the rule that reads yellows as a red

Derived, never stored, and clamped in the domain rather than in a form: a
one-yellow rule is not an escalation, it is renaming the button.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 2: The settings store

**Files:**
- Modify: `src/db/types.ts` (append a `WorkspaceSettings` interface)
- Modify: `src/db/index.ts` (import/export the type, add the table to `AppDatabase`, bump `db.version(17)` to `db.version(18)` and add `settings: "id"`)
- Create: `src/db/settings.ts`
- Create: `src/db/settings.test.ts`
- Modify: `src/db/index.test.ts` (add `"settings"` to the expected table list)
- Modify: `src/db/workspace.test.ts` (seed a settings row so the wipe test covers it)

**Interfaces:**
- Consumes: `EscalationRule`, `DEFAULT_ESCALATION`, `clampRule` from Task 1.
- Produces:
  - `interface WorkspaceSettings { id: string; escalation: EscalationRule }`
  - `const WORKSPACE_SETTINGS_ID = "workspace"`
  - `readEscalation(db: AppDatabase): Promise<EscalationRule>`
  - `writeEscalation(db: AppDatabase, rule: EscalationRule): Promise<void>`
  - `db.settings` on `AppDatabase`

- [ ] **Step 1: Write the failing test**

Create `src/db/settings.test.ts`:

```ts
import "fake-indexeddb/auto";
import { DEFAULT_ESCALATION } from "@domain/escalation";
import { openWorkspaceDb } from ".";
import { readEscalation, WORKSPACE_SETTINGS_ID, writeEscalation } from "./settings";

describe("the escalation setting", () => {
  it("reads the default when no row has been written", async () => {
    const db = openWorkspaceDb(`settings-empty-${crypto.randomUUID()}`);
    expect(await readEscalation(db)).toEqual(DEFAULT_ESCALATION);
    db.close();
  });

  it("round-trips a rule through one row", async () => {
    const db = openWorkspaceDb(`settings-write-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 4, yellows: 3 });
    expect(await db.settings.count()).toBe(1);
    db.close();
  });

  it("keeps writing to the same row rather than accumulating", async () => {
    const db = openWorkspaceDb(`settings-once-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 3, yellows: 2 });
    await writeEscalation(db, { enabled: false, seances: 5, yellows: 4 });
    expect(await db.settings.count()).toBe(1);
    expect(await readEscalation(db)).toEqual({ enabled: false, seances: 5, yellows: 4 });
    db.close();
  });

  it("clamps on the way in, so no stored rule is inexpressible", async () => {
    const db = openWorkspaceDb(`settings-clamp-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 0, yellows: 1 });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 1, yellows: 2 });
    db.close();
  });

  it("clamps on the way out, so a hand-edited import cannot install one either", async () => {
    const db = openWorkspaceDb(`settings-import-${crypto.randomUUID()}`);
    await db.settings.put({
      id: WORKSPACE_SETTINGS_ID,
      escalation: { enabled: true, seances: 99, yellows: 1 },
    });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 10, yellows: 2 });
    db.close();
  });

  it("falls back to the default for a row carrying no rule at all", async () => {
    const db = openWorkspaceDb(`settings-husk-${crypto.randomUUID()}`);
    // What a hand-edited backup could put there.
    await db.settings.put({ id: WORKSPACE_SETTINGS_ID } as never);
    expect(await readEscalation(db)).toEqual(DEFAULT_ESCALATION);
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test src/db/settings.test.ts
```

Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 3: Add the row type**

Append to `src/db/types.ts` (the file already imports `BehaviourType` from `@domain/behaviour`; add the escalation import beside it):

```ts
/**
 * The workspace's own preferences — one row, id `"workspace"`.
 *
 * A store rather than a field on something existing, so the next preference
 * lands in it without another version bump. It is in the DATABASE rather than
 * in `localStorage` beside the theme and the term anchor because it is a rule
 * about the établissement's discipline, not about this device: the JSON export
 * carries it, so a teacher restoring onto their tablet gets the same rule
 * instead of a silently different one. A red card that means two things on two
 * devices is worse than no automation.
 */
export interface WorkspaceSettings {
  id: string;
  escalation: EscalationRule;
}
```

At the top of `src/db/types.ts`, add:

```ts
import type { EscalationRule } from "@domain/escalation";
```

- [ ] **Step 4: Declare the table**

In `src/db/index.ts`:

1. Add `WorkspaceSettings` to the `import type { … } from "./types"` list (alphabetically, after `Subject`).
2. Add `WorkspaceSettings` to the `export type { … } from "./types"` list (same place).
3. Add to the `AppDatabase` type, after `scheduleEntries`:

```ts
  settings: EntityTable<WorkspaceSettings, "id">;
```

4. Change `db.version(17).stores({` to `db.version(18).stores({` and add, after the `scheduleEntries` line:

```ts
    // The workspace's own preferences, one row. Additive — no upgrade
    // function, per the standing rule. The `.upgrade()` below rides along to
    // 18 and is idempotent: a workspace already at 17 carries `startsAt` on
    // every séance, so `repairSeanceCollisions` changes nothing there.
    settings: "id",
```

5. Change `db.version(17).upgrade(async (tx) => {` to `db.version(18).upgrade(async (tx) => {`.

- [ ] **Step 5: Write the accessors**

Create `src/db/settings.ts`:

```ts
import {
  clampRule,
  DEFAULT_ESCALATION,
  type EscalationRule,
} from "@domain/escalation";
import type { AppDatabase } from ".";

/**
 * One row, one id. A key-value store keyed by preference name was considered
 * and cut: every preference here belongs to the workspace as a whole, and a
 * single typed row is a shape `typecheck` can defend.
 */
export const WORKSPACE_SETTINGS_ID = "workspace";

/**
 * The active rule, or the default when nothing has been written.
 *
 * Clamped on the way OUT as well as on the way in, because a row can arrive
 * from an imported backup that never went through `writeEscalation`.
 */
export async function readEscalation(db: AppDatabase): Promise<EscalationRule> {
  const row = await db.settings.get(WORKSPACE_SETTINGS_ID);
  if (!row?.escalation) return DEFAULT_ESCALATION;
  return clampRule(row.escalation);
}

export async function writeEscalation(db: AppDatabase, rule: EscalationRule): Promise<void> {
  await db.settings.put({ id: WORKSPACE_SETTINGS_ID, escalation: clampRule(rule) });
}
```

- [ ] **Step 6: Run the settings test**

```bash
yarn test src/db/settings.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Update the schema table-list test**

In `src/db/index.test.ts`, add `"settings",` to the array inside `expect(names).toEqual([...].sort())` (the list is `.sort()`ed, so position does not matter).

- [ ] **Step 8: Update the wipe test**

In `src/db/workspace.test.ts`, inside the `"leaves no row in any table"` test, alongside the other `await db.<table>.add(...)` lines, add:

```ts
    await db.settings.add({
      id: "workspace",
      escalation: { enabled: true, seances: 2, yellows: 2 },
    });
```

- [ ] **Step 9: Run those two suites**

```bash
yarn test src/db/index.test.ts src/db/workspace.test.ts
```

Expected: PASS. The wipe test reads `db.tables`, so it covers the new store without any change to `wipeWorkspace`.

- [ ] **Step 10: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green except `src/db/backup.test.ts`, which may now fail its double-import row-count check — Task 3 fixes it. If backup passes here, that is fine too; Task 3 still applies.

- [ ] **Step 11: Commit**

```bash
git add src/db/types.ts src/db/index.ts src/db/settings.ts src/db/settings.test.ts src/db/index.test.ts src/db/workspace.test.ts
git commit -m "$(cat <<'MSG'
feat(db): a settings store, at version 18

One row for the workspace's own preferences. In the database rather than in
localStorage because the rule describes the établissement, not the device —
which means the export carries it and two devices cannot disagree.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 3: Backup format 14

**Files:**
- Modify: `src/db/backup.ts`
- Modify: `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `db.settings`, `WorkspaceSettings` from Task 2.
- Produces: `WorkspaceBackup.version` is `14`; `WorkspaceBackup.settings: WorkspaceSettings[]`.

Both sides of `backup.ts` build a **literal array** rather than reading `db.tables`, so a new store must be added by hand in four places. That is the guard, not an oversight.

- [ ] **Step 1: Write the failing test**

Append to `src/db/backup.test.ts` (inside the existing top-level `describe`, or as a new `describe` at the end of the file):

```ts
describe("the settings store in a backup", () => {
  it("exports the workspace's rule and reads it back", async () => {
    const db = openWorkspaceDb(`backup-settings-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });

    const backup = await exportWorkspace(db);
    expect(backup.version).toBe(14);
    expect(backup.settings).toEqual([
      { id: "workspace", escalation: { enabled: true, seances: 4, yellows: 3 } },
    ]);

    await importWorkspace(db, parseBackup(JSON.parse(JSON.stringify(backup))));
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 4, yellows: 3 });
    db.close();
  });

  it("refuses a format-13 file", () => {
    const stale = { version: 13, exportedAt: 1, classes: [], students: [] };
    expect(() => parseBackup(stale)).toThrow();
  });

  it("leaves no second settings row after a double import", async () => {
    const db = openWorkspaceDb(`backup-settings-twice-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: false, seances: 3, yellows: 2 });
    const backup = parseBackup(JSON.parse(JSON.stringify(await exportWorkspace(db))));
    await importWorkspace(db, backup);
    await importWorkspace(db, backup);
    expect(await db.settings.count()).toBe(1);
    db.close();
  });
});
```

At the top of `src/db/backup.test.ts`, add to the imports:

```ts
import { readEscalation, writeEscalation } from "./settings";
```

(`openWorkspaceDb`, `exportWorkspace`, `importWorkspace` and `parseBackup` are already imported there — check the existing import block and only add what is missing.)

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test src/db/backup.test.ts
```

Expected: FAIL — `expect(backup.version).toBe(14)` receives `13`, and `backup.settings` is `undefined`.

- [ ] **Step 3: Make the four edits in `src/db/backup.ts`**

1. In the `import type { … } from "./types"` block, add `WorkspaceSettings` (alphabetically last).

2. In `interface WorkspaceBackup`, change `version: 13;` to `version: 14;` and add after `scheduleEntries: ScheduleEntry[];`:

```ts
  settings: WorkspaceSettings[];
```

3. In the Zod schema, change `version: z.literal(13),` to `version: z.literal(14),` and add after the `scheduleEntries: …` line:

```ts
  settings: z.array(z.object({ id: z.string() }).loose()),
```

4. In `exportWorkspace`: add `settings,` to the destructured array (after `scheduleEntries,`), add `db.settings.toArray(),` to the `Promise.all` array (same position), change `version: 13,` to `version: 14,` in the returned object, and add `settings,` to it (after `scheduleEntries,`).

5. In `importWorkspace`: add `db.settings,` to the `tables` array (after `db.scheduleEntries,`), and add inside the transaction after the last `bulkAdd`:

```ts
    await db.settings.bulkPut(data.settings);
```

`bulkPut`, not `bulkAdd`: the id is a constant, so a re-import of the same file must overwrite the one row rather than collide on its key.

6. Update the block comment above the Zod schema so its worked example stays true — it currently argues from format 12 naming `rubricAssessments`. Add a sentence:

```
 * Format 13 is refused for a narrower reason than 12 was: it names no store
 * that has disappeared, but it carries no `settings` row, and a workspace
 * whose discipline rule silently reverted to the default on import is the
 * half-import this function exists to refuse.
```

- [ ] **Step 4: Run the backup test to verify it passes**

```bash
yarn test src/db/backup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/db/backup.ts src/db/backup.test.ts
git commit -m "$(cat <<'MSG'
feat(backup): format 14 carries the settings store

Added by hand on both sides, because each builds a literal array rather than
reading db.tables — which is the guard that catches a missing store.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 4: Seed the demo school at 2/2

**Files:**
- Modify: `src/db/seed.ts`
- Modify: `src/db/seed.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_ESCALATION` (Task 1), `WORKSPACE_SETTINGS_ID` (Task 2), `db.settings`.
- Produces: nothing new — a seeded workspace holds one `settings` row.

- [ ] **Step 1: Write the failing test**

Add to `src/db/seed.test.ts`, inside the existing `describe` that seeds a workspace (follow the file's established pattern for creating and seeding a db — read the top of the file first and reuse its helper if there is one):

```ts
  it("seeds the escalation rule at two yellows over two séances", async () => {
    const db = openWorkspaceDb(`seed-escalation-${crypto.randomUUID()}`);
    const workspaceId = `ws-escalation-${crypto.randomUUID()}`;
    await seedIfEmpty(db, workspaceId);

    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 2, yellows: 2 });
    expect(await db.settings.count()).toBe(1);

    clearSeeded(workspaceId);
    db.close();
  });
```

Add to that file's imports whatever is missing:

```ts
import { clearSeeded } from "@domain/workspaces";
import { readEscalation } from "./settings";
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test src/db/seed.test.ts -t "escalation"
```

Expected: FAIL — `readEscalation` returns the default because no row exists, so `db.settings.count()` is `0`.

(The rule value it returns happens to equal the default, so it is the **count** assertion that fails. That is deliberate: the point of this task is that the row exists in the export.)

- [ ] **Step 3: Write the seed**

In `src/db/seed.ts`:

1. Add to the imports:

```ts
import { DEFAULT_ESCALATION } from "@domain/escalation";
```
```ts
import { WORKSPACE_SETTINGS_ID } from "./settings";
```

2. Add `db.settings,` to the table array passed to `db.transaction("rw", [...])` (after `db.scheduleEntries,`).

3. Add inside the transaction body, after `await db.scheduleEntries.bulkAdd(scheduleEntries);`:

```ts
      // The teacher who asked for this runs two-over-two, and that is what a
      // demo school should demonstrate. A workspace created through
      // `createWorkspace` never reaches here — it is marked seeded
      // immediately — and reads `DEFAULT_ESCALATION` through the absent-row
      // fallback instead, which is the same rule by a different road.
      await db.settings.put({
        id: WORKSPACE_SETTINGS_ID,
        escalation: DEFAULT_ESCALATION,
      });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test src/db/seed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/db/seed.ts src/db/seed.test.ts
git commit -m "$(cat <<'MSG'
feat(seed): the demo school runs two yellows over two séances

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 5: Reading the rule against real rows

**Files:**
- Create: `src/db/escalation.ts`
- Create: `src/db/escalation.test.ts`

**Interfaces:**
- Consumes: `escalationWindow`, `yellowsInWindow`, `isEscalated`, `EscalationRule` (Task 1); `BehaviourEvent`, `AppDatabase`.
- Produces:
  - `interface EscalationContext { windowIds: string[]; yellowsByStudent: Map<string, BehaviourEvent[]> }`
  - `escalationContext(db: AppDatabase, classId: string, currentSessionId: string | null, rule: EscalationRule): Promise<EscalationContext>`
  - `interface StudentEscalation { yellows: BehaviourEvent[]; escalated: boolean }`
  - `evaluateEscalation(db: AppDatabase, args: { classId: string; studentId: string; sessionId: string; rule: EscalationRule }): Promise<StudentEscalation>`

- [ ] **Step 1: Write the failing test**

Create `src/db/escalation.test.ts`:

```ts
import "fake-indexeddb/auto";
import { DEFAULT_ESCALATION } from "@domain/escalation";
import { openWorkspaceDb } from ".";
import { logBehaviour } from "./behaviour";
import { escalationContext, evaluateEscalation } from "./escalation";

const CLASS_ID = "c1";

/** Three lessons of one class, a day apart, all at 8h. */
async function seedSeances(db: ReturnType<typeof openWorkspaceDb>): Promise<void> {
  await db.sessions.bulkAdd([
    { id: "s1", classId: CLASS_ID, date: 100, startsAt: 480, endsAt: 535, createdAt: 1 },
    { id: "s2", classId: CLASS_ID, date: 200, startsAt: 480, endsAt: 535, createdAt: 2 },
    { id: "s3", classId: CLASS_ID, date: 300, startsAt: 480, endsAt: 535, createdAt: 3 },
  ]);
}

async function yellow(
  db: ReturnType<typeof openWorkspaceDb>,
  sessionId: string,
  studentId: string,
): Promise<void> {
  await logBehaviour(db, { sessionId, studentId, classId: CLASS_ID, type: "yellow" });
}

describe("escalationContext", () => {
  it("collects the window's yellows per pupil", async () => {
    const db = openWorkspaceDb(`esc-ctx-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");
    await yellow(db, "s3", "p2");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual(["s2", "s3"]);
    expect(context.yellowsByStudent.get("p1")).toHaveLength(2);
    expect(context.yellowsByStudent.get("p2")).toHaveLength(1);
    db.close();
  });

  it("leaves out a yellow from outside the window", async () => {
    const db = openWorkspaceDb(`esc-out-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s1", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.yellowsByStudent.get("p1")).toBeUndefined();
    db.close();
  });

  it("leaves out another class's séance", async () => {
    const db = openWorkspaceDb(`esc-class-${crypto.randomUUID()}`);
    await seedSeances(db);
    await db.sessions.add({
      id: "other",
      classId: "c2",
      date: 250,
      startsAt: 480,
      endsAt: 535,
      createdAt: 4,
    });
    await logBehaviour(db, {
      sessionId: "other",
      studentId: "p1",
      classId: "c2",
      type: "yellow",
    });

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual(["s2", "s3"]);
    expect(context.yellowsByStudent.size).toBe(0);
    db.close();
  });

  it("is empty while the rule is off", async () => {
    const db = openWorkspaceDb(`esc-off-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", {
      ...DEFAULT_ESCALATION,
      enabled: false,
    });
    expect(context.windowIds).toEqual([]);
    expect(context.yellowsByStudent.size).toBe(0);
    db.close();
  });

  it("is empty when no séance exists yet", async () => {
    const db = openWorkspaceDb(`esc-none-${crypto.randomUUID()}`);
    await seedSeances(db);
    const context = await escalationContext(db, CLASS_ID, null, DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual([]);
    db.close();
  });

  it("returns the yellows oldest first", async () => {
    const db = openWorkspaceDb(`esc-order-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");
    await yellow(db, "s2", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    const created = (context.yellowsByStudent.get("p1") ?? []).map((e) => e.createdAt);
    expect(created).toEqual([...created].sort((a, b) => a - b));
    db.close();
  });
});

describe("evaluateEscalation", () => {
  it("escalates at exactly Y", async () => {
    const db = openWorkspaceDb(`esc-eval-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");

    const before = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(before.escalated).toBe(false);
    expect(before.yellows).toHaveLength(1);

    await yellow(db, "s3", "p1");
    const after = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(after.escalated).toBe(true);
    expect(after.yellows).toHaveLength(2);
    db.close();
  });

  it("escalates on two yellows in one séance", async () => {
    const db = openWorkspaceDb(`esc-same-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");
    await yellow(db, "s3", "p1");

    const state = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(state.escalated).toBe(true);
    db.close();
  });

  it("escalates again as the window slides", async () => {
    const db = openWorkspaceDb(`esc-slide-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s1", "p1");
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");

    const state = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(state.escalated).toBe(true);
    db.close();
  });

  it("writes nothing — no red event is ever stored", async () => {
    const db = openWorkspaceDb(`esc-nowrite-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");
    await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    // Filtered in memory, not `where("type")`: `behaviourEvents` is indexed
    // `"id, sessionId, studentId, classId, createdAt"` and has no `type` index,
    // so a `where` on it throws.
    const all = await db.behaviourEvents.toArray();
    expect(all.filter((event) => event.type === "red")).toHaveLength(0);
    expect(all).toHaveLength(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
yarn test src/db/escalation.test.ts
```

Expected: FAIL — `Cannot find module './escalation'`.

- [ ] **Step 3: Write the implementation**

Create `src/db/escalation.ts`:

```ts
import {
  type EscalationRule,
  escalationWindow,
  isEscalated,
  yellowsInWindow,
} from "@domain/escalation";
import type { AppDatabase, BehaviourEvent } from ".";

/**
 * The rule, read against real rows, for a WHOLE room at a time.
 *
 * Two queries, never one per seat: the class's séances, then the window's
 * events by `sessionId` — which is indexed. The plan page already reads the
 * current séance's events this way; this is the same shape widened to X
 * séances, and it must stay that way, because a class is up to a hundred
 * pupils and this runs on a tablet.
 *
 * NOTHING here writes. The red card is derived, and `logBehaviour` stays the
 * only thing that adds a row.
 */
export interface EscalationContext {
  /** The séance ids the rule is counting over, oldest first. */
  windowIds: string[];
  /** Only pupils with at least one yellow in the window appear. */
  yellowsByStudent: Map<string, BehaviourEvent[]>;
}

export async function escalationContext(
  db: AppDatabase,
  classId: string,
  currentSessionId: string | null,
  rule: EscalationRule,
): Promise<EscalationContext> {
  // Off is off: no window, so the seat draws no history and nothing is at red.
  // A fresh Map every time, never a shared empty one — a caller that wrote to
  // a module-level constant would be writing to every other caller's answer.
  if (!rule.enabled || currentSessionId === null) {
    return { windowIds: [], yellowsByStudent: new Map() };
  }

  const sessions = await db.sessions.where("classId").equals(classId).toArray();
  const windowIds = escalationWindow(sessions, currentSessionId, rule);
  if (windowIds.length === 0) return { windowIds, yellowsByStudent: new Map() };

  // `sortBy` rather than a sort afterwards: the seat draws these oldest first,
  // and `createdAt` is the only order a behaviour log has.
  const rows = await db.behaviourEvents.where("sessionId").anyOf(windowIds).sortBy("createdAt");

  const yellowsByStudent = new Map<string, BehaviourEvent[]>();
  for (const row of yellowsInWindow(rows, windowIds)) {
    const list = yellowsByStudent.get(row.studentId) ?? [];
    list.push(row);
    yellowsByStudent.set(row.studentId, list);
  }
  return { windowIds, yellowsByStudent };
}

export interface StudentEscalation {
  /** This pupil's yellows in the window, oldest first. */
  yellows: BehaviourEvent[];
  escalated: boolean;
}

/**
 * One pupil, for the moment a yellow is handed in.
 *
 * Built on `escalationContext` rather than on a narrower query: the extra rows
 * are one class's yellows over a handful of séances, and one code path means
 * the tap and the tile can never disagree about who is at red.
 */
export async function evaluateEscalation(
  db: AppDatabase,
  {
    classId,
    studentId,
    sessionId,
    rule,
  }: { classId: string; studentId: string; sessionId: string; rule: EscalationRule },
): Promise<StudentEscalation> {
  const context = await escalationContext(db, classId, sessionId, rule);
  const yellows = context.yellowsByStudent.get(studentId) ?? [];
  return { yellows, escalated: isEscalated(yellows.length, rule) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test src/db/escalation.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/db/escalation.ts src/db/escalation.test.ts
git commit -m "$(cat <<'MSG'
feat(db): read the escalation rule against real rows

Two queries for a whole room, never one per seat — and nothing writes, because
the red card is derived.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 6: The translation keys

**Files:**
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Produces: a top-level `escalation.*` key used by Tasks 7–10. A key shared by four surfaces belongs to none of them — the ruling `attendance.*` and `calendar.*` already got.

- [ ] **Step 1: Run the parity test to see it green before you start**

```bash
yarn test -t "locale"
```

Expected: PASS (this is the guard you are about to lean on).

- [ ] **Step 2: Add the French keys**

In `src/i18n/locales/fr.json`, add a top-level `"escalation"` object (put it after `"behaviour"` so the file reads in a sensible order):

```json
  "escalation": {
    "title": "Cartons automatiques",
    "hint": "Un carton rouge automatique quand un élève accumule assez d'avertissements sur les dernières séances.",
    "on": "Activé",
    "off": "Désactivé",
    "yellowsLabel": "Avertissements",
    "seancesLabel": "Dernières séances",
    "rule": "{{yellows}} avertissements sur {{seances}} séances donnent un carton rouge.",
    "ruleOff": "Aucun carton rouge automatique.",
    "redCard": "Carton rouge automatique",
    "overlayTitle": "Carton rouge",
    "windowCount_one": "{{count}} avertissement sur les {{seances}} dernières séances",
    "windowCount_other": "{{count}} avertissements sur les {{seances}} dernières séances"
  },
```

- [ ] **Step 3: Add the English keys**

In `src/i18n/locales/en.json`, at the matching position:

```json
  "escalation": {
    "title": "Automatic cards",
    "hint": "An automatic red card when a pupil collects enough warnings over recent lessons.",
    "on": "On",
    "off": "Off",
    "yellowsLabel": "Warnings",
    "seancesLabel": "Recent lessons",
    "rule": "{{yellows}} warnings over {{seances}} lessons make a red card.",
    "ruleOff": "No automatic red cards.",
    "redCard": "Automatic red card",
    "overlayTitle": "Red card",
    "windowCount_one": "{{count}} warning over the last {{seances}} lessons",
    "windowCount_other": "{{count}} warnings over the last {{seances}} lessons"
  },
```

`count` is deliberate on `windowCount` — it is the one variable here that should resolve a plural. `seances` and `yellows` are plain interpolations and must NOT be named `count`.

- [ ] **Step 4: Run the parity test**

```bash
yarn test -t "locale"
```

Expected: PASS — both files carry the same key set.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "$(cat <<'MSG'
feat(i18n): escalation keys, top level

Réglages, the pupil card, the seat label and the overlay all draw from them, so
they belong to none of those four.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 7: The fullscreen red card

**Files:**
- Create: `src/modules/shared/use-escalation-rule.ts`
- Create: `src/modules/shared/components/red-card-overlay.tsx`
- Create: `src/modules/shared/components/escalation-provider.tsx`
- Modify: `src/modules/shared/components/admin-layout.tsx`
- Modify: `src/styles/global.css` (two keyframes)

**Interfaces:**
- Consumes: `readEscalation` (Task 2), `DEFAULT_ESCALATION`/`EscalationRule` (Task 1), `escalation.*` keys (Task 6), `useDb` (`@db/provider`), `useMediaQuery` and `useEscape` (`src/modules/shared/`), `PupilName`, `Student`.
- Produces:
  - `useEscalationRule(): EscalationRule`
  - `EscalationProvider({ children }: { children: ReactNode })`
  - `useAnnounceRedCard(): (student: Student) => void`

- [ ] **Step 1: Write the rule hook**

Create `src/modules/shared/use-escalation-rule.ts`:

```ts
import { useDb } from "@db/provider";
import { readEscalation } from "@db/settings";
import { DEFAULT_ESCALATION, type EscalationRule } from "@domain/escalation";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * The workspace's rule, live.
 *
 * `db` is in the dependency array, which is not optional anywhere in this app:
 * switching école re-opens the database, and a live query that forgets it goes
 * on answering with the previous school's row.
 *
 * The default stands in while the query is in flight. That is the same answer
 * an absent row gives, and it is only ever read by a surface that draws
 * nothing until it has counts to draw.
 */
export function useEscalationRule(): EscalationRule {
  const db = useDb();
  return useLiveQuery(() => readEscalation(db), [db]) ?? DEFAULT_ESCALATION;
}
```

- [ ] **Step 2: Add the keyframes**

Append to `src/styles/global.css`:

```css
/* The automatic red card's entrance. It is one of exactly two animations in
   this app, and it is deliberately short: the overlay dwells 2.5s and then
   leaves on its own, so the motion has to be finished well before a teacher
   would think about tapping it away. */
@keyframes escalation-pop {
  from {
    opacity: 0;
    transform: scale(0.6) rotate(-6deg);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes escalation-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

- [ ] **Step 3: Write the overlay**

Create `src/modules/shared/components/red-card-overlay.tsx`:

```tsx
import type { Student } from "@db";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";
import { useEscape } from "../use-escape";
import { useMediaQuery } from "../use-media-query";

/** Long enough to be seen from across a room, short enough not to be waited on. */
const DWELL_MS = 2500;

/**
 * The moment a run of avertissements becomes a carton rouge.
 *
 * NOT a `<dialog>`, and not any blocking browser dialog — those are banned
 * here, and they freeze the automation these screens are verified with. It is
 * an ordinary fixed element above everything, and it leaves ON ITS OWN: a
 * teacher mid-lesson never has to find a button, and a tablet cannot be left
 * sitting on a red card instead of on the register.
 *
 * There is deliberately no *Annuler* on it. The moment after a mis-tap is
 * exactly when a wrong red is most likely — and the undo already sits one tap
 * away in the pupil card's own event list, where deleting the YELLOW is the
 * honest correction, since the red was never the thing that happened.
 *
 * `role="status"` with a polite live region rather than `alert`: the pupil's
 * name is read out once, and nothing here takes focus.
 */
export function RedCardOverlay({ student, onDone }: { student: Student; onDone: () => void }) {
  const { t } = useTranslation();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEscape(onDone);

  useEffect(() => {
    const timer = window.setTimeout(onDone, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it and it
    // closes itself; the click is a convenience for a finger, and the element
    // is a status region rather than a control.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgb(0 0 0 / 55%)" }}
      role="status"
      aria-live="polite"
      onClick={onDone}
    >
      <div
        className="flex flex-col items-center gap-4 rounded-lg px-10 py-14 text-center"
        style={{
          background: "var(--behaviour-red)",
          color: "var(--on-behaviour-red)",
          minWidth: "min(80vw, 420px)",
          boxShadow: "0 12px 40px rgb(0 0 0 / 45%)",
          animation: reduced
            ? "escalation-fade 240ms ease-out"
            : "escalation-pop 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2)",
        }}
      >
        <span className="font-semibold text-sm uppercase tracking-widest">
          {t("escalation.overlayTitle")}
        </span>
        <span className="font-bold text-3xl">
          <PupilName student={student} />
        </span>
      </div>
    </div>
  );
}
```

If the `biome-ignore` rule name above does not match what `yarn lint` reports, replace it with the exact rule Biome names in its output.

- [ ] **Step 4: Write the provider**

Create `src/modules/shared/components/escalation-provider.tsx`:

```tsx
import type { Student } from "@db";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { RedCardOverlay } from "./red-card-overlay";

/**
 * One overlay for the whole app.
 *
 * The pupil card is rendered from two places — a seat on the plan, and a row of
 * the salle-less roster register — and each mounting an overlay of its own
 * would put two red cards on screen the day a third surface appears. Announcing
 * is a call; the overlay lives at the root.
 */
const AnnounceContext = createContext<(student: Student) => void>(() => {});

export function useAnnounceRedCard(): (student: Student) => void {
  return useContext(AnnounceContext);
}

interface Announced {
  student: Student;
  /** Changes on every announcement, so a SECOND red for the same pupil
      remounts the overlay and replays the entrance rather than sitting there
      unchanged. The rule keeps firing as the window slides; the animation has
      to keep up with it. */
  at: number;
}

export function EscalationProvider({ children }: { children: ReactNode }) {
  const [announced, setAnnounced] = useState<Announced | null>(null);

  const announce = useCallback((student: Student) => {
    setAnnounced({ student, at: Date.now() });
  }, []);

  const dismiss = useCallback(() => setAnnounced(null), []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      {announced && (
        <RedCardOverlay key={announced.at} student={announced.student} onDone={dismiss} />
      )}
    </AnnounceContext.Provider>
  );
}
```

- [ ] **Step 5: Mount it**

In `src/modules/shared/components/admin-layout.tsx`:

1. Add the import:

```tsx
import { EscalationProvider } from "./escalation-provider";
```

2. Wrap the returned tree. The outermost `<div className="min-h-screen">` becomes the provider's child:

```tsx
  return (
    <EscalationProvider>
      <div className="min-h-screen">
        {/* …everything that is already there, unchanged… */}
      </div>
    </EscalationProvider>
  );
```

The overlay is `z-50` and the hamburger is `z-30`, so the card covers the chrome as well as the page.

- [ ] **Step 6: Typecheck and lint**

```bash
yarn format && yarn lint && yarn typecheck
```

Expected: all green. There is no test here — this codebase has deliberately no component tests.

- [ ] **Step 7: Verify in a real browser**

```bash
yarn dev
```

Then, in the running app: open a class with a salle, tap a pupil, and hand in yellows until the rule fires (the demo school seeds 2/2, so two yellows in one séance is enough). Check all four:

1. The card fills the screen, the surname is in capitals, and it leaves by itself after about 2.5 seconds.
2. A tap dismisses it early.
3. Escape dismisses it.
4. A second red for the same pupil replays the entrance rather than doing nothing.

Then set the OS to reduced motion and confirm the pop becomes a plain fade of the same length.

- [ ] **Step 8: Commit**

```bash
git add src/modules/shared/use-escalation-rule.ts src/modules/shared/components/red-card-overlay.tsx src/modules/shared/components/escalation-provider.tsx src/modules/shared/components/admin-layout.tsx src/styles/global.css
git commit -m "$(cat <<'MSG'
feat(escalation): the fullscreen red card

An ordinary fixed element, never a dialog, and it leaves on its own — a teacher
mid-lesson should not have to find a button, and a tablet must not be left
sitting on a red card instead of on the register.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 8: Firing it, and saying why

**Files:**
- Modify: `src/modules/plan/components/student-card.tsx`

**Interfaces:**
- Consumes: `evaluateEscalation` (Task 5), `useEscalationRule` (Task 7), `useAnnounceRedCard` (Task 7), `escalation.windowCount` / `escalation.redCard` (Task 6).
- Produces: nothing new — this is the write path and the explanation.

- [ ] **Step 1: Add the imports**

At the top of `src/modules/plan/components/student-card.tsx`:

```tsx
import { evaluateEscalation } from "@db/escalation";
```
```tsx
import { useAnnounceRedCard } from "../../shared/components/escalation-provider";
import { useEscalationRule } from "../../shared/use-escalation-rule";
```

- [ ] **Step 2: Read the rule and this pupil's standing**

Inside the component, after the existing `events` live query:

```tsx
  const rule = useEscalationRule();
  const announce = useAnnounceRedCard();

  /**
   * Where this pupil stands against the rule, for the lesson on screen.
   *
   * A live query, so deleting one of the yellows below re-reads it and the
   * line goes away — which is the whole reason the red is derived rather than
   * written. The rule's three fields are in the dependency array individually:
   * `useEscalationRule` rebuilds its object on every live-query tick, and
   * passing the object would re-run this read forever.
   */
  const standing = useLiveQuery(async () => {
    if (!session || !rule.enabled) return null;
    return evaluateEscalation(db, {
      classId: student.classId,
      studentId: student.id,
      sessionId: session.id,
      rule,
    });
  }, [db, session?.id, student.id, student.classId, rule.enabled, rule.seances, rule.yellows]);
```

- [ ] **Step 3: Announce on a yellow**

Replace the existing `addBehaviour` with:

```tsx
  const addBehaviour = async (type: BehaviourType): Promise<void> => {
    if (record === null) return;
    const sessionId = await record();
    await logBehaviour(db, {
      sessionId,
      studentId: student.id,
      classId: student.classId,
      type,
      comment,
    });
    setComment("");
    // Read AFTER the write, and against `sessionId` rather than `session` from
    // this render — the séance may have been brought into being by the line
    // above. No "crossing" test: the rule keeps firing as the window slides,
    // so a third yellow over a still-qualifying window announces again.
    if (type === "yellow" && rule.enabled) {
      const { escalated } = await evaluateEscalation(db, {
        classId: student.classId,
        studentId: student.id,
        sessionId,
        rule,
      });
      if (escalated) announce(student);
    }
  };
```

- [ ] **Step 4: Say why, above the buttons**

Inside the behaviour block, immediately after `<span …>{t("behaviour.title")}</span>` and before the `<div className="flex flex-wrap gap-2">` holding the type buttons:

```tsx
            {/* The only place the rule explains itself in words, which is what
                lets the seat tile stay silent. Hidden at zero: a teacher who
                has handed in nothing does not need telling so. */}
            {standing && standing.yellows.length > 0 && (
              <p
                className={standing.escalated ? "font-semibold text-sm" : "text-sm text-text-muted"}
                style={standing.escalated ? { color: "var(--behaviour-red)" } : undefined}
              >
                {t("escalation.windowCount", {
                  count: standing.yellows.length,
                  seances: rule.seances,
                })}
                {standing.escalated ? ` — ${t("escalation.redCard")}` : ""}
              </p>
            )}
```

- [ ] **Step 5: Typecheck and lint**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 6: Verify in a real browser**

```bash
yarn dev
```

1. Open a class, tap a pupil, hand in one yellow — the line reads "1 avertissement sur les 2 dernières séances" in muted text, no overlay.
2. Hand in a second — the line turns red and gains "Carton rouge automatique", and the overlay plays.
3. Delete one of the two yellows in the list below: the line drops back to one and goes muted **without a reload**. This is the derived design's whole payoff — check it.
4. Hand in a green or a note: no overlay, and the line does not move.

- [ ] **Step 7: Commit**

```bash
git add src/modules/plan/components/student-card.tsx
git commit -m "$(cat <<'MSG'
feat(escalation): the pupil card fires the red and says why

Read after the write and against the returned session id, since the yellow may
have brought the séance into being. Deleting a yellow walks the line back — the
payoff of deriving rather than storing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 9: The seat tile

**Files:**
- Modify: `src/modules/plan/components/seat-occupant.tsx`
- Modify: `src/modules/plan/page.tsx`

**Interfaces:**
- Consumes: `escalationContext` (Task 5), `isEscalated` (Task 1), `useEscalationRule` (Task 7), `escalation.redCard` / `escalation.windowCount` (Task 6).
- Produces:
  - `SeatOccupant` gains `priorYellows: BehaviourEvent[]` and `escalated: boolean`.
  - `useSeatLabel()` returns `(student, attendance, events, priorYellows, escalated, seances) => string`.

- [ ] **Step 1: Rework the card run in `seat-occupant.tsx`**

Change `MAX_CARDS` and add a card model above the component:

```tsx
/**
 * Four, not three, and it is one run rather than two.
 *
 * The tile now carries three kinds of thing — the window's earlier yellows, this
 * séance's events, and the derived red — and two runs with two overflow counts
 * on a 44px tile is a puzzle rather than a reading. Over budget, slots are
 * dropped from the LEFT and `+n` goes there, so the newest events and the red
 * are never what falls off.
 */
const MAX_CARDS = 4;

interface SeatCard {
  key: string;
  /** `prior` draws hollow; the other two draw filled. */
  kind: "prior" | "current" | "derived";
  type: BehaviourType;
}
```

Add `BehaviourType` to the existing `@domain/behaviour` import.

- [ ] **Step 2: Widen the props and build the run**

Change the component's signature and the top of its body:

```tsx
export function SeatOccupant({
  student,
  attendance,
  events,
  priorYellows,
  escalated,
}: {
  student: Student;
  /** This pupil's mark for the séance on screen, or null when nobody marked. */
  attendance: AttendanceValue | null;
  /** Their events for that same séance, oldest first. */
  events: BehaviourEvent[];
  /**
   * Their yellows from the EARLIER séances of the escalation window, oldest
   * first. Only yellows, and only from inside the window: these are precisely
   * what the rule is counting, so the seat reads as the rule itself — two
   * hollow plus one solid IS the red. A past green or a past mot dans le
   * carnet would be history this tile was never for, and with a budget of four
   * it would push out the one fact the history exists to carry.
   */
  priorYellows: BehaviourEvent[];
  /** Whether the rule says this pupil is at red right now. */
  escalated: boolean;
}) {
  const all: SeatCard[] = [
    ...priorYellows.map((event) => ({
      key: event.id,
      kind: "prior" as const,
      type: event.type,
    })),
    ...events.map((event) => ({ key: event.id, kind: "current" as const, type: event.type })),
    // Last in the run, hard against the face — the consequence, closest to the
    // person. It draws as an ORDINARY red card: at 9px, "red" is the entire
    // message, and marking it as derived would cost more pixels than the
    // distinction buys. The word lives in `useSeatLabel` instead, which is
    // where the attendance pill already puts its own.
    ...(escalated
      ? [{ key: "derived-red", kind: "derived" as const, type: "red" as BehaviourType }]
      : []),
  ];
  const overflow = Math.max(0, all.length - MAX_CARDS);
  const cards = all.slice(overflow);
```

- [ ] **Step 3: Draw them**

Replace the existing `{events.length > 0 && ( … )}` block with:

```tsx
        {cards.length > 0 && (
          <span className="-top-1 -left-3 absolute flex items-start gap-[1px]">
            {overflow > 0 && (
              <span
                className="mr-[1px] font-bold text-[9px] leading-none"
                style={{ color: "var(--desk-ink)" }}
              >
                +{overflow}
              </span>
            )}
            {cards.map((card) => (
              <span
                key={card.key}
                className="block h-[13px] w-[9px] rounded-[1px]"
                style={
                  card.kind === "prior"
                    ? {
                        // Hollow, not literally dashed: a dashed stroke on a
                        // 9×13px box is about four dashes and reads as noise at
                        // the scale a room shrinks to — the same argument that
                        // turned the behaviour dot into a rectangle. The inset
                        // ring is the border; the outer ring is the white
                        // separation every card on this tile carries.
                        background:
                          "color-mix(in srgb, var(--behaviour-yellow) 22%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px var(--behaviour-yellow), 0 0 0 1px rgb(255 255 255 / 80%)",
                      }
                    : {
                        background: BEHAVIOUR_COLORS[card.type],
                        boxShadow:
                          "0 0 0 1px rgb(255 255 255 / 80%), 0 1px 2px var(--room-shadow)",
                      }
                }
              />
            ))}
          </span>
        )}
```

- [ ] **Step 4: Widen the label**

Replace `useSeatLabel` with:

```tsx
export function useSeatLabel(): (
  student: Student,
  attendance: AttendanceValue | null,
  events: BehaviourEvent[],
  priorYellows: BehaviourEvent[],
  escalated: boolean,
  seances: number,
) => string {
  const { t } = useTranslation();

  return (student, attendance, events, priorYellows, escalated, seances) => {
    const parts = [`${student.lastName} ${student.firstName}`];
    if (attendance) parts.push(t(`attendance.${attendance}`));
    for (const type of new Set(events.map((event) => event.type))) {
      const count = events.filter((event) => event.type === type).length;
      parts.push(`${t(`behaviour.${type}`)} × ${count}`);
    }
    // The hollow cards are shape alone on screen; the count of them is the
    // word that stands for it.
    const windowYellows =
      priorYellows.length + events.filter((event) => event.type === "yellow").length;
    if (windowYellows > 0) {
      parts.push(t("escalation.windowCount", { count: windowYellows, seances }));
    }
    // And the derived red is colour alone, so it says its own name here.
    if (escalated) parts.push(t("escalation.redCard"));
    return parts.join(" — ");
  };
}
```

- [ ] **Step 5: Wire the plan page**

In `src/modules/plan/page.tsx`:

1. Add the imports:

```tsx
import { escalationContext } from "@db/escalation";
import { isEscalated } from "@domain/escalation";
import { useEscalationRule } from "../shared/use-escalation-rule";
```

2. After the existing `eventsOf` live query, add:

```tsx
  const rule = useEscalationRule();

  /**
   * The escalation window for the whole room — two queries, not one per seat.
   * The rule's fields go into the dependency array individually because
   * `useEscalationRule` returns a fresh object on every live-query tick.
   */
  const escalation = useLiveQuery(
    () => escalationContext(db, classId, session?.id ?? null, rule),
    [db, classId, session?.id, rule.enabled, rule.seances, rule.yellows],
  );

  /**
   * What one seat says about the rule.
   *
   * Built once and used by BOTH the tile and its accessible name, so the
   * drawing and the word it stands for cannot drift — the pairing
   * `useSeatLabel` exists to enforce.
   */
  const seatFacts = useCallback(
    (studentId: string) => {
      const windowYellows = escalation?.yellowsByStudent.get(studentId) ?? [];
      return {
        priorYellows: windowYellows.filter((event) => event.sessionId !== session?.id),
        escalated: isEscalated(windowYellows.length, rule),
      };
    },
    [escalation, session?.id, rule],
  );
```

(`useCallback` is already imported in this file; confirm it and add it to the React import if not.)

3. In the `<SeatOccupant … />` call, pass the two new props:

```tsx
                const facts = seatFacts(student.id);
                return (
                  <SeatOccupant
                    student={student}
                    attendance={attendanceOf?.get(student.id) ?? null}
                    events={eventsOf?.get(student.id) ?? []}
                    priorYellows={facts.priorYellows}
                    escalated={facts.escalated}
                  />
                );
```

4. In `placeProps`, widen the `seatLabel` call:

```tsx
                const label = seated
                  ? seatLabel(
                      seated,
                      attendanceOf?.get(seated.id) ?? null,
                      eventsOf?.get(seated.id) ?? [],
                      seatFacts(seated.id).priorYellows,
                      seatFacts(seated.id).escalated,
                      rule.seances,
                    )
                  : undefined;
```

Hoist `seatFacts(seated.id)` into a `const facts = seated ? seatFacts(seated.id) : null;` above it rather than calling it twice.

- [ ] **Step 6: Typecheck and lint**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 7: Verify in a real browser**

```bash
yarn dev
```

Against the demo school (sixteen classes seated in *Salle de musique*, so there is real behaviour history):

1. Find a pupil with a yellow in the previous séance. Their seat draws a hollow card; the current séance's events stay solid.
2. Hand in a yellow today — a solid yellow appears to the right of the hollow one, and a red card appears last, against the face.
3. Hover or read the seat's `title`: it names the attendance word, the counts, "2 avertissements sur les 2 dernières séances" and "Carton rouge automatique".
4. Shrink the window to 375px wide. The cards must still be distinguishable — hollow from solid, yellow from red — at the scale the floor settles to.
5. Switch Réglages to `ardoise` and check the hollow card is still visible against the dark floor.
6. Turn escalation off in Réglages (Task 10 builds that control — do this step after Task 10 if you are working in order) and confirm every hollow card and every derived red disappears.

- [ ] **Step 8: Commit**

```bash
git add src/modules/plan/components/seat-occupant.tsx src/modules/plan/page.tsx
git commit -m "$(cat <<'MSG'
feat(plan): the window's yellows, hollow, on the seat

One run of four with the overflow on the left, so the newest events and the
derived red are never what falls off. Hollow rather than dashed — four dashes on
a 9px box is noise at the scale a room shrinks to.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 10: The control in Réglages

**Files:**
- Modify: `src/modules/settings/page.tsx`

**Interfaces:**
- Consumes: `readEscalation` / `writeEscalation` (Task 2), the `MIN_*`/`MAX_*` constants and `clampRule` (Task 1), `escalation.*` keys (Task 6), `ToggleGroup` / `ToggleOption` from `design-system/components/primitives`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add the imports**

```tsx
import { readEscalation, writeEscalation } from "@db/settings";
import {
  clampRule,
  DEFAULT_ESCALATION,
  MAX_ESCALATION_SEANCES,
  MAX_ESCALATION_YELLOWS,
  MIN_ESCALATION_SEANCES,
  MIN_ESCALATION_YELLOWS,
} from "@domain/escalation";
import { ToggleGroup, ToggleOption } from "../design-system/components/primitives";
```

`ToggleOption` may already be imported in this file — check before adding.

- [ ] **Step 2: Read the rule**

Inside `SettingsPage`, beside the other live queries:

```tsx
  const escalation = useLiveQuery(() => readEscalation(db), [db]) ?? DEFAULT_ESCALATION;
  /**
   * The two numbers as typed, so a teacher going from 2 to 10 is not clamped
   * back to the floor by the "1" they pass through. Null means "showing the
   * stored value"; a string means they are mid-edit. Written on BLUR.
   */
  const [draftYellows, setDraftYellows] = useState<string | null>(null);
  const [draftSeances, setDraftSeances] = useState<string | null>(null);
```

- [ ] **Step 3: Add the section**

Place it after the Thème section (so preferences sit together, before the destructive blocks):

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("escalation.title")}</h2>
        <p className="text-sm text-text-muted">{t("escalation.hint")}</p>

        <ToggleGroup>
          <ToggleOption
            selected={escalation.enabled}
            onSelect={() => void writeEscalation(db, { ...escalation, enabled: true })}
          >
            {t("escalation.on")}
          </ToggleOption>
          <ToggleOption
            selected={!escalation.enabled}
            onSelect={() => void writeEscalation(db, { ...escalation, enabled: false })}
          >
            {t("escalation.off")}
          </ToggleOption>
        </ToggleGroup>

        {/* Disabled rather than hidden while the rule is off: a teacher turning
            it back on should find the numbers they set, not a row that appeared
            from nowhere. */}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("escalation.yellowsLabel")}</span>
            <input
              type="number"
              className="field max-w-28"
              min={MIN_ESCALATION_YELLOWS}
              max={MAX_ESCALATION_YELLOWS}
              disabled={!escalation.enabled}
              value={draftYellows ?? String(escalation.yellows)}
              onChange={(e) => setDraftYellows(e.target.value)}
              onBlur={() => {
                const next = clampRule({ ...escalation, yellows: Number(draftYellows) });
                setDraftYellows(null);
                if (next.yellows !== escalation.yellows) void writeEscalation(db, next);
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("escalation.seancesLabel")}</span>
            <input
              type="number"
              className="field max-w-28"
              min={MIN_ESCALATION_SEANCES}
              max={MAX_ESCALATION_SEANCES}
              disabled={!escalation.enabled}
              value={draftSeances ?? String(escalation.seances)}
              onChange={(e) => setDraftSeances(e.target.value)}
              onBlur={() => {
                const next = clampRule({ ...escalation, seances: Number(draftSeances) });
                setDraftSeances(null);
                if (next.seances !== escalation.seances) void writeEscalation(db, next);
              }}
            />
          </label>
        </div>

        {/* The rule in a sentence, so two numbers in two boxes cannot be read
            backwards. */}
        <p className="text-sm text-text-faint">
          {escalation.enabled
            ? t("escalation.rule", {
                yellows: escalation.yellows,
                seances: escalation.seances,
              })
            : t("escalation.ruleOff")}
        </p>
      </section>
```

`max-w-28` and not `w-auto`: `.field` sets `width: 100%` and beats a utility at equal specificity — the same ordering trap `CalendarNav`'s date field documents.

- [ ] **Step 4: Typecheck and lint**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 5: Verify in a real browser**

```bash
yarn dev
```

1. Réglages shows *Cartons automatiques*, set to Activé, 2 and 2, with the sentence reading "2 avertissements sur 2 séances donnent un carton rouge."
2. Type `10` into *Dernières séances* and tab away — the sentence follows. Reload: it is still 10.
3. Type `1` into *Avertissements* and tab away — it clamps to 2, because a one-yellow rule is renaming the button.
4. Switch to Désactivé — both fields grey out, the sentence becomes "Aucun carton rouge automatique."
5. Go back to a class: no hollow cards, no derived red, no overlay on a yellow.
6. Export a backup, wipe the workspace in Réglages, import it back, and confirm the rule returns as it was set rather than as 2/2.

- [ ] **Step 6: Commit**

```bash
git add src/modules/settings/page.tsx
git commit -m "$(cat <<'MSG'
feat(settings): X, Y and the switch

Written on blur, so a teacher passing through "1" on the way to "10" is not
clamped back to the floor under their finger. The rule is restated in a sentence
because two numbers in two boxes can be read backwards.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

### Task 11: The documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-11-profs-behaviour-escalation-design.md` (status line)

**Interfaces:** none.

`CLAUDE.md` is how the next person reads this codebase. Three of its existing claims are now stale, and the new rule needs a home.

- [ ] **Step 1: Fix the stale claims**

1. In *Schema changes are disposable*: every mention of `db.version(17)` becomes `db.version(18)`, and the sentence "The rule for the next change is unchanged: add a table or a field, bump to 18, write no upgrade function" becomes "…bump to 19…". Add one sentence recording that 18 was that next change, and that the one `.upgrade()` callback rode along to it because it is idempotent for a workspace already at 17.
2. In *The journal is not a cahier de textes*: "The backup format is **13**, and it alone is accepted" becomes **14**, with a sentence saying 13 is refused because it carries no `settings` row and a workspace whose discipline rule silently reverted to the default on import is exactly the half-import that paragraph refuses.
3. In *Invariants worth knowing*, under **Behaviour events are append-only**: add that the automatic red is DERIVED and adds no row, so the invariant is untouched, and that `countByType` and the pupil page's timeline stay a record of what was observed.

- [ ] **Step 2: Add the section**

Add a new `### Yellow cards escalate, and the red is derived` under *The class is the page* (after the *Tous présents* paragraphs). Cover, in this codebase's voice:

- The rule, its default (2/2), and that it comes from a practising teacher's own classroom.
- Why the red is derived rather than stored — a stored red goes stale against a moved threshold and orphans against a deleted yellow, and a `BehaviourEvent` records what was **observed**.
- The window is the CLASS's last X séances, current included; why not per-pupil (attendance is lazy, and two pupils in one room would be judged on different stretches of the term); why not the timetable (nothing is materialised from it).
- The rule is stateless and re-fires as the window slides; no yellow is ever "consumed".
- `MIN_ESCALATION_YELLOWS` is 2, and why.
- The setting is a DB row rather than `localStorage`, because it describes the établissement and must ride the export.
- The seat: one run of four, overflow on the left, hollow rather than dashed, and the derived red drawn as an ordinary red card with its word in `useSeatLabel`.
- The overlay is not a dialog, leaves on its own, and has no *Annuler* — the undo is deleting the yellow.
- Point at the spec.

- [ ] **Step 3: Mark the spec implemented**

Change its `Status: designed, not implemented.` to `Status: implemented.`

- [ ] **Step 4: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-11-profs-behaviour-escalation-design.md
git commit -m "$(cat <<'MSG'
docs: the escalation rule, and three claims it made stale

Schema is at 18, the backup format at 14, and the append-only invariant now says
why a derived red does not bend it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01A2tEhwZym3V5vScsFxiCsj
MSG
)"
```

---

## Verification Checklist

Before calling the feature done, confirm each of these in a real browser against `yarn dev`:

- [ ] Two yellows in one séance fire the overlay; one does not.
- [ ] A yellow today plus one last lesson fires it.
- [ ] A yellow from three lessons ago does not, at 2/2.
- [ ] A third yellow over a still-qualifying window fires again.
- [ ] Deleting a yellow in the pupil card walks the line back and clears the seat's red, live, with no reload.
- [ ] Escalation off: no overlay, no hollow cards, no derived red anywhere.
- [ ] The pupil page's Comportement block and its counts are unchanged — no invented red appears there.
- [ ] Export → wipe → import restores the rule as set.
- [ ] The seat is readable at 375px in both `copie` and `ardoise`.
- [ ] `yarn format && yarn lint && yarn typecheck && yarn test` is green.
