import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import type { AppDatabase, Gradebook } from ".";

/**
 * Create a gradebook together with its trimesters.
 *
 * The two writes share one transaction because a gradebook with no period
 * renders an empty grid with nowhere to put a column — a state that must not
 * exist, not even between two awaits.
 */
export async function createGradebookWithPeriods(
  db: AppDatabase,
  {
    classId,
    subjectId,
    name,
  }: {
    classId: string;
    subjectId: string;
    name: string;
  },
): Promise<Gradebook> {
  const now = Date.now();
  const gradebook: Gradebook = {
    id: crypto.randomUUID(),
    classId,
    subjectId,
    name,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", [db.gradebooks, db.periods], async () => {
    await db.gradebooks.add(gradebook);
    await db.periods.bulkAdd(
      DEFAULT_PERIOD_NAMES.map((periodName, order) => ({
        id: crypto.randomUUID(),
        gradebookId: gradebook.id,
        name: periodName,
        order,
      })),
    );
  });

  return gradebook;
}
