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
  date: number,
  options: { subjectId?: string; startsAt?: number } = {},
): Promise<Session> {
  const day = startOfDay(date);
  // A forced second session can land in the same millisecond as the first in
  // a fast test run (or on a fast machine). `createdAt` is what determines
  // "most recent" in getOrCreateTodaySession, so it must strictly increase
  // relative to any sibling already recorded today for this class.
  const todays = await db.sessions.where({ classId, date: day }).toArray();
  const latestExisting = todays.reduce((max, s) => Math.max(max, s.createdAt), 0);
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(options.subjectId === undefined ? {} : { subjectId: options.subjectId }),
    ...(options.startsAt === undefined ? {} : { startsAt: options.startsAt }),
    date: day,
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

/**
 * What was done in this lesson.
 *
 * Blank text CLEARS the field rather than storing an empty string — the same
 * rule `writeGrade` applies to a grade with neither value nor note. A husk
 * survives every export and makes "does this séance have a note?" answer yes
 * for a lesson that has none.
 */
export async function setSessionNote(
  db: AppDatabase,
  sessionId: string,
  note: string,
): Promise<void> {
  const text = note.trim();
  if (text === "") {
    // Dexie removes a key whose value is `undefined` in an update, which is
    // how the field is cleared rather than set to an empty string.
    await db.sessions.update(sessionId, { note: undefined });
    return;
  }
  await db.sessions.update(sessionId, { note: text });
}

/**
 * A class's séances on one day, earliest first.
 *
 * An unscheduled séance has no time and sorts last: it has nothing to sort
 * by, and a teacher reads a day as a clock.
 */
export async function sessionsForDay(
  db: AppDatabase,
  classId: string,
  date: number,
): Promise<Session[]> {
  const day = await db.sessions.where({ classId, date: startOfDay(date) }).toArray();
  return day.sort((a, b) => {
    if (a.startsAt === b.startsAt) return a.createdAt - b.createdAt;
    if (a.startsAt === undefined) return 1;
    if (b.startsAt === undefined) return -1;
    return a.startsAt - b.startsAt;
  });
}

/**
 * The séance for one slot, created if absent.
 *
 * A slot is a class, a day, and — when the lesson has one — a start time.
 * Two lessons on one day are two slots and therefore two séances, each with
 * its own register and its own note.
 *
 * Read and write inside ONE transaction: StrictMode's double-invoked effects
 * ran both reads before either write and produced two sessions for one lesson.
 */
export async function getOrCreateSessionAt(
  db: AppDatabase,
  classId: string,
  at: { date: number; startsAt?: number; subjectId?: string },
): Promise<Session> {
  const date = startOfDay(at.date);
  return db.transaction("rw", db.sessions, async () => {
    const day = await db.sessions.where({ classId, date }).toArray();
    const existing = day.filter((s) => s.startsAt === at.startsAt);
    if (existing.length > 0) {
      return existing.reduce((latest, s) => (s.createdAt > latest.createdAt ? s : latest));
    }
    return createSession(db, classId, date, {
      ...(at.subjectId === undefined ? {} : { subjectId: at.subjectId }),
      ...(at.startsAt === undefined ? {} : { startsAt: at.startsAt }),
    });
  });
}
