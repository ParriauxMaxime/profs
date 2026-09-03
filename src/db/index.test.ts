import "fake-indexeddb/auto";
import { attendanceKey, groupMemberKey, openWorkspaceDb, rubricScoreKey } from ".";

describe("schema v2", () => {
  it("builds an attendance key", () => {
    expect(attendanceKey("s1", "p1")).toEqual(["s1", "p1"]);
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
        "diaryEntries",
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

  it("refuses two tables at one point", async () => {
    const db = openWorkspaceDb("schema-v7-seat");
    await db.seats.put({ id: "s1", layoutId: "l1", x: 0, y: 0, studentId: null });
    await expect(
      db.seats.put({ id: "s2", layoutId: "l1", x: 0, y: 0, studentId: null }),
    ).rejects.toThrow();
    expect(await db.seats.where("layoutId").equals("l1").count()).toBe(1);
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
