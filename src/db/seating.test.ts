import "fake-indexeddb/auto";
import { buildRoom } from "@domain/room-templates";
import { openWorkspaceDb } from ".";
import {
  addTable,
  applyTemplate,
  clearSeat,
  getOrCreateLayout,
  moveTable,
  removeTable,
  seatStudent,
  seatsForLayout,
  swapSeats,
} from "./seating";

function freshDb(name: string) {
  return openWorkspaceDb(`${name}-${crypto.randomUUID()}`);
}

describe("getOrCreateLayout", () => {
  it("stamps the default room the first time a class is looked at", async () => {
    const db = freshDb("layout");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    expect(seats).toHaveLength(30);
    expect(seats.every((s) => s.studentId === null)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    db.close();
  });

  it("is idempotent, so StrictMode cannot give one class two rooms", async () => {
    const db = freshDb("layout-once");
    const [a, b] = await Promise.all([getOrCreateLayout(db, "c1"), getOrCreateLayout(db, "c1")]);
    expect(a.id).toBe(b.id);
    expect(await db.seatingLayouts.where("classId").equals("c1").count()).toBe(1);
    db.close();
  });
});

describe("seatStudent", () => {
  it("seats a pupil and clears the table they held before", async () => {
    const db = freshDb("seat");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[5].id, "p1");
    expect((await db.seats.get(seats[0].id))?.studentId).toBeNull();
    expect((await db.seats.get(seats[5].id))?.studentId).toBe("p1");
    db.close();
  });

  it("writes nothing when the table has been removed by another tab", async () => {
    const db = freshDb("seat-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[0].id);
    await seatStudent(db, seats[0].id, "p1");
    expect(await db.seats.get(seats[0].id)).toBeUndefined();
    db.close();
  });
});

describe("swapSeats", () => {
  it("exchanges two occupants", async () => {
    const db = freshDb("swap");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await seatStudent(db, b.id, "p2");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBe("p2");
    expect((await db.seats.get(b.id))?.studentId).toBe("p1");
    db.close();
  });

  it("degrades to a move when the target is empty", async () => {
    const db = freshDb("swap-empty");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBeNull();
    expect((await db.seats.get(b.id))?.studentId).toBe("p1");
    db.close();
  });

  it("writes nothing when the source table is gone", async () => {
    const db = freshDb("swap-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, b.id, "p2");
    await removeTable(db, a.id);
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(b.id))?.studentId).toBe("p2");
    db.close();
  });
});

describe("clearSeat", () => {
  it("empties a table without removing it", async () => {
    const db = freshDb("clear");
    const layout = await getOrCreateLayout(db, "c1");
    const [a] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await clearSeat(db, a.id);
    expect(await db.seats.get(a.id)).toMatchObject({ studentId: null });
    db.close();
  });
});

describe("addTable", () => {
  it("refuses a spot that overlaps an existing table", async () => {
    const db = freshDb("add-overlap");
    const layout = await getOrCreateLayout(db, "c1");
    const [first] = await seatsForLayout(db, layout.id);
    const before = (await seatsForLayout(db, layout.id)).length;
    expect(await addTable(db, layout.id, { x: first.x + 1, y: first.y })).toBeNull();
    expect(await seatsForLayout(db, layout.id)).toHaveLength(before);
    db.close();
  });

  it("refuses a spot outside the room", async () => {
    const db = freshDb("add-outside");
    const layout = await getOrCreateLayout(db, "c1");
    expect(await addTable(db, layout.id, { x: layout.width, y: 0 })).toBeNull();
    db.close();
  });

  it("adds an empty table where there is room", async () => {
    const db = freshDb("add-ok");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[0].id);
    const added = await addTable(db, layout.id, { x: seats[0].x, y: seats[0].y });
    expect(added).not.toBeNull();
    expect(added?.studentId).toBeNull();
    db.close();
  });
});

describe("moveTable", () => {
  it("keeps the table's id, so anything holding it keeps holding it", async () => {
    const db = freshDb("move");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await removeTable(db, seats[1].id);
    expect(await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y })).toBe(true);
    const moved = await db.seats.get(seats[0].id);
    expect(moved).toMatchObject({ x: seats[1].x, y: seats[1].y });
    db.close();
  });

  it("carries its occupant along", async () => {
    const db = freshDb("move-occupied");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await removeTable(db, seats[1].id);
    await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y });
    expect((await db.seats.get(seats[0].id))?.studentId).toBe("p1");
    db.close();
  });

  it("refuses a move onto another table and leaves the original where it was", async () => {
    const db = freshDb("move-overlap");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    expect(await moveTable(db, seats[0].id, { x: seats[1].x, y: seats[1].y })).toBe(false);
    expect(await db.seats.get(seats[0].id)).toMatchObject({ x: seats[0].x, y: seats[0].y });
    db.close();
  });
});

describe("removeTable", () => {
  it("removes the table, and its occupant is unseated by that alone", async () => {
    const db = freshDb("remove");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await removeTable(db, seats[0].id);
    expect(await db.seats.get(seats[0].id)).toBeUndefined();
    const remaining = await seatsForLayout(db, layout.id);
    expect(remaining.some((s) => s.studentId === "p1")).toBe(false);
    db.close();
  });
});

describe("applyTemplate", () => {
  it("replaces the room and keeps seated pupils in reading order", async () => {
    const db = freshDb("stamp");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = (await seatsForLayout(db, layout.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[1].id, "p2");

    const { overflow } = await applyTemplate(
      db,
      layout.id,
      buildRoom({ id: "arc", perRow: 8, rows: 1, curve: 3 }),
    );

    expect(overflow).toEqual([]);
    const after = (await seatsForLayout(db, layout.id)).sort((a, b) => a.y - b.y || a.x - b.x);
    expect(after).toHaveLength(8);
    expect(after[0].studentId).toBe("p1");
    expect(after[1].studentId).toBe("p2");
    db.close();
  });

  it("reports the pupils who no longer fit", async () => {
    const db = freshDb("stamp-overflow");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[1].id, "p2");
    const { overflow } = await applyTemplate(
      db,
      layout.id,
      buildRoom({ id: "rows", rows: 1, cols: 1 }),
    );
    expect(overflow).toHaveLength(1);
    db.close();
  });

  it("resizes the room to the stamp", async () => {
    const db = freshDb("stamp-size");
    const layout = await getOrCreateLayout(db, "c1");
    const shape = buildRoom({ id: "u", cols: 6, rows: 3 });
    await applyTemplate(db, layout.id, shape);
    expect(await db.seatingLayouts.get(layout.id)).toMatchObject({
      width: shape.width,
      height: shape.height,
    });
    db.close();
  });
});
