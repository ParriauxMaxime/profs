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
