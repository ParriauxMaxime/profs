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

describe("a workspace built by the chain this declaration replaces", () => {
  /** A v16 workspace holding a class and a grille scored under the old key. */
  async function buildV16(workspaceId: string): Promise<void> {
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
  }

  it("really deletes the stores the schema no longer declares", async () => {
    // Asserted against `backendDB().objectStoreNames` and NOT against
    // `db.tables`, and the difference is the whole test.
    //
    // Numbered BELOW the stored version — `db.version(1)`, which this
    // declaration briefly was — Dexie never surfaces the `VersionError`: it
    // catches it, reopens with no version, and patches the declared schema in.
    // `db.tables` then reads exactly as it does here, so a `db.tables`
    // assertion passes either way, while `rubricScores` sits in IndexedDB with
    // its rows. `wipeWorkspace` and the backup's clear list both read
    // `db.tables`, so a pupil's levels would outlive "supprimer toutes les
    // données" — the erase `PRIVACY.md` calls permanent.
    const workspaceId = crypto.randomUUID();
    await buildV16(workspaceId);

    const fresh = openWorkspaceDb(workspaceId);
    await fresh.open();

    const stores = Array.from(fresh.backendDB().objectStoreNames);
    expect(stores).not.toContain("rubricScores");
    expect(stores).not.toContain("rubricAssessments");
    expect(stores).toContain("criterionLevels");
    fresh.close();
  });

  it("carries every surviving store forward with its rows, and never reaches the recovery shell", async () => {
    // The upgrade runs forwards, as an upgrade. A grille already graded is
    // lost because its STORE is dropped, not because the workspace is
    // discarded — nothing rejects, so `initWorkspace` never rejects either.
    const workspaceId = crypto.randomUUID();
    await buildV16(workspaceId);

    const fresh = openWorkspaceDb(workspaceId);
    const error = await fresh.open().then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeNull();
    expect(await fresh.classes.count()).toBe(1);
    expect(await fresh.criterionLevels.count()).toBe(0);
    fresh.close();
  });

  it("classifies a VersionError that does reach a caller as discardable", async () => {
    // No longer what saves the collapse — Dexie swallows the downgrade, and
    // the two tests above are what this design rests on. It stands on its own
    // anyway: a device running a stale service-worker shell after any bump can
    // still meet a `VersionError`, and it must land on the branch offering the
    // discard, or the panel shows one button that fails identically, forever,
    // with the pupils still in IndexedDB.
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
