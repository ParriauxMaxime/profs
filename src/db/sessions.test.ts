import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import {
  createSession,
  getOrCreateSessionAt,
  getOrCreateTodaySession,
  sessionsForClass,
  sessionsForDay,
  sessionsInRange,
  setSessionNote,
  startOfDay,
} from "./sessions";

function freshDb(name: string) {
  return openWorkspaceDb(`sessions-${name}-${crypto.randomUUID()}`);
}

describe("startOfDay", () => {
  it("zeroes the clock", () => {
    const noon = new Date(2026, 2, 12, 12, 30, 45, 123).getTime();
    const start = new Date(startOfDay(noon));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(12);
  });
});

describe("getOrCreateTodaySession", () => {
  it("creates one when none exists today", async () => {
    const db = freshDb("create");
    const session = await getOrCreateTodaySession(db, "c1");
    expect(session.classId).toBe("c1");
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it("reuses today's session instead of making a second", async () => {
    const db = freshDb("reuse");
    const first = await getOrCreateTodaySession(db, "c1");
    const second = await getOrCreateTodaySession(db, "c1");
    expect(second.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it("does not reuse another class's session", async () => {
    const db = freshDb("other-class");
    await getOrCreateTodaySession(db, "c1");
    await getOrCreateTodaySession(db, "c2");
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });

  it("does not reuse yesterday's session", async () => {
    const db = freshDb("yesterday");
    const yesterday = startOfDay(Date.now()) - 86_400_000;
    await db.sessions.put({
      id: "old",
      classId: "c1",
      date: yesterday,
      createdAt: yesterday,
    });
    const session = await getOrCreateTodaySession(db, "c1");
    expect(session.id).not.toBe("old");
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });

  it("returns the most recent when a second was forced today", async () => {
    const db = freshDb("forced");
    await getOrCreateTodaySession(db, "c1");
    const forced = await createSession(db, "c1", startOfDay(Date.now()));
    const found = await getOrCreateTodaySession(db, "c1");
    expect(found.id).toBe(forced.id);
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });
});

describe("sessionsForClass", () => {
  it("returns newest first", async () => {
    const db = freshDb("order");
    const day = startOfDay(Date.now());
    await db.sessions.bulkPut([
      { id: "a", classId: "c1", date: day - 2 * 86_400_000, createdAt: 1 },
      { id: "b", classId: "c1", date: day, createdAt: 2 },
      { id: "c", classId: "c2", date: day, createdAt: 3 },
    ]);
    expect((await sessionsForClass(db, "c1")).map((s) => s.id)).toEqual(["b", "a"]);
    db.close();
  });
});

describe("getOrCreateTodaySession — concurrency", () => {
  it("creates exactly one session when two callers race", async () => {
    const db = freshDb("race");
    // React 19 StrictMode double-invokes effects, so both calls start before
    // either finishes. Without a transaction both reads saw an empty table
    // and both wrote, giving the class two sessions for one lesson.
    const [a, b] = await Promise.all([
      getOrCreateTodaySession(db, "c1"),
      getOrCreateTodaySession(db, "c1"),
    ]);
    expect(await db.sessions.count()).toBe(1);
    expect(a.id).toBe(b.id);
    db.close();
  });
});

describe("setSessionNote", () => {
  it("writes the note onto the séance", async () => {
    const db = freshDb("note");
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "Théorème de Pythagore");
    expect((await db.sessions.get(session.id))?.note).toBe("Théorème de Pythagore");
    db.close();
  });

  it("trims it", async () => {
    const db = freshDb("trim");
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "  Pythagore  ");
    expect((await db.sessions.get(session.id))?.note).toBe("Pythagore");
    db.close();
  });

  /**
   * Cleared, never emptied. A séance with `note: ""` is the husk `writeGrade`
   * refuses for a grade: it survives export, and makes "does this lesson have
   * a note?" answer yes for a lesson that has none.
   */
  it("removes the field when the text is blank", async () => {
    const db = freshDb("blank");
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    await setSessionNote(db, session.id, "Pythagore");
    await setSessionNote(db, session.id, "   ");
    const after = await db.sessions.get(session.id);
    expect(after).toBeDefined();
    expect("note" in (after ?? {})).toBe(false);
    db.close();
  });

  it("ignores a séance that no longer exists", async () => {
    const db = freshDb("gone");
    await expect(setSessionNote(db, "gone", "x")).resolves.toBeUndefined();
    db.close();
  });
});

describe("createSession with a time", () => {
  it("keeps the start time it was given", async () => {
    const db = freshDb("time");
    const date = startOfDay(Date.now());
    const session = await createSession(db, "c1", date, { startsAt: 600 });
    expect(session.startsAt).toBe(600);
    db.close();
  });

  it("leaves it absent for an unscheduled séance", async () => {
    const db = freshDb("unscheduled");
    const session = await createSession(db, "c1", startOfDay(Date.now()));
    expect("startsAt" in session).toBe(false);
    db.close();
  });

  it("guards createdAt collision even when passed a non-midnight timestamp", async () => {
    const db = freshDb("collision");
    // Create two sessions on the same day, both with mid-afternoon timestamps.
    // Without normalisation in the query, the collision guard is defeated.
    const afternoon = startOfDay(Date.now()) + 14 * 60 * 60 * 1000; // 2pm
    const session1 = await createSession(db, "c1", afternoon);
    const session2 = await createSession(db, "c1", afternoon + 1000); // 1 second later
    // The second must have a strictly greater createdAt, enforced by the guard.
    expect(session2.createdAt).toBeGreaterThan(session1.createdAt);
    db.close();
  });
});

describe("sessionsForDay", () => {
  it("returns the day's séances earliest first, untimed last", async () => {
    const db = freshDb("day-order");
    const date = startOfDay(Date.now());
    await createSession(db, "c1", date, { startsAt: 840 });
    await createSession(db, "c1", date, { startsAt: 600 });
    await createSession(db, "c1", date);
    await createSession(db, "c2", date, { startsAt: 60 });

    const day = await sessionsForDay(db, "c1", date);
    expect(day.map((s) => s.startsAt)).toEqual([600, 840, undefined]);
    db.close();
  });
});

describe("sessionsInRange", () => {
  it("returns every class's séances in the window, newest day first", async () => {
    const db = freshDb("range");
    const day = 86_400_000;
    const today = startOfDay(Date.now());
    await createSession(db, "c1", today, { startsAt: 600 });
    await createSession(db, "c2", today, { startsAt: 840 });
    await createSession(db, "c1", today - day);
    await createSession(db, "c1", today - 30 * day);

    const range = await sessionsInRange(db, today - day, today);
    expect(range).toHaveLength(3);
    expect(range[0].date).toBe(today);
    db.close();
  });
});

describe("getOrCreateSessionAt", () => {
  it("creates the séance for a slot that has none", async () => {
    const db = freshDb("slot-create");
    const date = startOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    expect(session.startsAt).toBe(600);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  it("returns the existing séance for that slot", async () => {
    const db = freshDb("slot-reuse");
    const date = startOfDay(Date.now());
    const first = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const again = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    expect(again.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });

  /**
   * The whole reason `startsAt` exists: two lessons on one day are two
   * séances, each with its own register and its own note.
   */
  it("keeps two lessons on one day apart", async () => {
    const db = freshDb("two-lessons");
    const date = startOfDay(Date.now());
    const morning = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const afternoon = await getOrCreateSessionAt(db, "c1", { date, startsAt: 840 });
    expect(afternoon.id).not.toBe(morning.id);
    expect(await db.sessions.count()).toBe(2);
    db.close();
  });

  it("treats an unscheduled séance as its own slot", async () => {
    const db = freshDb("unscheduled-slot");
    const date = startOfDay(Date.now());
    const timed = await getOrCreateSessionAt(db, "c1", { date, startsAt: 600 });
    const untimed = await getOrCreateSessionAt(db, "c1", { date });
    expect(untimed.id).not.toBe(timed.id);
    expect(untimed.startsAt).toBeUndefined();
    db.close();
  });

  /**
   * Read and write inside ONE transaction. React StrictMode double-invokes
   * effects, and a read-then-write outside a transaction let both reads run
   * before either write — which is how the plan page once created two
   * sessions for one lesson.
   */
  it("creates one séance when called twice at once", async () => {
    const db = freshDb("concurrent");
    const date = startOfDay(Date.now());
    const [a, b] = await Promise.all([
      getOrCreateSessionAt(db, "c1", { date, startsAt: 600 }),
      getOrCreateSessionAt(db, "c1", { date, startsAt: 600 }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.sessions.count()).toBe(1);
    db.close();
  });
});
