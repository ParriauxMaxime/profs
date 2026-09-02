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

/**
 * The id a filter should actually use: `selectedGroupId` unchanged if it
 * names one of `groups`, otherwise `null` ("Tous").
 *
 * Shared by every `GroupFilter` caller so a group deleted out from under a
 * held selection falls back the same way everywhere, rather than each
 * caller re-deriving the check and one of them forgetting it.
 */
export function resolveGroupSelection(
  groups: { id: string }[],
  selectedGroupId: string | null,
): string | null {
  if (selectedGroupId === null) return null;
  return groups.some((g) => g.id === selectedGroupId) ? selectedGroupId : null;
}

/**
 * Pupils in `groupId`, or every pupil when `groupId` is `null` ("Tous").
 * Pair with `resolveGroupSelection` so a vanished selection is treated as
 * "Tous" here too, not as an empty result.
 */
export function filterByGroup<T extends { id: string }>(
  students: T[],
  memberships: { groupId: string; studentId: string }[],
  groupId: string | null,
): T[] {
  if (groupId === null) return students;
  const ids = new Set(memberships.filter((m) => m.groupId === groupId).map((m) => m.studentId));
  return students.filter((s) => ids.has(s.id));
}
