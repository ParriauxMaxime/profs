import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { createSession, getOrCreateTodaySession, sessionsForClass, startOfDay } from "./sessions";

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
    const forced = await createSession(db, "c1");
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
