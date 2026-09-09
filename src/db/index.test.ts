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

describe("schema v14 — the day-keyed journal entry is dropped", () => {
  /** The schema as it stood at v13, with `diaryEntries` still declared. */
  function openV13(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(13).stores({
      classes: "id, name",
      sessions: "id, classId, date, [classId+date], subjectId",
      diaryEntries: "[classId+date], classId, date",
    });
    return db;
  }

  it("opens a v13 database with current code", async () => {
    const name = `repro-diary-${crypto.randomUUID()}`;
    const old = openV13(name);
    await old.open();
    await old.table("sessions").add({ id: "s1", classId: "c1", date: 0, createdAt: 0 });
    await old.table("diaryEntries").add({ classId: "c1", date: 0, text: "vieux" });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    // The lesson survives; the day-keyed entry does not, since its text now
    // lives on `Session.note` — which needed no version of its own.
    expect(await fresh.sessions.get("s1")).toMatchObject({ classId: "c1" });
    expect(fresh.tables.map((t) => t.name)).not.toContain("diaryEntries");
    fresh.close();
  });
});

describe("schema v15 — a lesson no longer names a carnet", () => {
  /** The schema as it stood at v13, with `gradebookId` still indexed. */
  function openV13(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(13).stores({
      classes: "id, name",
      scheduleEntries: "id, classId, weekday, gradebookId, roomId",
    });
    return db;
  }

  it("opens a v13 database whose entries still carry a gradebookId", async () => {
    const name = `repro-entry-carnet-${crypto.randomUUID()}`;
    const old = openV13(name);
    await old.open();
    await old.table("scheduleEntries").add({
      id: "e1",
      classId: "c1",
      subjectId: "sub1",
      gradebookId: "g1",
      weekday: 1,
      startMinute: 600,
      endMinute: 660,
      weekCycle: "all",
      createdAt: 0,
      updatedAt: 0,
    });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();
    // The lesson survives whole. Its dead `gradebookId` is a leftover
    // property, inert exactly as v13's leftover free-text `room` was: nothing
    // reads it, and no arithmetic is fed by its absence.
    expect(await fresh.scheduleEntries.get("e1")).toMatchObject({
      classId: "c1",
      subjectId: "sub1",
      weekday: 1,
      startMinute: 600,
    });
    expect(fresh.scheduleEntries.schema.indexes.map((i) => i.name)).not.toContain("gradebookId");
    fresh.close();
  });
});

describe("schema v16 — a séance gets a start and an end", () => {
  /**
   * The schema as it stood at v15: `sessions`, `attendance` and
   * `behaviourEvents` verbatim, since none of the three has been redeclared
   * since v2 — copied here rather than paraphrased, so this fixture matches
   * the real prior schema.
   */
  function openV15(name: string) {
    const db = new Dexie(`profs-${name}`);
    db.version(15).stores({
      sessions: "id, classId, date, [classId+date], subjectId",
      attendance: "[sessionId+studentId], sessionId, studentId",
      behaviourEvents: "id, sessionId, studentId, classId, createdAt",
    });
    return db;
  }

  it("gives a v15 séance a start and an end, and keeps what hangs off it", async () => {
    // A v15 database: the séance carries no times, and an attendance row and a
    // behaviour event are keyed to it. Dropping the store — what the
    // disposable-schema rule prescribes for a changed shape — would destroy
    // the séance and leave these two as orphans nothing reads and every
    // export carries. That is why v16 backfills instead.
    const name = `repro-times-${crypto.randomUUID()}`;
    const sessionId = crypto.randomUUID();
    const studentId = crypto.randomUUID();
    // 10:37 local, so the repaired start must be 10:00 and not 11:00.
    const createdAt = new Date(2026, 8, 9, 10, 37, 0).getTime();
    const dateOnly = new Date(2026, 8, 9).getTime();

    const old = openV15(name);
    await old.open();
    await old.table("sessions").add({
      id: sessionId,
      classId: "c1",
      date: dateOnly,
      createdAt,
    });
    await old.table("attendance").add({
      sessionId,
      studentId,
      value: "present",
      updatedAt: createdAt,
    });
    await old.table("behaviourEvents").add({
      id: crypto.randomUUID(),
      sessionId,
      studentId,
      classId: "c1",
      type: "positive",
      createdAt,
    });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();

    const session = await fresh.sessions.get(sessionId);
    expect(session?.startsAt).toBe(10 * 60);
    expect(session?.endsAt).toBe(10 * 60 + 55);

    // The two assertions the whole design hangs on.
    expect(await fresh.attendance.where("sessionId").equals(sessionId).count()).toBe(1);
    expect(await fresh.behaviourEvents.where("sessionId").equals(sessionId).count()).toBe(1);

    fresh.close();
  });

  it("keeps BOTH séances of a collision reachable, not just present", async () => {
    // Two séances of the same class on the same day, created within the same
    // hour — precisely what `startSeance`'s old untimed branch produced
    // routinely, since it fired mid-lesson at the scheduled hour. Backfilling
    // each row in isolation would floor both to 10:00, and `resolveSlot`
    // always returns the first match, stranding the second — present in the
    // database, invisible everywhere the teacher looks.
    const name = `repro-collision-${crypto.randomUUID()}`;
    const dateOnly = new Date(2026, 8, 9).getTime();
    const createdEarly = new Date(2026, 8, 9, 10, 5, 0).getTime();
    const createdLate = new Date(2026, 8, 9, 10, 40, 0).getTime();

    const old = openV15(name);
    await old.open();
    await old.table("sessions").add({
      id: "s-early",
      classId: "c1",
      date: dateOnly,
      createdAt: createdEarly,
    });
    await old.table("sessions").add({
      id: "s-late",
      classId: "c1",
      date: dateOnly,
      createdAt: createdLate,
    });
    old.close();

    const fresh = openWorkspaceDb(name);
    await fresh.open();

    const early = await fresh.sessions.get("s-early");
    const late = await fresh.sessions.get("s-late");
    expect(early?.startsAt).toBe(10 * 60);
    // Nudged a minute forward rather than lost to the same hour as its
    // sibling — this is the assertion F1's bug would fail.
    expect(late?.startsAt).not.toBe(early?.startsAt);

    fresh.close();
  });
});
