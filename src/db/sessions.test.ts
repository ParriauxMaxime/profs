import "fake-indexeddb/auto";
import { DEFAULT_SEANCE_MINUTES } from "@domain/seance";
import { openWorkspaceDb } from ".";
import {
  createSession,
  getOrCreateSessionAt,
  sessionsForClass,
  sessionsForDay,
  sessionsInRange,
  setSessionNote,
  setSessionTimes,
  startOfDay,
} from "./sessions";

function freshDb(name: string) {
  return openWorkspaceDb(`sessions-${name}-${crypto.randomUUID()}`);
}

const DAY = startOfDay(Date.now());

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

describe("sessionsForClass", () => {
  it("returns newest first", async () => {
    const db = freshDb("order");
    const day = startOfDay(Date.now());
    await db.sessions.bulkPut([
      {
        id: "a",
        classId: "c1",
        date: day - 2 * 86_400_000,
        startsAt: 480,
        endsAt: 535,
        createdAt: 1,
      },
      { id: "b", classId: "c1", date: day, startsAt: 480, endsAt: 535, createdAt: 2 },
      { id: "c", classId: "c2", date: day, startsAt: 480, endsAt: 535, createdAt: 3 },
    ]);
    expect((await sessionsForClass(db, "c1")).map((s) => s.id)).toEqual(["b", "a"]);
    db.close();
  });
});

describe("setSessionNote", () => {
  it("writes the note onto the séance", async () => {
    const db = freshDb("note");
    const session = await createSession(db, "c1", startOfDay(Date.now()), { startsAt: 480 });
    await setSessionNote(db, session.id, "Théorème de Pythagore");
    expect((await db.sessions.get(session.id))?.note).toBe("Théorème de Pythagore");
    db.close();
  });

  it("trims it", async () => {
    const db = freshDb("trim");
    const session = await createSession(db, "c1", startOfDay(Date.now()), { startsAt: 480 });
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
    const session = await createSession(db, "c1", startOfDay(Date.now()), { startsAt: 480 });
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

  it("guards createdAt collision even when passed a non-midnight timestamp", async () => {
    const db = freshDb("collision");
    // Create two sessions on the same day, both with mid-afternoon timestamps.
    // Without normalisation in the query, the collision guard is defeated.
    const afternoon = startOfDay(Date.now()) + 14 * 60 * 60 * 1000; // 2pm
    const session1 = await createSession(db, "c1", afternoon, { startsAt: 480 });
    const session2 = await createSession(db, "c1", afternoon + 1000, { startsAt: 600 }); // 1 second later
    // The second must have a strictly greater createdAt, enforced by the guard.
    expect(session2.createdAt).toBeGreaterThan(session1.createdAt);
    db.close();
  });
});

describe("sessionsForDay", () => {
  it("returns the day's séances earliest first", async () => {
    const db = freshDb("day-order");
    const date = startOfDay(Date.now());
    await createSession(db, "c1", date, { startsAt: 840 });
    await createSession(db, "c1", date, { startsAt: 600 });
    await createSession(db, "c2", date, { startsAt: 60 });

    const day = await sessionsForDay(db, "c1", date);
    expect(day.map((s) => s.startsAt)).toEqual([600, 840]);
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
    await createSession(db, "c1", today - day, { startsAt: 480 });
    await createSession(db, "c1", today - 30 * day, { startsAt: 480 });

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

describe("both times", () => {
  it("gives a created séance the default end when none is asked for", async () => {
    const db = freshDb("default-end");
    const session = await createSession(db, "c1", DAY, { startsAt: 480 });
    expect(session.startsAt).toBe(480);
    expect(session.endsAt).toBe(480 + DEFAULT_SEANCE_MINUTES);
    db.close();
  });

  it("keeps an end it was given", async () => {
    const db = freshDb("kept-end");
    const session = await createSession(db, "c1", DAY, { startsAt: 480, endsAt: 600 });
    expect(session.endsAt).toBe(600);
    db.close();
  });

  it("reuses the séance already at that time rather than making a second", async () => {
    const db = freshDb("reuse");
    const first = await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
    const again = await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
    expect(again.id).toBe(first.id);
    expect(await db.sessions.where({ classId: "c1", date: DAY }).count()).toBe(1);
    db.close();
  });

  it("writes a second séance for a different hour of the same day", async () => {
    const db = freshDb("second-hour");
    await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 600 });
    await getOrCreateSessionAt(db, "c1", { date: DAY, startsAt: 660 });
    expect(await db.sessions.where({ classId: "c1", date: DAY }).count()).toBe(2);
    db.close();
  });

  it("setSessionTimes moves both ends", async () => {
    const db = freshDb("move-times");
    const session = await createSession(db, "c1", DAY, { startsAt: 480 });
    await setSessionTimes(db, session.id, { startsAt: 540, endsAt: 630 });
    const after = await db.sessions.get(session.id);
    expect(after?.startsAt).toBe(540);
    expect(after?.endsAt).toBe(630);
    db.close();
  });
});
