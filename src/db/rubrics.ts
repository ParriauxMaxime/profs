import type { RubricCriterion } from "@domain/rubric";
import type { AppDatabase } from ".";

/**
 * Writes for rubric templates. The levels a teacher taps live in
 * `criterion-levels.ts`, since they are written against a COLUMN rather than
 * against a template.
 *
 * A template's criteria are COPIED into a column, never referenced. A
 * reference would be smaller, and wrong: a teacher who improves next year's
 * oral grid must not silently rewrite the grid they graded last term with it.
 */

export function newCriterion(label: string): RubricCriterion {
  return { id: crypto.randomUUID(), label };
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
