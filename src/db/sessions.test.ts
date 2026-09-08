import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import {
  createSession,
  getOrCreateTodaySession,
  sessionsForClass,
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
});
