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
        "settings",
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
  /**
   * A workspace at the old schema, holding a row in every store this
   * declaration drops, plus whatever untimed séances a test asks for.
   *
   * Every dropped store is really WRITTEN to, not merely declared: a store the
   * fixture never filled would be deleted whether or not the declaration says
   * so, and the absence assertion below would prove nothing.
   *
   * `seats`, `seatingLayouts` and `diaryEntries` were dropped by versions 12
   * and 14 of the chain, so a database that walked the whole chain would not
   * carry them. This one declares them anyway, because it stands in for the
   * deleted v12 and v14 seam tests: what is asserted is that the CURRENT
   * declaration removes anything it does not name, whatever a database happens
   * to hold.
   *
   * Each séance is given an attendance mark and a behaviour event keyed to it,
   * because a séance with dependents is the case the upgrade exists for — a
   * bare one could be dropped rather than repaired.
   */
  async function buildOldWorkspace(
    workspaceId: string,
    sessions: Array<{ id: string; classId: string; date: number; createdAt: number }> = [],
  ): Promise<void> {
    const old = new Dexie(`profs-${workspaceId}`);
    old.version(16).stores({
      classes: "id, name",
      sessions: "id, classId, date, [classId+date], subjectId",
      attendance: "[sessionId+studentId], sessionId, studentId",
      behaviourEvents: "id, sessionId, studentId, classId, createdAt",
      rubricAssessments: "id, gradebookId, periodId, date",
      rubricScores: "[assessmentId+criterionId+studentId], assessmentId, criterionId, studentId",
      seats: "id, layoutId, studentId, &[layoutId+x+y]",
      seatingLayouts: "id, classId",
      diaryEntries: "[classId+date], classId, date",
    });
    await old.open();
    await old.table("classes").add({ id: "c1", name: "3°B", createdAt: 1, updatedAt: 1 });
    await old.table("rubricAssessments").add({
      id: "a1",
      gradebookId: "g1",
      periodId: "pe1",
      name: "Oral",
      date: 1,
      criteria: [{ id: "cr1", label: "Clarté" }],
      createdAt: 1,
      updatedAt: 1,
    });
    await old.table("rubricScores").add({
      assessmentId: "a1",
      criterionId: "cr1",
      studentId: "p1",
      level: 3,
      updatedAt: 1,
    });
    await old.table("seatingLayouts").add({ id: "l1", classId: "c1", rows: 5, cols: 6 });
    await old.table("seats").add({ id: "s1", layoutId: "l1", studentId: "p1", x: 0, y: 0 });
    await old.table("diaryEntries").add({ classId: "c1", date: 0, text: "vieux" });
    for (const session of sessions) {
      // No `startsAt`, no `endsAt` — the shape a séance had before v16.
      await old.table("sessions").add(session);
      await old.table("attendance").add({
        sessionId: session.id,
        studentId: "p1",
        value: "present",
        updatedAt: session.createdAt,
      });
      await old.table("behaviourEvents").add({
        id: crypto.randomUUID(),
        sessionId: session.id,
        studentId: "p1",
        classId: session.classId,
        type: "positive",
        createdAt: session.createdAt,
      });
    }
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
    await buildOldWorkspace(workspaceId);

    const fresh = openWorkspaceDb(workspaceId);
    await fresh.open();

    const stores = Array.from(fresh.backendDB().objectStoreNames);
    // Listed per store so a failure names which one survived.
    for (const gone of [
      "rubricAssessments",
      "rubricScores",
      "seats",
      "seatingLayouts",
      "diaryEntries",
    ]) {
      expect([gone, stores.includes(gone)]).toEqual([gone, false]);
    }
    expect(stores).toContain("criterionLevels");
    fresh.close();
  });

  it("carries every surviving store forward with its rows, and never reaches the recovery shell", async () => {
    // The upgrade runs forwards, as an upgrade. A grille already graded is
    // lost because its STORE is dropped, not because the workspace is
    // discarded — nothing rejects, so `initWorkspace` never rejects either.
    const workspaceId = crypto.randomUUID();
    await buildOldWorkspace(workspaceId);

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

  it("gives an untimed séance a start and an end, and keeps what hangs off it", async () => {
    // `sessions` is carried FORWARD rather than dropped, which is what makes
    // this necessary: `Session.startsAt` and `endsAt` are required on the
    // type, so a séance recorded before séances carried times is a row that
    // fails its own declaration. Dropping the store instead would strand every
    // attendance mark and behaviour event keyed to it — the reason
    // `db.version(16)` wrote an upgrade rather than a `null`, unchanged by the
    // collapse.
    const workspaceId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    // 10:37 local, so the repaired start must be 10:00 and not 11:00.
    const createdAt = new Date(2026, 8, 9, 10, 37, 0).getTime();
    await buildOldWorkspace(workspaceId, [
      { id: sessionId, classId: "c1", date: new Date(2026, 8, 9).getTime(), createdAt },
    ]);

    const fresh = openWorkspaceDb(workspaceId);
    await fresh.open();

    const session = await fresh.sessions.get(sessionId);
    expect(session?.startsAt).toBe(10 * 60);
    expect(session?.endsAt).toBe(10 * 60 + 55);
    // The two assertions the whole exception hangs on.
    expect(await fresh.attendance.where("sessionId").equals(sessionId).count()).toBe(1);
    expect(await fresh.behaviourEvents.where("sessionId").equals(sessionId).count()).toBe(1);
    fresh.close();
  });

  it("keeps BOTH untimed séances of one class on one day reachable, not just present", async () => {
    // Repaired as a whole collection, never row by row: backfilling each in
    // isolation floors both to 10:00, and `resolveSlot` returns the first
    // match — leaving the second in the database and invisible everywhere the
    // teacher looks.
    const workspaceId = crypto.randomUUID();
    const day = new Date(2026, 8, 9).getTime();
    await buildOldWorkspace(workspaceId, [
      { id: "s-early", classId: "c1", date: day, createdAt: new Date(2026, 8, 9, 10, 5).getTime() },
      { id: "s-late", classId: "c1", date: day, createdAt: new Date(2026, 8, 9, 10, 40).getTime() },
    ]);

    const fresh = openWorkspaceDb(workspaceId);
    await fresh.open();

    const early = await fresh.sessions.get("s-early");
    const late = await fresh.sessions.get("s-late");
    expect(early?.startsAt).toBe(10 * 60);
    expect(late?.startsAt).not.toBe(early?.startsAt);
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
