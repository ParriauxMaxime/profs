import { normaliseGroupName } from "@domain/group";
import type { AppDatabase } from ".";
import { groupMemberKey } from ".";

/**
 * Create or update a group in one call.
 *
 * The component that edits a group must not decide between `add` and
 * `update`, nor mint the id and timestamps: that is a write, and writes live
 * here where they can be tested. Passing no `groupId` creates. The name is
 * normalised (trimmed, capped) and an empty one is refused.
 */
export async function saveGroup(
  db: AppDatabase,
  input: { groupId?: string; classId: string; name: string; color: string },
): Promise<string> {
  const now = Date.now();
  const name = normaliseGroupName(input.name);
  if (name.length === 0) throw new Error("a group needs a name");

  if (input.groupId !== undefined) {
    await db.studentGroups.update(input.groupId, { name, color: input.color, updatedAt: now });
    return input.groupId;
  }

  const id = crypto.randomUUID();
  await db.studentGroups.add({
    id,
    classId: input.classId,
    name,
    color: input.color,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * One row, one `put`. Never read-modify-write membership as a collection —
 * the compound key means a single row write is always enough.
 */
export async function addToGroup(
  db: AppDatabase,
  groupId: string,
  studentId: string,
): Promise<void> {
  await db.groupMembers.put({ groupId, studentId });
}

/** One row, one `delete`. Leaves every other pupil and group untouched. */
export async function removeFromGroup(
  db: AppDatabase,
  groupId: string,
  studentId: string,
): Promise<void> {
  await db.groupMembers.delete(groupMemberKey(groupId, studentId));
}

/**
 * Replace a group's entire membership in one transaction.
 *
 * The one legitimate whole-list write in this feature: the pupil picker edits
 * the set as a whole, so it is expressed as a set here too rather than a
 * sequence of `addToGroup`/`removeFromGroup` calls the caller would have to
 * diff itself.
 */
export async function setGroupMembers(
  db: AppDatabase,
  groupId: string,
  studentIds: string[],
): Promise<void> {
  await db.transaction("rw", db.groupMembers, async () => {
    await db.groupMembers.where("groupId").equals(groupId).delete();
    await db.groupMembers.bulkPut(studentIds.map((studentId) => ({ groupId, studentId })));
  });
}
