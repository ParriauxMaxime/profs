import "fake-indexeddb/auto";
import Dexie from "dexie";
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

describe("schema v7 — the grid store is dropped, not re-keyed", () => {
  /** The v2..v6 schema exactly as it shipped, so we can build a real old database. */
  function openOldDb(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(2).stores({
      classes: "id, name",
      students: "id, classId, lastName",
      subjects: "id, name",
      gradebooks: "id, classId, subjectId",
      periods: "id, gradebookId, order",
      columns: "id, gradebookId, periodId, order",
      grades: "[gradebookId+columnId+studentId], gradebookId, columnId, studentId",
      sessions: "id, classId, date, [classId+date], subjectId",
      attendance: "[sessionId+studentId], sessionId, studentId",
      behaviourEvents: "id, sessionId, studentId, classId, createdAt",
      seatingLayouts: "id, classId",
      seats: "[layoutId+row+col], layoutId, studentId",
    });
    db.version(3).stores({
      rubricTemplates: "id, name",
      rubricAssessments: "id, gradebookId, periodId, date",
      rubricScores: "[assessmentId+criterionId+studentId], assessmentId, criterionId, studentId",
    });
    db.version(4).stores({
      studentGroups: "id, classId",
      groupMembers: "[groupId+studentId], groupId, studentId",
    });
    db.version(5).stores({ scheduleEntries: "id, classId, weekday, gradebookId" });
    db.version(6).stores({ diaryEntries: "[classId+date], classId, date" });
    return db;
  }

  it("opens a workspace built at the old schema still opens with the new code", async () => {
    const name = `repro-${crypto.randomUUID()}`;
    const old = openOldDb(name);
    await old.open();
    await old.table("classes").add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    await old
      .table("seatingLayouts")
      .add({ id: "l1", classId: "c1", rows: 5, cols: 6, updatedAt: 1 });
    await old.table("seats").add({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    // The class survives; the grid's seats are gone, which is what "disposable" means.
    expect(await fresh.classes.count()).toBe(1);
    expect(await fresh.seats.count()).toBe(0);
    await fresh.seats.add({ id: "t1", layoutId: "l1", x: 0, y: 0, studentId: null });
    expect(await fresh.seats.get("t1")).toMatchObject({ x: 0, y: 0 });
    fresh.close();
  });

  it("drops the grid's rooms too, so no rows/cols layout is carried forward", async () => {
    const name = `repro-layout-${crypto.randomUUID()}`;
    const old = openOldDb(name);
    await old.open();
    await old.table("classes").add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    // The v6 shape: rows and cols, and no width or height at all. Carried
    // forward it renders at scale(NaN) and refuses every placement.
    await old
      .table("seatingLayouts")
      .add({ id: "l1", classId: "c1", rows: 5, cols: 6, updatedAt: 1 });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    expect(await fresh.classes.count()).toBe(1);
    expect(await fresh.seatingLayouts.count()).toBe(0);
    // And the empty store is a real one the new code can fill.
    await fresh.seatingLayouts.add({
      id: "l2",
      classId: "c1",
      width: 30,
      height: 20,
      updatedAt: 1,
    });
    expect(await fresh.seatingLayouts.where("classId").equals("c1").first()).toMatchObject({
      width: 30,
      height: 20,
    });
    fresh.close();
  });
});
