# Phase 2B — Rubrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Competency grids — a reusable set of criteria scored 1–4 per pupil, filled live during an oral or a practical, on a phone held in one hand.

**Architecture:** Three tables added at Dexie `version(3)`: `rubricTemplates` (reusable criteria sets, managed in Réglages), `rubricAssessments` (a template's criteria **copied** onto one gradebook and period), and `rubricScores` (compound key `[assessmentId+criterionId+studentId]`, mirroring `grades`). Criteria are embedded on template and assessment; scores are their own table. Rubrics never feed a gradebook average — `average.ts` is not touched.

**Tech Stack:** React 19, TypeScript strict, Dexie 4 + dexie-react-hooks, Chicane, Tailwind v4, i18next, zod, Jest + ts-jest + fake-indexeddb, Biome.

**Spec:** `docs/superpowers/specs/2026-09-01-profs-phase2-classroom-design.md`

**Depends on:** Plan A (`2026-09-01-profs-phase2a-classroom.md`). Plan A settles `version(2)`; this plan bumps to `version(3)`.

## Global Constraints

Identical to Plan A — repeated here because a task's requirements implicitly include this section and no executor should have to open the other plan:

- **No network request of any kind.**
- **No `window.confirm`, `alert`, `prompt`, or any blocking browser dialog.** Destructive actions use the two-step `ConfirmButton`.
- **i18n parity:** every string through `t()`, every key in BOTH `fr.json` and `en.json`. Plurals use i18next v4 suffixes (`_one` / `_other`); never pass `count` unless plural resolution is wanted.
- **Stored values are raw domain values, never translated labels.**
- **Identifiers are English; only translation values are French.**
- **Compound-key rows are never read-modify-written as a collection.** One score is one `put` or one `delete`.
- **State bound to a record is anchored to that record's identity, never its position.** Every armed/staged/draft state gets a `key` on the record id.
- **Navigation uses Chicane `<Link to={Router.X({...})}>`.**
- IDs from `crypto.randomUUID()`; timestamps epoch-ms from `Date.now()`.
- **Rubrics never contribute to any average.** `src/domain/gradebook/average.ts` must be byte-identical before and after this plan.
- **Validation gate:** `yarn format && yarn lint && yarn typecheck && yarn test`.

---

## File Structure

**Created:**
- `src/domain/rubric.ts` — levels, criteria, summary maths
- `src/domain/rubric.test.ts`
- `src/db/rubrics.ts` — assessment creation from a template
- `src/db/rubrics.test.ts`
- `src/modules/rubric/page.tsx` — assessment list for a gradebook
- `src/modules/rubric/grid.tsx` — the live grid
- `src/modules/rubric/components/assessment-form.tsx`
- `src/modules/rubric/components/level-buttons.tsx`
- `src/modules/rubric/components/criteria-editor.tsx`
- `src/modules/settings/components/rubric-template-form.tsx`

**Modified:**
- `src/db/types.ts`, `src/db/index.ts` — three tables, `rubricScoreKey`
- `src/db/cascade.ts`, `src/db/cascade.test.ts`
- `src/db/backup.ts`, `src/db/backup.test.ts` — `version: 3`
- `src/db/seed.ts` — one template, one assessment, scores
- `src/router.ts`, `src/app.tsx`
- `src/modules/gradebook/page.tsx` — link to rubrics
- `src/modules/settings/page.tsx` — template management
- `src/i18n/locales/fr.json`, `en.json`
- `CLAUDE.md`, `docs/BACKLOG.md`

---

### Task 1: The rubric domain

**Files:**
- Create: `src/domain/rubric.ts`, `src/domain/rubric.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RUBRIC_LEVELS`, `RubricLevel`, `RUBRIC_LEVEL_COLORS`, `RubricCriterion`, `isRubricLevel`, `criterionMean`, `studentMean`, `levelDistribution`.

- [ ] **Step 1: Write the failing test**

Create `src/domain/rubric.test.ts`:

```ts
import {
  criterionMean,
  isRubricLevel,
  levelDistribution,
  RUBRIC_LEVELS,
  RUBRIC_LEVEL_COLORS,
  studentMean,
} from "./rubric";

describe("levels", () => {
  it("runs 1 to 4", () => {
    expect(RUBRIC_LEVELS).toEqual([1, 2, 3, 4]);
  });

  it("gives every level a colour", () => {
    for (const level of RUBRIC_LEVELS) {
      expect(RUBRIC_LEVEL_COLORS[level]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("recognises only the four levels", () => {
    expect(isRubricLevel(1)).toBe(true);
    expect(isRubricLevel(4)).toBe(true);
    expect(isRubricLevel(0)).toBe(false);
    expect(isRubricLevel(5)).toBe(false);
    expect(isRubricLevel(2.5)).toBe(false);
    expect(isRubricLevel("3")).toBe(false);
  });
});

describe("studentMean", () => {
  const scores = [
    { criterionId: "c1", studentId: "p1", level: 4 as const },
    { criterionId: "c2", studentId: "p1", level: 3 as const },
    { criterionId: "c1", studentId: "p2", level: 1 as const },
  ];

  it("averages one pupil's levels", () => {
    expect(studentMean(scores, "p1")).toBe(3.5);
  });

  it("ignores other pupils", () => {
    expect(studentMean(scores, "p2")).toBe(1);
  });

  it("is null when a pupil has no score — never zero", () => {
    expect(studentMean(scores, "p3")).toBeNull();
  });

  it("rounds to two decimals", () => {
    expect(
      studentMean(
        [
          { criterionId: "a", studentId: "p", level: 1 as const },
          { criterionId: "b", studentId: "p", level: 1 as const },
          { criterionId: "c", studentId: "p", level: 2 as const },
        ],
        "p",
      ),
    ).toBe(1.33);
  });
});

describe("criterionMean", () => {
  it("averages one criterion across pupils", () => {
    expect(
      criterionMean(
        [
          { criterionId: "c1", studentId: "p1", level: 4 as const },
          { criterionId: "c1", studentId: "p2", level: 2 as const },
          { criterionId: "c2", studentId: "p1", level: 1 as const },
        ],
        "c1",
      ),
    ).toBe(3);
  });

  it("is null for an unscored criterion", () => {
    expect(criterionMean([], "c1")).toBeNull();
  });
});

describe("levelDistribution", () => {
  it("counts pupils at each level for one criterion", () => {
    expect(
      levelDistribution(
        [
          { criterionId: "c1", studentId: "p1", level: 4 as const },
          { criterionId: "c1", studentId: "p2", level: 4 as const },
          { criterionId: "c1", studentId: "p3", level: 1 as const },
          { criterionId: "c2", studentId: "p1", level: 2 as const },
        ],
        "c1",
      ),
    ).toEqual({ 1: 1, 2: 0, 3: 0, 4: 2 });
  });

  it("returns all zeros for an unscored criterion", () => {
    expect(levelDistribution([], "c1")).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `yarn test src/domain/rubric.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/domain/rubric.ts`**

```ts
/**
 * Competency grids: criteria scored 1 to 4.
 *
 * A level is deliberately not a mark. It never enters a gradebook average —
 * normalising "en cours d'acquisition" onto a /20 scale would invent a
 * precision the assessment does not have. The means computed here are for
 * reading a grid, not for a bulletin.
 */

export const RUBRIC_LEVELS = [1, 2, 3, 4] as const;

export type RubricLevel = (typeof RUBRIC_LEVELS)[number];

/**
 * Colour and label both carry the meaning: colour alone fails a colour-blind
 * reader, and the number alone is slow to scan across a filled grid.
 */
export const RUBRIC_LEVEL_COLORS: Record<RubricLevel, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#16a34a",
  4: "#2563eb",
};

/** One thing being assessed. No weight: nothing downstream depends on one. */
export interface RubricCriterion {
  id: string;
  label: string;
}

export interface RubricScoreLike {
  criterionId: string;
  studentId: string;
  level: RubricLevel;
}

export function isRubricLevel(value: unknown): value is RubricLevel {
  return RUBRIC_LEVELS.some((level) => level === value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(levels: number[]): number | null {
  if (levels.length === 0) return null;
  return round2(levels.reduce((sum, l) => sum + l, 0) / levels.length);
}

/** One pupil across every criterion. Null when they have no score at all. */
export function studentMean(scores: RubricScoreLike[], studentId: string): number | null {
  return mean(scores.filter((s) => s.studentId === studentId).map((s) => s.level));
}

/** One criterion across every pupil — what the class found hard. */
export function criterionMean(scores: RubricScoreLike[], criterionId: string): number | null {
  return mean(scores.filter((s) => s.criterionId === criterionId).map((s) => s.level));
}

export type LevelDistribution = Record<RubricLevel, number>;

/** How many pupils sit at each level for one criterion. Every level present. */
export function levelDistribution(
  scores: RubricScoreLike[],
  criterionId: string,
): LevelDistribution {
  const counts = Object.fromEntries(RUBRIC_LEVELS.map((l) => [l, 0])) as LevelDistribution;
  for (const score of scores) {
    if (score.criterionId === criterionId) counts[score.level] += 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/domain/rubric.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/rubric.ts src/domain/rubric.test.ts
git commit -m "feat: add the rubric level domain"
```

---

### Task 2: Schema v3

**Files:**
- Modify: `src/db/types.ts`, `src/db/index.ts`
- Modify: `src/db/index.test.ts`

**Interfaces:**
- Consumes: `RubricCriterion`, `RubricLevel`.
- Produces: `RubricTemplate`, `RubricAssessment`, `RubricScore`; `rubricScoreKey(assessmentId, criterionId, studentId)`; three tables.

- [ ] **Step 1: Add the row types**

In `src/db/types.ts`:

```ts
/** A reusable criteria set, managed in Réglages. */
export interface RubricTemplate {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One assessment of one gradebook's class against a set of criteria.
 *
 * `criteria` is a COPY taken when a template was attached, never a reference:
 * editing the template afterwards must not rewrite a grid already graded.
 */
export interface RubricAssessment {
  id: string;
  gradebookId: string;
  periodId: string;
  sessionId?: string;
  name: string;
  date: number;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

/** One cell. Keyed [assessmentId+criterionId+studentId]. */
export interface RubricScore {
  assessmentId: string;
  criterionId: string;
  studentId: string;
  level: RubricLevel;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing test**

Add to `src/db/index.test.ts`:

```ts
it("builds a rubric score key", () => {
  expect(rubricScoreKey("a1", "c1", "p1")).toEqual(["a1", "c1", "p1"]);
});

it("round-trips a score on its compound key", async () => {
  const db = openWorkspaceDb(`rubric-${crypto.randomUUID()}`);
  await db.rubricScores.put({
    assessmentId: "a1",
    criterionId: "c1",
    studentId: "p1",
    level: 2,
    updatedAt: 1,
  });
  await db.rubricScores.put({
    assessmentId: "a1",
    criterionId: "c1",
    studentId: "p1",
    level: 4,
    updatedAt: 2,
  });
  expect(await db.rubricScores.count()).toBe(1);
  expect((await db.rubricScores.get(rubricScoreKey("a1", "c1", "p1")))?.level).toBe(4);
  db.close();
});
```

Update the table-name assertion to include `rubricAssessments`, `rubricScores`, `rubricTemplates`.

- [ ] **Step 3: Run to see it fail**

Run: `yarn test src/db/index.test.ts`
Expected: FAIL — `rubricScoreKey` is not exported.

- [ ] **Step 4: Implement**

In `src/db/index.ts`, extend `AppDatabase`:

```ts
  rubricTemplates: EntityTable<RubricTemplate, "id">;
  rubricAssessments: EntityTable<RubricAssessment, "id">;
  rubricScores: Table<RubricScore, [string, string, string]>;
```

Add the key constructor:

```ts
/** The compound primary key of one rubric cell. */
export function rubricScoreKey(
  assessmentId: string,
  criterionId: string,
  studentId: string,
): [string, string, string] {
  return [assessmentId, criterionId, studentId];
}
```

Add a `version(3)` block **beside** the `version(2)` block (Dexie needs the chain; unlike Plan A's clean break there is now a released v2 shape in the same session's databases, and adding a version with no upgrade callback is the cheap correct move):

```ts
  db.version(3).stores({
    rubricTemplates: "id, name",
    rubricAssessments: "id, gradebookId, periodId, date",
    rubricScores: "[assessmentId+criterionId+studentId], assessmentId, criterionId, studentId",
  });
```

Dexie carries forward unchanged stores, so only the new ones are listed.

- [ ] **Step 5: Run tests and commit**

```bash
git add src/db/types.ts src/db/index.ts src/db/index.test.ts
git commit -m "feat: add the rubric tables at schema v3"
```

---

### Task 3: Assessments from templates

**Files:**
- Create: `src/db/rubrics.ts`, `src/db/rubrics.test.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `RubricTemplate`, `RubricAssessment`, `RubricCriterion`.
- Produces: `newCriterion(label)`, `createAssessment(db, input)`, `createAssessmentFromTemplate(db, templateId, input)`, `setCriteria(db, assessmentId, criteria)`.

- [ ] **Step 1: Write the failing test**

Create `src/db/rubrics.test.ts`:

```ts
import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { createAssessment, createAssessmentFromTemplate, newCriterion, setCriteria } from "./rubrics";

function freshDb() {
  return openWorkspaceDb(`rubrics-${crypto.randomUUID()}`);
}

describe("newCriterion", () => {
  it("gives each criterion its own id", () => {
    expect(newCriterion("Clarté").id).not.toBe(newCriterion("Clarté").id);
  });
});

describe("createAssessmentFromTemplate", () => {
  it("copies the template's criteria rather than referencing them", async () => {
    const db = freshDb();
    const criteria = [newCriterion("Clarté"), newCriterion("Contenu")];
    await db.rubricTemplates.add({
      id: "t1",
      name: "Oral",
      criteria,
      createdAt: 1,
      updatedAt: 1,
    });

    const assessment = await createAssessmentFromTemplate(db, "t1", {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral du 12 mars",
    });

    expect(assessment.criteria.map((c) => c.label)).toEqual(["Clarté", "Contenu"]);

    // Editing the template afterwards must not touch the graded assessment.
    await db.rubricTemplates.update("t1", { criteria: [newCriterion("Autre chose")] });
    const reloaded = await db.rubricAssessments.get(assessment.id);
    expect(reloaded?.criteria.map((c) => c.label)).toEqual(["Clarté", "Contenu"]);
    db.close();
  });

  it("throws for an unknown template rather than creating an empty grid", async () => {
    const db = freshDb();
    await expect(
      createAssessmentFromTemplate(db, "nope", {
        gradebookId: "g1",
        periodId: "pe1",
        name: "x",
      }),
    ).rejects.toThrow();
    db.close();
  });
});

describe("setCriteria", () => {
  it("deletes the scores of a removed criterion", async () => {
    const db = freshDb();
    const a = await createAssessment(db, {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      criteria: [newCriterion("Clarté"), newCriterion("Contenu")],
    });
    const [first, second] = a.criteria;
    await db.rubricScores.bulkPut([
      { assessmentId: a.id, criterionId: first.id, studentId: "p1", level: 3, updatedAt: 1 },
      { assessmentId: a.id, criterionId: second.id, studentId: "p1", level: 4, updatedAt: 1 },
    ]);

    await setCriteria(db, a.id, [first]);

    expect(await db.rubricScores.count()).toBe(1);
    expect((await db.rubricScores.toArray())[0].criterionId).toBe(first.id);
    expect((await db.rubricAssessments.get(a.id))?.criteria).toHaveLength(1);
    db.close();
  });

  it("keeps every score when criteria are only reordered", async () => {
    const db = freshDb();
    const a = await createAssessment(db, {
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      criteria: [newCriterion("A"), newCriterion("B")],
    });
    await db.rubricScores.bulkPut(
      a.criteria.map((c) => ({
        assessmentId: a.id,
        criterionId: c.id,
        studentId: "p1",
        level: 2 as const,
        updatedAt: 1,
      })),
    );
    await setCriteria(db, a.id, [...a.criteria].reverse());
    expect(await db.rubricScores.count()).toBe(2);
    db.close();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `yarn test src/db/rubrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/db/rubrics.ts`**

```ts
import type { RubricCriterion } from "@domain/rubric";
import type { AppDatabase, RubricAssessment } from ".";

/**
 * Assessments are built from templates by copying.
 *
 * A reference would be smaller, and wrong: a teacher who improves next year's
 * oral grid must not silently rewrite the grid they graded last term with it.
 */

export function newCriterion(label: string): RubricCriterion {
  return { id: crypto.randomUUID(), label };
}

export interface NewAssessment {
  gradebookId: string;
  periodId: string;
  name: string;
  criteria?: RubricCriterion[];
  sessionId?: string;
  date?: number;
}

export async function createAssessment(
  db: AppDatabase,
  input: NewAssessment,
): Promise<RubricAssessment> {
  const now = Date.now();
  const assessment: RubricAssessment = {
    id: crypto.randomUUID(),
    gradebookId: input.gradebookId,
    periodId: input.periodId,
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    name: input.name,
    date: input.date ?? now,
    criteria: input.criteria ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await db.rubricAssessments.add(assessment);
  return assessment;
}

export async function createAssessmentFromTemplate(
  db: AppDatabase,
  templateId: string,
  input: Omit<NewAssessment, "criteria">,
): Promise<RubricAssessment> {
  const template = await db.rubricTemplates.get(templateId);
  if (!template) throw new Error(`unknown rubric template: ${templateId}`);
  return await createAssessment(db, {
    ...input,
    // Fresh ids: two assessments from one template must not share criterion
    // ids, or a score written on one would be readable from the other.
    criteria: template.criteria.map((c) => ({ id: crypto.randomUUID(), label: c.label })),
  });
}

/**
 * Replace an assessment's criteria, dropping the scores of any that go.
 *
 * A criterion's scores are unreachable once it is gone — invisible in the
 * grid, never summarised, still carried by export — so this is a cascade and
 * belongs beside the write, in one transaction.
 */
export async function setCriteria(
  db: AppDatabase,
  assessmentId: string,
  criteria: RubricCriterion[],
): Promise<void> {
  await db.transaction("rw", [db.rubricAssessments, db.rubricScores], async () => {
    const keep = new Set(criteria.map((c) => c.id));
    const scores = await db.rubricScores.where("assessmentId").equals(assessmentId).toArray();
    const doomed = scores.filter((s) => !keep.has(s.criterionId));
    if (doomed.length > 0) {
      await db.rubricScores.bulkDelete(
        doomed.map((s) => [s.assessmentId, s.criterionId, s.studentId] as [string, string, string]),
      );
    }
    await db.rubricAssessments.update(assessmentId, { criteria, updatedAt: Date.now() });
  });
}
```

- [ ] **Step 4: Run tests and commit**

```bash
git add src/db/rubrics.ts src/db/rubrics.test.ts
git commit -m "feat: create rubric assessments by copying a template"
```

---

### Task 4: Cascades, backup, seed

**Files:**
- Modify: `src/db/cascade.ts`, `src/db/cascade.test.ts`, `src/db/backup.ts`, `src/db/backup.test.ts`, `src/db/seed.ts`

**Interfaces:**
- Produces: `deleteRubricAssessment`, `deleteRubricTemplate`; widened `deleteStudent`, `deleteGradebook`, `deleteClass`; backup `version: 3`.

- [ ] **Step 1: Write the failing tests**

Add to `src/db/cascade.test.ts`:

```ts
describe("deleteRubricAssessment", () => {
  it("takes its scores and leaves another assessment's alone", async () => {
    const db = freshDb("rubric-assessment");
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.bulkPut([
      { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
      { assessmentId: "a2", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
    ]);
    await deleteRubricAssessment(db, "a1");
    expect(await db.rubricAssessments.count()).toBe(0);
    expect(await db.rubricScores.count()).toBe(1);
    db.close();
  });
});

describe("deleteStudent — rubric scores", () => {
  it("takes the pupil's scores", async () => {
    const db = freshDb("rubric-student");
    await db.rubricScores.bulkPut([
      { assessmentId: "a1", criterionId: "c1", studentId: "p1", level: 3, updatedAt: 1 },
      { assessmentId: "a1", criterionId: "c1", studentId: "p2", level: 2, updatedAt: 1 },
    ]);
    await deleteStudent(db, "p1");
    expect(await db.rubricScores.count()).toBe(1);
    db.close();
  });
});

describe("deleteGradebook — rubric assessments", () => {
  it("leaves zero orphan scores", async () => {
    const db = freshDb("rubric-gradebook");
    await db.rubricAssessments.add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria: [],
      createdAt: 1,
      updatedAt: 1,
    });
    await db.rubricScores.put({
      assessmentId: "a1",
      criterionId: "c1",
      studentId: "p1",
      level: 1,
      updatedAt: 1,
    });
    await deleteGradebook(db, "g1");
    expect(await db.rubricAssessments.count()).toBe(0);
    expect(await db.rubricScores.count()).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run to see them fail, then implement**

`deleteStudent` gains `db.rubricScores` to its transaction list and `await db.rubricScores.where("studentId").equals(studentId).delete();`.

`deleteGradebook` gains `db.rubricAssessments`, `db.rubricScores` and:

```ts
    const assessmentIds = await db.rubricAssessments
      .where("gradebookId")
      .equals(gradebookId)
      .primaryKeys();
    if (assessmentIds.length > 0) {
      await db.rubricScores.where("assessmentId").anyOf(assessmentIds).delete();
      await db.rubricAssessments.bulkDelete(assessmentIds);
    }
```

`deleteClass` gains the same sweep over its gradebooks' assessments, with both tables added to its transaction list.

`deletePeriod` gains a sweep for assessments naming that period — an assessment whose period is gone is unreachable in the UI.

New:

```ts
/** An assessment and every level recorded on it. */
export async function deleteRubricAssessment(db: AppDatabase, assessmentId: string): Promise<void> {
  await db.transaction("rw", [db.rubricAssessments, db.rubricScores], async () => {
    await db.rubricScores.where("assessmentId").equals(assessmentId).delete();
    await db.rubricAssessments.delete(assessmentId);
  });
}

/**
 * A template holds nothing of its own — assessments copied its criteria — so
 * deleting one destroys no grades and needs no refusal, unlike `deleteSubject`.
 */
export async function deleteRubricTemplate(db: AppDatabase, templateId: string): Promise<void> {
  await db.rubricTemplates.delete(templateId);
}
```

- [ ] **Step 3: Backup v3**

`WorkspaceBackup` moves to `version: 3` with `rubricTemplates`, `rubricAssessments`, `rubricScores`; the schema literal becomes `z.literal(3)`; version 2 is rejected, same as Plan A rejects version 1. Add a round-trip test covering an assessment's embedded criteria and its scores.

- [ ] **Step 4: Seed**

Seed one template ("Exposé oral" with four criteria: Clarté, Contenu, Support, Interaction), one assessment per gradebook built from it, and levels for roughly two thirds of the pupils via the existing deterministic LCG — a partially filled grid is a more honest demo than a complete one.

- [ ] **Step 5: Run the gate and commit**

```bash
git add src/db
git commit -m "feat: cascade, export and seed the rubric tables"
```

---

### Task 5: Templates in Réglages

**Files:**
- Create: `src/modules/settings/components/rubric-template-form.tsx`
- Create: `src/modules/rubric/components/criteria-editor.tsx`
- Modify: `src/modules/settings/page.tsx`, both locale files

**Interfaces:**
- Consumes: `newCriterion`, `deleteRubricTemplate`.
- Produces: `<CriteriaEditor value onChange />`, reused by the assessment form in Task 6.

- [ ] **Step 1: Build the criteria editor**

`criteria-editor.tsx`: an ordered list of text inputs, each with a remove button and up/down reorder buttons, plus an "add criterion" button. It is a controlled component over `RubricCriterion[]` — the whole list is the value, which is the honest shape here since criteria are edited as a set. Every row is keyed on `criterion.id`, never the index; reordering with index keys would move the focused input's contents to a different criterion.

- [ ] **Step 2: Build the template form and section**

`rubric-template-form.tsx`: a name field and a `CriteriaEditor`, saving through `db.rubricTemplates.put`. Keyed by the caller on the template id, `"new"` for creation — the v1 `StudentForm` bug in a new disguise.

In `settings/page.tsx`, add a rubric-template section beside subjects: a list with edit and `ConfirmButton` delete per template, the delete keyed on template id, and an add button.

- [ ] **Step 3: Translations**

```json
"rubric": {
  "title": "Grilles d'évaluation",
  "templates": "Modèles de grille",
  "newTemplate": "Nouveau modèle",
  "templateName": "Nom du modèle",
  "noTemplates": "Aucun modèle",
  "criteria": "Critères",
  "addCriterion": "Ajouter un critère",
  "criterionLabel": "Intitulé",
  "moveUp": "Monter",
  "moveDown": "Descendre",
  "confirmDeleteTemplate": "Supprimer ce modèle ?",
  "assessments": "Évaluations",
  "newAssessment": "Nouvelle évaluation",
  "assessmentName": "Intitulé",
  "fromTemplate": "À partir d'un modèle",
  "blank": "Grille vierge",
  "noAssessments": "Aucune évaluation",
  "confirmDeleteAssessment": "Supprimer cette évaluation et ses {{count}} niveaux ?",
  "noCriteria": "Ajoutez un critère pour commencer",
  "notFound": "Évaluation introuvable",
  "mean": "Moyenne",
  "distribution": "Répartition",
  "level": {
    "1": "Non acquis",
    "2": "En cours d'acquisition",
    "3": "Acquis",
    "4": "Expert"
  }
}
```

English mirrors it. `confirmDeleteAssessment` uses `count`, so both `_one` and `_other` forms are required.

- [ ] **Step 4: Verify in the browser, run the gate, commit**

Create a template with three criteria, reorder them, rename one, delete one, reload and confirm it persisted. Then:

```bash
git add src/modules/settings src/modules/rubric src/i18n/locales
git commit -m "feat: manage rubric templates in Réglages"
```

---

### Task 6: The assessment list

**Files:**
- Create: `src/modules/rubric/page.tsx`, `src/modules/rubric/components/assessment-form.tsx`
- Modify: `src/router.ts`, `src/app.tsx`, `src/modules/gradebook/page.tsx`

**Interfaces:**
- Produces: `Router.Rubrics({ gradebookId })`, `Router.Rubric({ gradebookId, assessmentId })`.

- [ ] **Step 1: Routes**

```ts
    Rubrics: "/gradebooks/:gradebookId/rubrics",
    Rubric: "/gradebooks/:gradebookId/rubrics/:assessmentId",
```

Wire both into `app.tsx` exactly as Plan A wired `Plan` and `Student`.

- [ ] **Step 2: The list page**

`rubric/page.tsx`: assessments for the gradebook, newest first, each a `Link` to its grid showing name, formatted date (app locale via `i18n.language`, never the browser default), criterion count, and how many pupils have at least one level. A `ConfirmButton` delete per row, keyed on assessment id, its label naming the score count. `t("rubric.noAssessments")` when empty.

- [ ] **Step 3: The creation form**

`assessment-form.tsx`: a name, a period select defaulting to the gradebook's active period, and a source — either a template (calling `createAssessmentFromTemplate`) or a blank grid with an inline `CriteriaEditor`. On submit, navigate to the new assessment's grid.

- [ ] **Step 4: Link from the gradebook**

Add a `Link` to `Router.Rubrics({ gradebookId })` in the gradebook page header, labelled `t("rubric.title")`.

- [ ] **Step 5: Verify, run the gate, commit**

---

### Task 7: The live grid

**Files:**
- Create: `src/modules/rubric/grid.tsx`, `src/modules/rubric/components/level-buttons.tsx`

**Interfaces:**
- Consumes: `RUBRIC_LEVELS`, `RUBRIC_LEVEL_COLORS`, `rubricScoreKey`, `studentMean`, `levelDistribution`.

This is the feature's reason for existing — the teacher fills it while a pupil is presenting. Everything else in this plan supports it.

- [ ] **Step 1: `level-buttons.tsx`**

Four buttons in a row, one per level. Each shows its translated label with the number small beside it, is at least 44px tall, takes an equal share of the width, and carries `aria-pressed` for the selected level. Colours from `RUBRIC_LEVEL_COLORS`; the selected one is filled, the others outlined — colour is never the only difference, since the label and `aria-pressed` both carry the state.

Tapping a level writes it. Tapping the already-selected level clears it (`db.rubricScores.delete(rubricScoreKey(...))`) — one tap in, one tap out, no dialog, and a mis-tap is recoverable.

- [ ] **Step 2: The grid, phone shape first**

`grid.tsx` in narrow viewports: a criterion switcher (previous / criterion name and position / next), then a vertical list of pupils, each row being the pupil's name over a `LevelButtons`. This is the same shape as v1's saisie rapide, which is the proven in-class loop.

The selected criterion is held as a **criterion id**, not an index — the identity-anchoring rule. If the criteria list changes underneath (another tab, an edit), an id that no longer exists falls back to the first criterion rather than pointing at whatever now sits at that position.

- [ ] **Step 3: The desktop matrix**

At `md` and above, render the full matrix: pupils down, criteria across, each cell a compact four-way selector. The whole table scrolls inside its own `overflow-x-auto`; the page body never scrolls sideways. The pupil-name column is pinned left, as the gradebook grid pins it.

- [ ] **Step 4: Reporting**

Below the grid: each pupil's `studentMean` as a coloured chip, and per criterion a `levelDistribution` bar with counts. State plainly in the UI, once, that these levels do not enter the gradebook average — a teacher seeing a mean of 3.2 beside a gradebook is entitled to assume it counts, and it does not.

- [ ] **Step 5: Verify in the browser — this is the acceptance test**

With `yarn dev` at a 375px viewport:

- Every level button is at least 44px tall and reachable one-handed.
- One tap sets a level; the next pupil's row is immediately tappable; there is no save button anywhere.
- Tapping the same level again clears it.
- Moving to the next criterion preserves every level already set.
- A reload restores the whole grid.
- Deleting a criterion from the assessment removes exactly its scores and no others.
- Nothing in the gradebook's averages changes as a result of any of it — check a pupil's average before and after filling a grid.

Record the phone-shape flow as a GIF.

- [ ] **Step 6: Run the gate and commit**

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/BACKLOG.md`, `README.md`

- [ ] **Step 1: `CLAUDE.md`**

- The three rubric tables and the `version(3)` bump.
- The invariant that rubrics never feed averages, and that `average.ts` counts only numeric columns — unchanged by phase 2.
- Why criteria are embedded while scores are a table.
- Why `createAssessmentFromTemplate` copies with fresh criterion ids.
- The identity-anchoring list gains the selected criterion.

- [ ] **Step 2: `docs/BACKLOG.md`**

Mark item 1 delivered. Record what was deliberately not built: criterion weights, rubric-to-average conversion, cross-class rubric reporting.

- [ ] **Step 3: `README.md`** — add rubrics to the feature list.

- [ ] **Step 4: Commit**

---

## Self-Review

**Spec coverage.** Template library with copy-on-attach (T3), gradebook + period ownership (T2, T6), no criterion weights (T1 — `RubricCriterion` is `{ id, label }`), 1–4 with colour and label (T1, T7), live phone-first entry (T7), per-pupil mean and per-criterion distribution (T1, T7), never feeding averages (T1 doc comment, T7 Step 4 UI statement, T7 Step 5 verification), cascades (T4).

**Placeholders.** Tasks 5, 6, and 7 specify component behaviour rather than transcribing markup, for the same reason as Plan A: the risky logic is in the domain and database layers, which carry complete code and tests, and each UI task ends with a named list of things to prove in a browser. Task 7's verification list is the acceptance test for the whole plan.

**Type consistency.** `RubricLevel` is the literal union `1 | 2 | 3 | 4`, used identically in `RubricScore.level` and `RUBRIC_LEVEL_COLORS`. `RubricCriterion` is defined once, in `@domain/rubric`, and imported by `db/types.ts` — never redeclared. `rubricScoreKey` returns `[string, string, string]`, matching `Table<RubricScore, ...>`. `RubricScoreLike` exists so the domain maths does not depend on the DB row's `updatedAt`.

**Cross-plan hazard.** Plan A's `deleteStudent` already lists five tables; this plan adds a sixth. An executor applying Task 4 to a `deleteStudent` that has not had Plan A's changes will produce a broken merge — Plan A must be complete first, as the header states.
