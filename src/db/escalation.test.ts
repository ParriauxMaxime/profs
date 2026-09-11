import "fake-indexeddb/auto";
import { DEFAULT_ESCALATION } from "@domain/escalation";
import { openWorkspaceDb } from ".";
import { logBehaviour } from "./behaviour";
import { escalationContext, evaluateEscalation } from "./escalation";

const CLASS_ID = "c1";

/** Three lessons of one class, a day apart, all at 8h. */
async function seedSeances(db: ReturnType<typeof openWorkspaceDb>): Promise<void> {
  await db.sessions.bulkAdd([
    { id: "s1", classId: CLASS_ID, date: 100, startsAt: 480, endsAt: 535, createdAt: 1 },
    { id: "s2", classId: CLASS_ID, date: 200, startsAt: 480, endsAt: 535, createdAt: 2 },
    { id: "s3", classId: CLASS_ID, date: 300, startsAt: 480, endsAt: 535, createdAt: 3 },
  ]);
}

async function yellow(
  db: ReturnType<typeof openWorkspaceDb>,
  sessionId: string,
  studentId: string,
): Promise<void> {
  await logBehaviour(db, { sessionId, studentId, classId: CLASS_ID, type: "yellow" });
}

describe("escalationContext", () => {
  it("collects the window's yellows per pupil", async () => {
    const db = openWorkspaceDb(`esc-ctx-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");
    await yellow(db, "s3", "p2");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual(["s2", "s3"]);
    expect(context.yellowsByStudent.get("p1")).toHaveLength(2);
    expect(context.yellowsByStudent.get("p2")).toHaveLength(1);
    db.close();
  });

  it("leaves out a yellow from outside the window", async () => {
    const db = openWorkspaceDb(`esc-out-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s1", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.yellowsByStudent.get("p1")).toBeUndefined();
    db.close();
  });

  it("leaves out another class's séance", async () => {
    const db = openWorkspaceDb(`esc-class-${crypto.randomUUID()}`);
    await seedSeances(db);
    await db.sessions.add({
      id: "other",
      classId: "c2",
      date: 250,
      startsAt: 480,
      endsAt: 535,
      createdAt: 4,
    });
    await logBehaviour(db, {
      sessionId: "other",
      studentId: "p1",
      classId: "c2",
      type: "yellow",
    });

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual(["s2", "s3"]);
    expect(context.yellowsByStudent.size).toBe(0);
    db.close();
  });

  it("is empty while the rule is off", async () => {
    const db = openWorkspaceDb(`esc-off-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", {
      ...DEFAULT_ESCALATION,
      enabled: false,
    });
    expect(context.windowIds).toEqual([]);
    expect(context.yellowsByStudent.size).toBe(0);
    db.close();
  });

  it("is empty when no séance exists yet", async () => {
    const db = openWorkspaceDb(`esc-none-${crypto.randomUUID()}`);
    await seedSeances(db);
    const context = await escalationContext(db, CLASS_ID, null, DEFAULT_ESCALATION);
    expect(context.windowIds).toEqual([]);
    db.close();
  });

  it("returns the yellows oldest first", async () => {
    const db = openWorkspaceDb(`esc-order-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");
    await yellow(db, "s2", "p1");

    const context = await escalationContext(db, CLASS_ID, "s3", DEFAULT_ESCALATION);
    const created = (context.yellowsByStudent.get("p1") ?? []).map((e) => e.createdAt);
    expect(created).toEqual([...created].sort((a, b) => a - b));
    db.close();
  });
});

describe("evaluateEscalation", () => {
  it("escalates at exactly Y", async () => {
    const db = openWorkspaceDb(`esc-eval-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");

    const before = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(before.escalated).toBe(false);
    expect(before.yellows).toHaveLength(1);

    await yellow(db, "s3", "p1");
    const after = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(after.escalated).toBe(true);
    expect(after.yellows).toHaveLength(2);
    db.close();
  });

  it("escalates on two yellows in one séance", async () => {
    const db = openWorkspaceDb(`esc-same-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s3", "p1");
    await yellow(db, "s3", "p1");

    const state = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(state.escalated).toBe(true);
    db.close();
  });

  it("escalates again as the window slides", async () => {
    const db = openWorkspaceDb(`esc-slide-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s1", "p1");
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");

    const state = await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    expect(state.escalated).toBe(true);
    db.close();
  });

  it("writes nothing — no red event is ever stored", async () => {
    const db = openWorkspaceDb(`esc-nowrite-${crypto.randomUUID()}`);
    await seedSeances(db);
    await yellow(db, "s2", "p1");
    await yellow(db, "s3", "p1");
    await evaluateEscalation(db, {
      classId: CLASS_ID,
      studentId: "p1",
      sessionId: "s3",
      rule: DEFAULT_ESCALATION,
    });
    // Filtered in memory, not `where("type")`: `behaviourEvents` is indexed
    // `"id, sessionId, studentId, classId, createdAt"` and has no `type` index,
    // so a `where` on it throws.
    const all = await db.behaviourEvents.toArray();
    expect(all.filter((event) => event.type === "red")).toHaveLength(0);
    expect(all).toHaveLength(2);
    db.close();
  });
});
