import type { RubricCriterion, RubricLevel } from "@domain/rubric";
import type { AppDatabase } from ".";
import { criterionLevelKey } from ".";

/**
 * Every write to a level recorded against a rubric column.
 *
 * One cell, one row. Never read-modify-write a collection of these — the
 * compound key means a single row write is always enough, which is what keeps
 * two fast taps mid-lesson from losing one.
 */

/** One cell, one `put`. */
export async function setLevel(
  db: AppDatabase,
  columnId: string,
  criterionId: string,
  studentId: string,
  level: RubricLevel,
): Promise<void> {
  await db.criterionLevels.put({
    columnId,
    criterionId,
    studentId,
    level,
    updatedAt: Date.now(),
  });
}

/** One cell, one `delete`. Leaves every other pupil and critère untouched. */
export async function clearLevel(
  db: AppDatabase,
  columnId: string,
  criterionId: string,
  studentId: string,
): Promise<void> {
  await db.criterionLevels.delete(criterionLevelKey(columnId, criterionId, studentId));
}

/**
 * Replace a column's critères, dropping the levels of any that go.
 *
 * A removed critère's levels are unreachable — invisible in the grid, never
 * summarised, still carried by export — so this is a cascade and belongs
 * beside the write, in one transaction.
 */
export async function setColumnCriteria(
  db: AppDatabase,
  columnId: string,
  criteria: RubricCriterion[],
): Promise<void> {
  await db.transaction("rw", [db.columns, db.criterionLevels], async () => {
    const keep = new Set(criteria.map((criterion) => criterion.id));
    const levels = await db.criterionLevels.where("columnId").equals(columnId).toArray();
    const doomed = levels.filter((row) => !keep.has(row.criterionId));
    if (doomed.length > 0) {
      await db.criterionLevels.bulkDelete(
        doomed.map((row) => criterionLevelKey(row.columnId, row.criterionId, row.studentId)),
      );
    }
    await db.columns.update(columnId, { criteria });
  });
}
