import type { BehaviourType } from "@domain/behaviour";
import type { AppDatabase, BehaviourEvent } from ".";

/**
 * Behaviour events are append-only.
 *
 * There is no update here and there will not be one: a behaviour log is a
 * record of what was observed when, not a mutable field. A correction is
 * `deleteBehaviourEvent` in `cascade.ts`; a change of mind is a new row.
 *
 * `classId` is denormalised onto the event so a class timeline is one index
 * hit rather than a join through sessions.
 */
export async function logBehaviour(
  db: AppDatabase,
  {
    sessionId,
    studentId,
    classId,
    type,
    comment,
  }: {
    sessionId: string;
    studentId: string;
    classId: string;
    type: BehaviourType;
    comment?: string;
  },
): Promise<BehaviourEvent> {
  const trimmed = comment?.trim() ?? "";
  const event: BehaviourEvent = {
    id: crypto.randomUUID(),
    sessionId,
    studentId,
    classId,
    type,
    // An empty comment is absent, not a stored empty string: it would ride
    // along in every export and read as a comment the teacher never wrote.
    ...(trimmed.length > 0 ? { comment: trimmed } : {}),
    createdAt: Date.now(),
  };
  await db.behaviourEvents.add(event);
  return event;
}
