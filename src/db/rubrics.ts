import type { RubricCriterion, RubricLevel } from "@domain/rubric";
import type { AppDatabase } from ".";
import { rubricScoreKey } from ".";

/**
 * Writes for rubric templates and the levels recorded against a column.
 *
 * A template's criteria are COPIED into a column, never referenced. A
 * reference would be smaller, and wrong: a teacher who improves next year's
 * oral grid must not silently rewrite the grid they graded last term with it.
 */

export function newCriterion(label: string): RubricCriterion {
  return { id: crypto.randomUUID(), label };
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

/**
 * One cell, one `put`. Never read-modify-write a collection of scores — the
 * compound key means a single row write is always enough.
 */
export async function setScore(
  db: AppDatabase,
  assessmentId: string,
  criterionId: string,
  studentId: string,
  level: RubricLevel,
): Promise<void> {
  await db.rubricScores.put({
    assessmentId,
    criterionId,
    studentId,
    level,
    updatedAt: Date.now(),
  });
}

/** One cell, one `delete`. Leaves every other pupil and criterion untouched. */
export async function clearScore(
  db: AppDatabase,
  assessmentId: string,
  criterionId: string,
  studentId: string,
): Promise<void> {
  await db.rubricScores.delete(rubricScoreKey(assessmentId, criterionId, studentId));
}

/**
 * Create or update a template in one call.
 *
 * The component that edits a template must not decide between `add` and
 * `update`, nor mint the id and timestamps: that is a write, and writes live
 * here where they can be tested. Passing no `templateId` creates.
 */
export async function saveTemplate(
  db: AppDatabase,
  input: { templateId?: string; name: string; criteria: RubricCriterion[] },
): Promise<string> {
  const now = Date.now();
  const name = input.name.trim();
  if (name.length === 0) throw new Error("a rubric template needs a name");

  if (input.templateId !== undefined) {
    await db.rubricTemplates.update(input.templateId, {
      name,
      criteria: input.criteria,
      updatedAt: now,
    });
    return input.templateId;
  }

  const id = crypto.randomUUID();
  await db.rubricTemplates.add({
    id,
    name,
    criteria: input.criteria,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
