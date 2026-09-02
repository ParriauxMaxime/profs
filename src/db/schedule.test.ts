import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { allEntries, entriesForClass, saveScheduleEntry } from "./schedule";

function freshDb(label: string) {
  return openWorkspaceDb(`schedule-${label}-${crypto.randomUUID()}`);
}

const BASE = {
  classId: "c1",
  weekday: 1,
  startMinute: 600,
  endMinute: 660,
  weekCycle: "all" as const,
};

describe("saveScheduleEntry", () => {
  it("creates an entry", async () => {
    const db = freshDb("create");
    const result = await saveScheduleEntry(db, { ...BASE, room: "  B12  " });

    expect(result.saved).toBe(true);
    const entry = await db.scheduleEntries.get((result as { id: string }).id);
    expect(entry?.weekday).toBe(1);
    expect(entry?.room).toBe("B12");
    expect(entry?.weekCycle).toBe("all");
    db.close();
  });

  it("omits absent optional fields rather than storing undefined", async () => {
    const db = freshDb("optional");
    const result = await saveScheduleEntry(db, { ...BASE, room: "   " });
    const entry = await db.scheduleEntries.get((result as { id: string }).id);

    expect(entry).not.toHaveProperty("room");
    expect(entry).not.toHaveProperty("subjectId");
    expect(entry).not.toHaveProperty("gradebookId");
    db.close();
  });

  it("updates in place, keeping createdAt", async () => {
    const db = freshDb("update");
    const created = await saveScheduleEntry(db, BASE);
    const id = (created as { id: string }).id;
    const before = await db.scheduleEntries.get(id);

    await saveScheduleEntry(db, { ...BASE, id, startMinute: 480, endMinute: 540 });

    expect(await db.scheduleEntries.count()).toBe(1);
    const after = await db.scheduleEntries.get(id);
    expect(after?.startMinute).toBe(480);
    expect(after?.createdAt).toBe(before?.createdAt);
    db.close();
  });

  it("refuses a lesson that ends before it starts, writing nothing", async () => {
    const db = freshDb("inverted");
    const result = await saveScheduleEntry(db, { ...BASE, startMinute: 660, endMinute: 600 });

    expect(result).toEqual({ saved: false, reason: "invalid-range" });
    expect(await db.scheduleEntries.count()).toBe(0);
    db.close();
  });

  it("refuses a lesson of no length", async () => {
    const db = freshDb("zero");
    const result = await saveScheduleEntry(db, { ...BASE, startMinute: 600, endMinute: 600 });

    expect(result).toEqual({ saved: false, reason: "invalid-range" });
    expect(await db.scheduleEntries.count()).toBe(0);
    db.close();
  });

  it("refuses a weekday outside 1-7", async () => {
    const db = freshDb("weekday");
    expect(await saveScheduleEntry(db, { ...BASE, weekday: 0 })).toEqual({
      saved: false,
      reason: "invalid-weekday",
    });
    expect(await saveScheduleEntry(db, { ...BASE, weekday: 8 })).toEqual({
      saved: false,
      reason: "invalid-weekday",
    });
    expect(await db.scheduleEntries.count()).toBe(0);
    db.close();
  });

  it("refusing an update leaves the stored entry untouched", async () => {
    const db = freshDb("refuse-update");
    const created = await saveScheduleEntry(db, BASE);
    const id = (created as { id: string }).id;

    await saveScheduleEntry(db, { ...BASE, id, startMinute: 700, endMinute: 600 });

    const entry = await db.scheduleEntries.get(id);
    expect([entry?.startMinute, entry?.endMinute]).toEqual([600, 660]);
    db.close();
  });
});

describe("entriesForClass and allEntries", () => {
  it("reads a week in order, and only that class's lessons", async () => {
    const db = freshDb("read");
    await saveScheduleEntry(db, { ...BASE, weekday: 3, startMinute: 540, endMinute: 600 });
    await saveScheduleEntry(db, { ...BASE, weekday: 1, startMinute: 480, endMinute: 540 });
    await saveScheduleEntry(db, { ...BASE, weekday: 1, startMinute: 600, endMinute: 660 });
    await saveScheduleEntry(db, { ...BASE, classId: "c2", weekday: 2 });

    const c1 = await entriesForClass(db, "c1");
    expect(c1.map((e) => [e.weekday, e.startMinute])).toEqual([
      [1, 480],
      [1, 600],
      [3, 540],
    ]);

    expect((await allEntries(db)).length).toBe(4);
    db.close();
  });
});
