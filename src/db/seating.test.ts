import "fake-indexeddb/auto";
import { PITCH } from "@domain/room";
import { buildRoom } from "@domain/room-templates";
import { openWorkspaceDb } from ".";
import {
  addTable,
  applyTemplate,
  clearSeat,
  getOrCreateLayout,
  moveTable,
  nudgeTable,
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

  it("displaces whoever already sits at the target", async () => {
    // The rule `resolveDrop`'s pool branch depends on: a pupil dropped from the
    // rail onto an occupied table takes the chair, and its occupant is unseated
    // rather than sharing it.
    const db = freshDb("seat-displace");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "p1");
    await seatStudent(db, seats[0].id, "p2");
    expect((await db.seats.get(seats[0].id))?.studentId).toBe("p2");
    const remaining = await seatsForLayout(db, layout.id);
    expect(remaining.some((s) => s.studentId === "p1")).toBe(false);
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

  it("writes nothing when the source table is empty", async () => {
    const db = freshDb("swap-empty-source");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, b.id, "p2");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBeNull();
    expect((await db.seats.get(b.id))?.studentId).toBe("p2");
    db.close();
  });

  it("is a no-op on the same table twice, never a way to erase a pupil", async () => {
    const db = freshDb("swap-self");
    const layout = await getOrCreateLayout(db, "c1");
    const [a] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await swapSeats(db, a.id, a.id);
    expect((await db.seats.get(a.id))?.studentId).toBe("p1");
    db.close();
  });

  it("refuses to exchange pupils across two rooms", async () => {
    const db = freshDb("swap-cross-room");
    const one = await getOrCreateLayout(db, "c1");
    const two = await getOrCreateLayout(db, "c2");
    const [a] = await seatsForLayout(db, one.id);
    const [b] = await seatsForLayout(db, two.id);
    await seatStudent(db, a.id, "p1");
    await seatStudent(db, b.id, "p2");
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBe("p1");
    expect((await db.seats.get(b.id))?.studentId).toBe("p2");
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

  it("writes nothing when the target table is gone", async () => {
    const db = freshDb("swap-target-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const [a, b] = await seatsForLayout(db, layout.id);
    await seatStudent(db, a.id, "p1");
    await removeTable(db, b.id);
    await swapSeats(db, a.id, b.id);
    expect((await db.seats.get(a.id))?.studentId).toBe("p1");
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

  it("refuses a move outside the room and leaves the original where it was", async () => {
    const db = freshDb("move-outside");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    expect(await moveTable(db, seats[0].id, { x: layout.width, y: 0 })).toBe(false);
    expect(await db.seats.get(seats[0].id)).toMatchObject({ x: seats[0].x, y: seats[0].y });
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

describe("nudgeTable", () => {
  it("moves by the delta and keeps the seat's id", async () => {
    const db = freshDb("nudge");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a] = seats;
    expect(await nudgeTable(db, a.id, { x: 0, y: -1 })).toBe(true);
    const moved = await db.seats.get(a.id);
    expect(moved).toMatchObject({ id: a.id, x: a.x, y: a.y - 1 });
    db.close();
  });

  it("carries its occupant along", async () => {
    const db = freshDb("nudge-occupied");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a] = seats;
    await seatStudent(db, a.id, "p1");
    await nudgeTable(db, a.id, { x: 0, y: -1 });
    expect((await db.seats.get(a.id))?.studentId).toBe("p1");
    db.close();
  });

  it("refuses a nudge into a neighbouring table and leaves the seat where it was", async () => {
    const db = freshDb("nudge-overlap");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a, ...rest] = seats;
    // A controlled neighbour, one PITCH away in x: closing the gap by 2 units
    // (leaving only 1) overlaps its footprint, regardless of where the
    // template happened to put the rest of the room.
    for (const other of rest) await removeTable(db, other.id);
    await db.seatingLayouts.put({ ...layout, width: layout.width + 10 });
    const neighbour = await addTable(db, layout.id, { x: a.x + PITCH, y: a.y });
    expect(neighbour).not.toBeNull();
    expect(await nudgeTable(db, a.id, { x: PITCH - 1, y: 0 })).toBe(false);
    expect(await db.seats.get(a.id)).toMatchObject({ x: a.x, y: a.y });
    db.close();
  });

  it("refuses a nudge that would leave the room", async () => {
    const db = freshDb("nudge-outside");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a] = seats;
    expect(await nudgeTable(db, a.id, { x: layout.width, y: 0 })).toBe(false);
    expect(await db.seats.get(a.id)).toMatchObject({ x: a.x, y: a.y });
    db.close();
  });

  it("returns false when the seat is gone", async () => {
    const db = freshDb("nudge-gone");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a] = seats;
    await removeTable(db, a.id);
    expect(await nudgeTable(db, a.id, { x: 1, y: 0 })).toBe(false);
    db.close();
  });

  it("moves a table two units when two nudges are applied in sequence without an intervening read", async () => {
    // The bug this pins: page.tsx used to read the seat's position once when
    // the keyboard effect subscribed and compute every keypress's target off
    // that same stale snapshot, so two fast presses both landed on
    // base + 1 rather than base and base + 2. nudgeTable reads the seat
    // fresh inside its own transaction, so awaiting two calls in a row must
    // actually walk the table two units — not silently rewrite the same
    // square twice. This would pass trivially if nudgeTable took an
    // absolute position instead of a delta, so the assertion is the whole
    // point: two AWAITED calls, no read in between, must sum their deltas.
    const db = freshDb("nudge-sequence");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    const [a, ...rest] = seats;
    // Clear every other table, and grow the room to the right, so two
    // 1-unit nudges have room regardless of where the template put `a`.
    for (const other of rest) await removeTable(db, other.id);
    await db.seatingLayouts.put({ ...layout, width: layout.width + 10 });
    const base = { x: a.x, y: a.y };
    await nudgeTable(db, a.id, { x: 1, y: 0 });
    await nudgeTable(db, a.id, { x: 1, y: 0 });
    const moved = await db.seats.get(a.id);
    expect(moved).toMatchObject({ x: base.x + 2, y: base.y });
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

  it("writes no orphan seats when the layout does not exist", async () => {
    const db = freshDb("stamp-orphan");
    const { overflow } = await applyTemplate(
      db,
      "missing",
      buildRoom({ id: "rows", rows: 2, cols: 2 }),
    );
    expect(overflow).toEqual([]);
    expect(await db.seats.count()).toBe(0);
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
