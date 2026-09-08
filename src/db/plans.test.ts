import "fake-indexeddb/auto";
import type { Placement } from "@domain/room";
import { type AppDatabase, openWorkspaceDb } from ".";
import {
  applyPlacement,
  assignmentsForPlan,
  getOrCreatePlan,
  plansForClass,
  plansForRoom,
  unassign,
} from "./plans";

let db: AppDatabase;
const PLAN = "p1";

beforeEach(async () => {
  db = openWorkspaceDb(crypto.randomUUID());
  await db.open();
});

afterEach(() => {
  db.close();
});

/** Who sits where, as a plain map, so an assertion reads like the room does. */
async function seating(): Promise<Record<string, string>> {
  const rows = await assignmentsForPlan(db, PLAN);
  return Object.fromEntries(rows.map((a) => [a.deskId, a.studentId]));
}

const place = (
  studentId: string,
  deskId: string,
  displaced: { studentId: string; deskId: string | null } | null,
): Placement => ({ kind: "place", studentId, deskId, displaced });

describe("applyPlacement", () => {
  it("seats a pupil from the rail on an empty desk", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    expect(await seating()).toEqual({ d0: "s1" });
  });

  it("swaps two seated pupils in one transaction", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, PLAN, place("s2", "d1", null));
    await applyPlacement(db, PLAN, place("s1", "d1", { studentId: "s2", deskId: "d0" }));
    expect(await seating()).toEqual({ d0: "s2", d1: "s1" });
  });

  it("displaces an occupant to the rail, leaving them no assignment at all", async () => {
    await applyPlacement(db, PLAN, place("s2", "d0", null));
    await applyPlacement(db, PLAN, place("s1", "d0", { studentId: "s2", deskId: null }));
    expect(await seating()).toEqual({ d0: "s1" });
    expect(await db.assignments.where({ planId: PLAN, studentId: "s2" }).count()).toBe(0);
  });

  it("never lets one pupil hold two places", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, PLAN, place("s1", "d1", null));
    expect(await db.assignments.where({ planId: PLAN, studentId: "s1" }).count()).toBe(1);
    expect(await seating()).toEqual({ d1: "s1" });
  });

  it("keeps one pupil per desk", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, PLAN, place("s2", "d0", { studentId: "s1", deskId: null }));
    expect(await seating()).toEqual({ d0: "s2" });
  });

  it("writes nothing for a refused placement", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, PLAN, { kind: "none" });
    expect(await seating()).toEqual({ d0: "s1" });
  });

  it("leaves another class's plan in the same salle untouched", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, "p2", place("s9", "d0", null));
    expect(await seating()).toEqual({ d0: "s1" });
    expect(await db.assignments.where("planId").equals("p2").count()).toBe(1);
  });
});

describe("the unique indexes", () => {
  // These two assert the DATABASE refuses, not that our code avoids it. Without
  // them the delete-before-put ordering in `applyPlacement` is untested
  // ceremony: a reader could reorder it and every other test would still pass.
  it("refuses one pupil in two chairs", async () => {
    await db.assignments.put({ planId: PLAN, deskId: "d0", studentId: "s1" });
    await expect(
      db.assignments.put({ planId: PLAN, deskId: "d1", studentId: "s1" }),
    ).rejects.toThrow();
    expect(await seating()).toEqual({ d0: "s1" });
  });

  it("lets the same pupil sit in two different plans", async () => {
    await db.assignments.put({ planId: PLAN, deskId: "d0", studentId: "s1" });
    await db.assignments.put({ planId: "p2", deskId: "d0", studentId: "s1" });
    expect(await db.assignments.where("studentId").equals("s1").count()).toBe(2);
  });

  it("refuses two desks on the same square of one salle", async () => {
    await db.desks.add({ id: "a", roomId: "r1", x: 2, y: 2 });
    await expect(db.desks.add({ id: "b", roomId: "r1", x: 2, y: 2 })).rejects.toThrow();
    await db.desks.add({ id: "c", roomId: "r2", x: 2, y: 2 });
    expect(await db.desks.count()).toBe(2);
  });

  it("refuses a second plan for one class in one salle", async () => {
    await getOrCreatePlan(db, "c1", "r1");
    await expect(
      db.seatingPlans.add({ id: "other", classId: "c1", roomId: "r1", updatedAt: 1 }),
    ).rejects.toThrow();
  });
});

describe("unassign", () => {
  it("removes a pupil without touching anyone else", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await applyPlacement(db, PLAN, place("s2", "d1", null));
    await unassign(db, PLAN, "s1");
    expect(await seating()).toEqual({ d1: "s2" });
  });

  it("is a no-op for a pupil who has no place", async () => {
    await applyPlacement(db, PLAN, place("s1", "d0", null));
    await unassign(db, PLAN, "s9");
    expect(await seating()).toEqual({ d0: "s1" });
  });
});

describe("getOrCreatePlan", () => {
  it("gives a class the same plan twice for one salle", async () => {
    const a = await getOrCreatePlan(db, "c1", "r1");
    const b = await getOrCreatePlan(db, "c1", "r1");
    expect(b.id).toBe(a.id);
    expect(await db.seatingPlans.count()).toBe(1);
  });

  it("gives a class a different plan per salle", async () => {
    const a = await getOrCreatePlan(db, "c1", "r1");
    const b = await getOrCreatePlan(db, "c1", "r2");
    expect(b.id).not.toBe(a.id);
  });

  it("gives two classes different plans in the same salle", async () => {
    const a = await getOrCreatePlan(db, "c1", "r1");
    const b = await getOrCreatePlan(db, "c2", "r1");
    expect(b.id).not.toBe(a.id);
  });

  it("survives being called twice at once, as a double-invoked effect does", async () => {
    const [a, b] = await Promise.all([
      getOrCreatePlan(db, "c1", "r1"),
      getOrCreatePlan(db, "c1", "r1"),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.seatingPlans.count()).toBe(1);
  });
});

describe("listing plans", () => {
  it("names every class that would lose an arrangement with a salle", async () => {
    await getOrCreatePlan(db, "c1", "r1");
    await getOrCreatePlan(db, "c2", "r1");
    await getOrCreatePlan(db, "c1", "r2");
    expect((await plansForRoom(db, "r1")).map((p) => p.classId).sort()).toEqual(["c1", "c2"]);
  });

  it("names every salle a class is taught in", async () => {
    await getOrCreatePlan(db, "c1", "r1");
    await getOrCreatePlan(db, "c1", "r2");
    expect((await plansForClass(db, "c1")).map((p) => p.roomId).sort()).toEqual(["r1", "r2"]);
  });
});
