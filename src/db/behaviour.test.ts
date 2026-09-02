import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { logBehaviour } from "./behaviour";

function freshDb(label: string) {
  return openWorkspaceDb(`behaviour-${label}-${crypto.randomUUID()}`);
}

describe("logBehaviour", () => {
  it("appends a row carrying the denormalised classId", async () => {
    const db = freshDb("append");
    const event = await logBehaviour(db, {
      sessionId: "sess1",
      studentId: "s1",
      classId: "c1",
      type: "yellow",
      comment: "  bavardage  ",
    });

    const stored = await db.behaviourEvents.get(event.id);
    expect(stored?.classId).toBe("c1");
    expect(stored?.type).toBe("yellow");
    expect(stored?.comment).toBe("bavardage");
    db.close();
  });

  it("omits an empty comment rather than storing an empty string", async () => {
    const db = freshDb("no-comment");
    const event = await logBehaviour(db, {
      sessionId: "sess1",
      studentId: "s1",
      classId: "c1",
      type: "green",
      comment: "   ",
    });

    expect(await db.behaviourEvents.get(event.id)).not.toHaveProperty("comment");
    db.close();
  });

  it("never overwrites: the same observation twice is two rows", async () => {
    // Append-only. A behaviour log records what was seen when, and a second
    // yellow card is a second incident, not a correction of the first.
    const db = freshDb("append-only");
    await logBehaviour(db, { sessionId: "sess1", studentId: "s1", classId: "c1", type: "red" });
    await logBehaviour(db, { sessionId: "sess1", studentId: "s1", classId: "c1", type: "red" });

    expect(await db.behaviourEvents.where("studentId").equals("s1").count()).toBe(2);
    db.close();
  });
});
