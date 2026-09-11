import {
  type EscalationRule,
  escalationWindow,
  isEscalated,
  yellowsInWindow,
} from "@domain/escalation";
import type { AppDatabase, BehaviourEvent } from ".";

/**
 * The rule, read against real rows, for a WHOLE room at a time.
 *
 * Two queries, never one per seat: the class's séances, then the window's
 * events by `sessionId` — which is indexed. The plan page already reads the
 * current séance's events this way; this is the same shape widened to X
 * séances, and it must stay that way, because a class is up to a hundred
 * pupils and this runs on a tablet.
 *
 * NOTHING here writes. The red card is derived, and `logBehaviour` stays the
 * only thing that adds a row.
 */
export interface EscalationContext {
  /** The séance ids the rule is counting over, oldest first. */
  windowIds: string[];
  /** Only pupils with at least one yellow in the window appear. */
  yellowsByStudent: Map<string, BehaviourEvent[]>;
}

export async function escalationContext(
  db: AppDatabase,
  classId: string,
  currentSessionId: string | null,
  rule: EscalationRule,
): Promise<EscalationContext> {
  // Off is off: no window, so the seat draws no history and nothing is at red.
  // A fresh Map every time, never a shared empty one — a caller that wrote to
  // a module-level constant would be writing to every other caller's answer.
  if (!rule.enabled || currentSessionId === null) {
    return { windowIds: [], yellowsByStudent: new Map() };
  }

  const sessions = await db.sessions.where("classId").equals(classId).toArray();
  const windowIds = escalationWindow(sessions, currentSessionId, rule);
  if (windowIds.length === 0) return { windowIds, yellowsByStudent: new Map() };

  // `sortBy` rather than a sort afterwards: the seat draws these oldest first,
  // and `createdAt` is the only order a behaviour log has.
  const rows = await db.behaviourEvents.where("sessionId").anyOf(windowIds).sortBy("createdAt");

  const yellowsByStudent = new Map<string, BehaviourEvent[]>();
  for (const row of yellowsInWindow(rows, windowIds)) {
    const list = yellowsByStudent.get(row.studentId) ?? [];
    list.push(row);
    yellowsByStudent.set(row.studentId, list);
  }
  return { windowIds, yellowsByStudent };
}

export interface StudentEscalation {
  /** This pupil's yellows in the window, oldest first. */
  yellows: BehaviourEvent[];
  escalated: boolean;
}

/**
 * One pupil, for the moment a yellow is handed in.
 *
 * Built on `escalationContext` rather than on a narrower query: the extra rows
 * are one class's yellows over a handful of séances, and one code path means
 * the tap and the tile can never disagree about who is at red.
 */
export async function evaluateEscalation(
  db: AppDatabase,
  {
    classId,
    studentId,
    sessionId,
    rule,
  }: { classId: string; studentId: string; sessionId: string; rule: EscalationRule },
): Promise<StudentEscalation> {
  const context = await escalationContext(db, classId, sessionId, rule);
  const yellows = context.yellowsByStudent.get(studentId) ?? [];
  return { yellows, escalated: isEscalated(yellows.length, rule) };
}
