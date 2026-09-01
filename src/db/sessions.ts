import type { AppDatabase, Session } from ".";

/**
 * Sessions: one row per lesson.
 *
 * A session is fetched lazily rather than started deliberately — a teacher
 * mid-lesson has no patience for a setup step, and a forgotten one would leave
 * a sanction with nowhere to go. The explicit `createSession` exists for the
 * case a lazy fetch cannot express: the same class taught twice in one day.
 */

/** Local midnight of the day containing `ms`. Sessions are dated, not timed. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Always makes a new row, even if today already has one. */
export async function createSession(
  db: AppDatabase,
  classId: string,
  subjectId?: string,
): Promise<Session> {
  const date = startOfDay(Date.now());
  // A forced second session can land in the same millisecond as the first in
  // a fast test run (or on a fast machine). `createdAt` is what determines
  // "most recent" in getOrCreateTodaySession, so it must strictly increase
  // relative to any sibling already recorded today for this class.
  const todays = await db.sessions.where({ classId, date }).toArray();
  const latestExisting = todays.reduce((max, s) => Math.max(max, s.createdAt), 0);
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(subjectId === undefined ? {} : { subjectId }),
    date,
    createdAt: Math.max(Date.now(), latestExisting + 1),
  };
  await db.sessions.add(session);
  return session;
}

/**
 * Today's session for a class, created if absent.
 *
 * When a second session was forced today, the most recently created one wins:
 * that is the lesson currently happening.
 */
export async function getOrCreateTodaySession(
  db: AppDatabase,
  classId: string,
  subjectId?: string,
): Promise<Session> {
  const today = startOfDay(Date.now());
  // Read and write inside ONE transaction. Read-then-write outside a
  // transaction let React 19 StrictMode's double-invoked effect run both
  // reads before either write, so a first visit to the plan page created two
  // sessions for the same lesson. Guarding the caller's setState does not
  // help — by then both writes have happened.
  return await db.transaction("rw", db.sessions, async () => {
    const todays = await db.sessions.where({ classId, date: today }).toArray();
    if (todays.length > 0) {
      return todays.reduce((latest, s) => (s.createdAt > latest.createdAt ? s : latest));
    }
    const session: Session = {
      id: crypto.randomUUID(),
      classId,
      ...(subjectId === undefined ? {} : { subjectId }),
      date: today,
      createdAt: Date.now(),
    };
    await db.sessions.add(session);
    return session;
  });
}

/** Every session of a class, newest first. */
export async function sessionsForClass(db: AppDatabase, classId: string): Promise<Session[]> {
  const sessions = await db.sessions.where("classId").equals(classId).toArray();
  return sessions.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}
