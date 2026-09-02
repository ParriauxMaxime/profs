/**
 * Working groups within a class.
 *
 * A group is a way of selecting and viewing pupils — for seating, for
 * filtering a roster — and deliberately not a thing that holds a grade. Marks
 * belong to a pupil, and a group whose membership changes must never
 * retroactively change what a pupil scored.
 */

export const MAX_GROUP_NAME = 40;

export function normaliseGroupName(raw: string): string {
  return raw.trim().slice(0, MAX_GROUP_NAME);
}

/** Every group a pupil belongs to, in the order the groups were given. */
export function groupsForStudent<T extends { id: string }>(
  groups: T[],
  memberships: { groupId: string; studentId: string }[],
  studentId: string,
): T[] {
  const mine = new Set(memberships.filter((m) => m.studentId === studentId).map((m) => m.groupId));
  return groups.filter((g) => mine.has(g.id));
}
