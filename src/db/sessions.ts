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
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(subjectId === undefined ? {} : { subjectId }),
    date: startOfDay(Date.now()),
    createdAt: Date.now(),
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
  const todays = await db.sessions.where({ classId, date: today }).toArray();
  if (todays.length > 0) {
    return todays.reduce((latest, s) => (s.createdAt > latest.createdAt ? s : latest));
  }
  return await createSession(db, classId, subjectId);
}

/** Every session of a class, newest first. */
export async function sessionsForClass(db: AppDatabase, classId: string): Promise<Session[]> {
  const sessions = await db.sessions.where("classId").equals(classId).toArray();
  return sessions.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}
