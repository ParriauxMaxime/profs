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
        "assignments",
        "attendance",
        "behaviourEvents",
        "classes",
        "columns",
        "desks",
        "diaryEntries",
        "gradebooks",
        "grades",
        "groupMembers",
        "periods",
        "rooms",
        "rubricAssessments",
        "rubricScores",
        "rubricTemplates",
        "scheduleEntries",
        "seatingPlans",
        "sessions",
        "students",
        "studentGroups",
        "subjects",
      ].sort(),
    );
    db.close();
  });

  it("refuses two desks on one square", async () => {
    const db = openWorkspaceDb(`schema-desk-${crypto.randomUUID()}`);
    await db.desks.put({ id: "d1", roomId: "r1", x: 0, y: 0 });
    await expect(db.desks.put({ id: "d2", roomId: "r1", x: 0, y: 0 })).rejects.toThrow();
    expect(await db.desks.where("roomId").equals("r1").count()).toBe(1);
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

describe("schema v12 — the per-class layout is dropped, not carried", () => {
  /** The v2..v6 schema exactly as it shipped, so we can build a real old database. */
  function openOldDb(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(2).stores({
      classes: "id, name",
      seatingLayouts: "id, classId",
      seats: "[layoutId+row+col], layoutId, studentId",
    });
    return db;
  }

  it("opens a workspace built at the old schema, keeping everything but the room", async () => {
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
    // The class survives; the room does not, which is what "disposable" means.
    expect(await fresh.classes.count()).toBe(1);
    expect(fresh.tables.map((t) => t.name)).not.toContain("seats");
    expect(fresh.tables.map((t) => t.name)).not.toContain("seatingLayouts");
    fresh.close();
  });
});

describe("schema v11 — the saved room's name is reused for the salle", () => {
  /**
   * v9 as it shipped, far enough back to carry a real saved room.
   *
   * Only the stores this test touches are declared: Dexie carries the rest
   * forward untouched, and the point here is the one store whose MEANING
   * changed under an unchanged name.
   */
  function openV9(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(8).stores({
      classes: "id, name",
      seatingLayouts: "id, classId",
      seats: "id, layoutId, studentId, &[layoutId+x+y]",
    });
    db.version(9).stores({ rooms: "id, name" });
    return db;
  }

  it("carries no v9 saved room forward into the salle store", async () => {
    const name = `repro-room-${crypto.randomUUID()}`;
    const old = openV9(name);
    await old.open();
    await old.table("classes").add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    // The v9 shape: `positions` embedded, and no desks table anywhere. Carried
    // forward, this row would feed `positions` into code reading `desks` — a
    // salle that renders no furniture and cannot be told from an empty one.
    await old.table("rooms").add({
      id: "r1",
      name: "Salle 204",
      width: 10,
      height: 8,
      positions: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      createdAt: 1,
      updatedAt: 1,
    });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    expect(await fresh.classes.count()).toBe(1);
    expect(await fresh.rooms.count()).toBe(0);
    fresh.close();
  });

  it("gives the new code four empty stores it can actually fill", async () => {
    const name = `repro-salle-${crypto.randomUUID()}`;
    const old = openV9(name);
    await old.open();
    await old.table("rooms").add({
      id: "r1",
      name: "Salle 204",
      width: 10,
      height: 8,
      positions: [{ x: 0, y: 0 }],
      createdAt: 1,
      updatedAt: 1,
    });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    await fresh.rooms.add({
      id: "r2",
      name: "204",
      width: 20,
      height: 16,
      createdAt: 1,
      updatedAt: 1,
    });
    await fresh.desks.add({ id: "d1", roomId: "r2", x: 2, y: 2 });
    await fresh.seatingPlans.add({ id: "p1", classId: "c1", roomId: "r2", updatedAt: 1 });
    await fresh.assignments.put({ planId: "p1", deskId: "d1", studentId: "s1" });

    expect(await fresh.rooms.get("r2")).toMatchObject({ width: 20, height: 16 });
    expect(await fresh.assignments.get(["p1", "d1"])).toMatchObject({ studentId: "s1" });
    // And the indexes the new stores were declared for are live.
    await expect(fresh.desks.add({ id: "d2", roomId: "r2", x: 2, y: 2 })).rejects.toThrow();
    await expect(
      fresh.assignments.put({ planId: "p1", deskId: "d9", studentId: "s1" }),
    ).rejects.toThrow();
    fresh.close();
  });
});
