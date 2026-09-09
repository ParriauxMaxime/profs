import "fake-indexeddb/auto";
import { classifyOpenFailure, offersDiscard } from "@domain/recovery";
import Dexie from "dexie";
import { attendanceKey, criterionLevelKey, groupMemberKey, openWorkspaceDb } from ".";

describe("the schema", () => {
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
        "criterionLevels",
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

describe("a workspace built by an earlier version of the app", () => {
  it("opens rather than bricking, keeping every row in every store the schema still names", async () => {
    // The schema is a single version now, so an existing database can only
    // ever be AHEAD of the code. The design predicted a `VersionError`
    // reaching `RecoveryShell`; DEXIE ABSORBS IT. `dexieOpen` catches
    // `VersionError`, retries with no version at all, and then patches the
    // declared schema into whatever it found — the console warns "Schema was
    // extended without increasing the number passed to db.version()". That is
    // library behaviour, identical in a browser, not a `fake-indexeddb` quirk:
    // a raw `indexedDB.open(name, 10)` against a database at 160 really does
    // fail with `VersionError`, and Dexie really does swallow it.
    //
    // So the collapse costs a teacher their grilles, exactly as intended, but
    // it reaches that outcome by carrying the workspace forward rather than by
    // discarding it. Task 1's `VersionError` → `corrupt` fix still stands on
    // its own — see `src/domain/recovery.test.ts` — it simply is not what
    // saves this.
    const workspaceId = crypto.randomUUID();
    const old = new Dexie(`profs-${workspaceId}`);
    old.version(16).stores({
      classes: "id, name",
      rubricAssessments: "id, gradebookId, periodId, date",
      rubricScores: "[assessmentId+criterionId+studentId], assessmentId, criterionId, studentId",
    });
    await old.open();
    await old.table("classes").add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    await old.table("rubricScores").add({
      assessmentId: "a1",
      criterionId: "cr1",
      studentId: "p1",
      level: 3,
      updatedAt: 1,
    });
    old.close();

    const fresh = openWorkspaceDb(workspaceId);
    const error = await fresh.open().then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeNull();
    // The class survives, and every store the collapsed schema declares is
    // there to be written to.
    expect(await fresh.classes.count()).toBe(1);
    expect(await fresh.criterionLevels.count()).toBe(0);
    expect(fresh.tables.map((t) => t.name)).toContain("criterionLevels");
    // What the collapse cannot do is REMOVE a store: `stores({ x: null })` was
    // the only mechanism, and there is no version left to say it in. The old
    // grille stores stay in IndexedDB, out of `db.tables` — which means
    // `wipeWorkspace` and the backup's clear list, both of which read
    // `db.tables`, never reach them. Their rows outlive "supprimer toutes les
    // données"; only deleting the workspace's database removes them.
    expect(fresh.tables.map((t) => t.name)).not.toContain("rubricScores");
    expect(Array.from(fresh.backendDB().objectStoreNames)).toContain("rubricScores");
    fresh.close();
  });

  it("classifies a VersionError that does reach a caller as discardable", async () => {
    // The guarantee that stands between a schema change and a blank page,
    // asserted here at the seam rather than only in the domain: a raw open
    // below the stored version fails, and that failure must land on the branch
    // offering the discard — otherwise the panel shows one button that fails
    // identically, forever, with the pupils still in IndexedDB.
    const name = `profs-${crypto.randomUUID()}`;
    const ahead = new Dexie(name);
    ahead.version(99).stores({ classes: "id, name" });
    await ahead.open();
    ahead.close();

    const error = await new Promise<unknown>((resolve) => {
      const request = indexedDB.open(name, 10);
      request.onsuccess = () => {
        request.result.close();
        resolve(null);
      };
      request.onerror = () => resolve(request.error);
    });

    expect((error as Error | null)?.name).toBe("VersionError");
    expect(classifyOpenFailure(error)).toBe("corrupt");
    expect(offersDiscard(classifyOpenFailure(error))).toBe(true);
  });
});

describe("criterionLevels", () => {
  it("builds a level key", () => {
    expect(criterionLevelKey("col", "crit", "adam")).toEqual(["col", "crit", "adam"]);
  });

  it("round-trips a level on its compound key", async () => {
    const db = openWorkspaceDb(crypto.randomUUID());
    await db.criterionLevels.put({
      columnId: "col",
      criterionId: "crit",
      studentId: "adam",
      level: 3,
      updatedAt: Date.now(),
    });
    const found = await db.criterionLevels.get(criterionLevelKey("col", "crit", "adam"));
    expect(found?.level).toBe(3);
    db.close();
  });
});
