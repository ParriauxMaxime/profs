import { DEFAULT_SEANCE_MINUTES } from "@domain/seance";
import type { AppDatabase, Session } from ".";

/**
 * Sessions: one row per lesson.
 *
 * A session is fetched lazily rather than started deliberately — a teacher
 * mid-lesson has no patience for a setup step, and a forgotten one would leave
 * a sanction with nowhere to go. But lazily is not eagerly: `getOrCreateSessionAt`
 * is called from a RECORDING (a mark, a behaviour event, a note, the explicit
 * button), never from an effect that runs on arrival, or merely looking at a
 * seating plan would file a lesson nobody taught. The explicit `createSession`
 * exists for the case a lazy fetch cannot express: the same class taught twice
 * in one day.
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
  options: { subjectId?: string; startsAt: number; endsAt?: number },
): Promise<Session> {
  const day = startOfDay(date);
  // A forced second session can land in the same millisecond as the first in
  // a fast test run (or on a fast machine). `createdAt` is what determines
  // "most recent" in `getOrCreateSessionAt`, so it must strictly increase
  // relative to any sibling already recorded today for this class.
  const todays = await db.sessions.where({ classId, date: day }).toArray();
  const latestExisting = todays.reduce((max, s) => Math.max(max, s.createdAt), 0);
  const session: Session = {
    id: crypto.randomUUID(),
    classId,
    ...(options.subjectId === undefined ? {} : { subjectId: options.subjectId }),
    startsAt: options.startsAt,
    endsAt: options.endsAt ?? options.startsAt + DEFAULT_SEANCE_MINUTES,
    date: day,
    createdAt: Math.max(Date.now(), latestExisting + 1),
  };
  await db.sessions.add(session);
  return session;
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
 */
export async function sessionsForDay(
  db: AppDatabase,
  classId: string,
  date: number,
): Promise<Session[]> {
  const day = await db.sessions.where({ classId, date: startOfDay(date) }).toArray();
  return day.sort((a, b) => {
    if (a.startsAt === b.startsAt) return a.createdAt - b.createdAt;
    return a.startsAt - b.startsAt;
  });
}

/**
 * Every class's séances between two days, newest day first and earliest
 * lesson first within a day — the order the journal reads them in.
 */
export async function sessionsInRange(
  db: AppDatabase,
  from: number,
  to: number,
): Promise<Session[]> {
  const rows = await db.sessions
    .where("date")
    .between(startOfDay(from), startOfDay(to), true, true)
    .toArray();
  return rows.sort((a, b) => b.date - a.date || a.startsAt - b.startsAt);
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
  at: { date: number; startsAt: number; endsAt?: number; subjectId?: string },
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
      startsAt: at.startsAt,
      ...(at.endsAt === undefined ? {} : { endsAt: at.endsAt }),
    });
  });
}

/**
 * Move a séance's start, its end, or both.
 *
 * Both ends are written together because they are one fact: an end before its
 * start is not a lesson, and letting them move separately would make that
 * state reachable between two writes. The caller validates the order; this
 * records the result.
 */
export async function setSessionTimes(
  db: AppDatabase,
  sessionId: string,
  times: { startsAt: number; endsAt: number },
): Promise<void> {
  await db.sessions.update(sessionId, times);
}
