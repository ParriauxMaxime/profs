import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { addToGroup, removeFromGroup, saveGroup, setGroupMembers } from "./groups";

describe("saveGroup", () => {
  it("creates a group with a normalised name", async () => {
    const db = openWorkspaceDb(`groups-create-${crypto.randomUUID()}`);
    const id = await saveGroup(db, {
      classId: "c1",
      name: "  Groupe A  ",
      color: "#2563eb",
    });

    const group = await db.studentGroups.get(id);
    expect(group?.name).toBe("Groupe A");
    expect(group?.classId).toBe("c1");
    expect(group?.color).toBe("#2563eb");
    db.close();
  });

  it("updates an existing group in place, keeping its id", async () => {
    const db = openWorkspaceDb(`groups-update-${crypto.randomUUID()}`);
    const id = await saveGroup(db, { classId: "c1", name: "Groupe A", color: "#2563eb" });

    const returned = await saveGroup(db, {
      groupId: id,
      classId: "c1",
      name: "Groupe B",
      color: "#16a34a",
    });

    expect(returned).toBe(id);
    expect(await db.studentGroups.count()).toBe(1);
    const group = await db.studentGroups.get(id);
    expect(group?.name).toBe("Groupe B");
    expect(group?.color).toBe("#16a34a");
    db.close();
  });

  it("refuses an empty name, writing nothing", async () => {
    const db = openWorkspaceDb(`groups-empty-${crypto.randomUUID()}`);

    await expect(saveGroup(db, { classId: "c1", name: "   ", color: "#2563eb" })).rejects.toThrow();

    expect(await db.studentGroups.count()).toBe(0);
    db.close();
  });
});

describe("addToGroup / removeFromGroup", () => {
  it("adds and removes a single membership without touching others", async () => {
    const db = openWorkspaceDb(`groups-membership-${crypto.randomUUID()}`);
    await db.groupMembers.put({ groupId: "g1", studentId: "other" });

    await addToGroup(db, "g1", "p1");
    expect(await db.groupMembers.get(["g1", "p1"])).toBeDefined();
    expect(await db.groupMembers.count()).toBe(2);

    await removeFromGroup(db, "g1", "p1");
    expect(await db.groupMembers.get(["g1", "p1"])).toBeUndefined();
    expect(await db.groupMembers.get(["g1", "other"])).toBeDefined();
    expect(await db.groupMembers.count()).toBe(1);
    db.close();
  });
});

describe("setGroupMembers", () => {
  it("replaces the whole membership set", async () => {
    const db = openWorkspaceDb(`groups-set-${crypto.randomUUID()}`);
    await db.groupMembers.bulkPut([
      { groupId: "g1", studentId: "p1" },
      { groupId: "g1", studentId: "p2" },
      { groupId: "g2", studentId: "p1" },
    ]);

    await setGroupMembers(db, "g1", ["p2", "p3"]);

    const g1Members = (await db.groupMembers.where("groupId").equals("g1").toArray())
      .map((m) => m.studentId)
      .sort();
    expect(g1Members).toEqual(["p2", "p3"]);
    // A different group's membership is untouched.
    expect(await db.groupMembers.get(["g2", "p1"])).toBeDefined();
    db.close();
  });

  it("clears membership when given an empty list", async () => {
    const db = openWorkspaceDb(`groups-set-empty-${crypto.randomUUID()}`);
    await db.groupMembers.bulkPut([
      { groupId: "g1", studentId: "p1" },
      { groupId: "g1", studentId: "p2" },
    ]);

    await setGroupMembers(db, "g1", []);

    expect(await db.groupMembers.where("groupId").equals("g1").count()).toBe(0);
    db.close();
  });
});
