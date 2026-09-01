/**
 * Periods: the trimesters or semesters a gradebook is divided into.
 *
 * The default names are stored values, not labels — a period's name is typed
 * by the teacher and shown verbatim, so it is never translated on display. The
 * French default matches the app's default locale, exactly as the demo school
 * has always been seeded.
 */

export const DEFAULT_PERIOD_NAMES = ["Trimestre 1", "Trimestre 2", "Trimestre 3"] as const;

/**
 * The `order` an appended period should take: one past the highest in use.
 *
 * Counting the existing periods would collide after a deletion in the middle,
 * where the orders have a gap but the highest is still above the count.
 */
export function nextPeriodOrder(periods: readonly { order: number }[]): number {
  if (periods.length === 0) return 0;
  return Math.max(...periods.map((period) => period.order)) + 1;
}
