import "fake-indexeddb/auto";
import { attendanceKey, groupMemberKey, openWorkspaceDb, rubricScoreKey, seatKey } from ".";

describe("schema v2", () => {
  it("builds an attendance key", () => {
    expect(attendanceKey("s1", "p1")).toEqual(["s1", "p1"]);
  });

  it("builds a seat key", () => {
    expect(seatKey("l1", 2, 3)).toEqual(["l1", 2, 3]);
  });

  it("opens with every table the schema declares", async () => {
    const db = openWorkspaceDb("schema-v5");
    await db.open();
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "attendance",
        "behaviourEvents",
        "classes",
        "columns",
        "gradebooks",
        "grades",
        "groupMembers",
        "periods",
        "rubricAssessments",
        "rubricScores",
        "rubricTemplates",
        "scheduleEntries",
        "seatingLayouts",
        "seats",
        "sessions",
        "students",
        "studentGroups",
        "subjects",
      ].sort(),
    );
    db.close();
  });

  it("round-trips a seat on its compound key", async () => {
    const db = openWorkspaceDb("schema-v2-seat");
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: null });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });
    expect(await db.seats.count()).toBe(1);
    expect(await db.seats.get(seatKey("l1", 0, 0))).toEqual({
      layoutId: "l1",
      row: 0,
      col: 0,
      studentId: "p1",
    });
    db.close();
  });

  it("builds a rubric score key", () => {
    expect(rubricScoreKey("a1", "c1", "p1")).toEqual(["a1", "c1", "p1"]);
  });

  it("round-trips a score on its compound key", async () => {
    const db = openWorkspaceDb(`rubric-${crypto.randomUUID()}`);
    await db.rubricScores.put({
      assessmentId: "a1",
      criterionId: "c1",
      studentId: "p1",
      level: 2,
      updatedAt: 1,
    });
    await db.rubricScores.put({
      assessmentId: "a1",
      criterionId: "c1",
      studentId: "p1",
      level: 4,
      updatedAt: 2,
    });
    expect(await db.rubricScores.count()).toBe(1);
    expect((await db.rubricScores.get(rubricScoreKey("a1", "c1", "p1")))?.level).toBe(4);
    db.close();
  });

  it("builds a group member key", () => {
    expect(groupMemberKey("g1", "p1")).toEqual(["g1", "p1"]);
  });

  it("round-trips a membership on its compound key", async () => {
    const db = openWorkspaceDb(`groups-${crypto.randomUUID()}`);
    await db.groupMembers.put({ groupId: "g1", studentId: "p1" });
    await db.groupMembers.put({ groupId: "g1", studentId: "p1" });
    expect(await db.groupMembers.count()).toBe(1);
    expect(await db.groupMembers.get(groupMemberKey("g1", "p1"))).toEqual({
      groupId: "g1",
      studentId: "p1",
    });
    db.close();
  });
});
