import "fake-indexeddb/auto";
import { openWorkspaceDb, seatKey } from ".";
import {
  clearSeat,
  getOrCreateLayout,
  makeGap,
  makeSeat,
  moveSeat,
  resizeLayout,
  seatStudent,
  swapSeats,
} from "./seating";

function freshDb(label: string) {
  return openWorkspaceDb(`seating-${label}-${crypto.randomUUID()}`);
}

describe("getOrCreateLayout", () => {
  it("creates a default room filled with empty seats", async () => {
    const db = freshDb("create");
    const layout = await getOrCreateLayout(db, "c1");

    expect(layout.rows).toBe(5);
    expect(layout.cols).toBe(6);
    expect(await db.seats.where("layoutId").equals(layout.id).count()).toBe(30);
    expect(
      await db.seats
        .where("layoutId")
        .equals(layout.id)
        .filter((s) => s.studentId !== null)
        .count(),
    ).toBe(0);
    db.close();
  });

  it("returns the same room when called twice concurrently", async () => {
    // StrictMode invokes the effect twice. Two layouts for one class would
    // split a teacher's seating in half, and neither half looks wrong.
    const db = freshDb("idempotent");
    const [a, b] = await Promise.all([getOrCreateLayout(db, "c1"), getOrCreateLayout(db, "c1")]);

    expect(a.id).toBe(b.id);
    expect(await db.seatingLayouts.where("classId").equals("c1").count()).toBe(1);
    db.close();
  });
});

describe("seatStudent", () => {
  it("clears the pupil's previous chair in the same write", async () => {
    const db = freshDb("seat-move");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await seatStudent(db, layout.id, 1, 2, "s1");

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 1, 2)))?.studentId).toBe("s1");
    // Exactly one chair, never two.
    const occupied = await db.seats
      .where("layoutId")
      .equals(layout.id)
      .filter((s) => s.studentId === "s1")
      .toArray();
    expect(occupied).toHaveLength(1);
    db.close();
  });

  it("is a no-op when the pupil is already in that seat", async () => {
    const db = freshDb("seat-same");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await seatStudent(db, layout.id, 0, 0, "s1");

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s1");
    db.close();
  });
});

describe("moveSeat", () => {
  it("leaves the source as an empty seat, not a gap", async () => {
    const db = freshDb("move");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await moveSeat(db, layout.id, { row: 0, col: 0 }, { row: 3, col: 4 });

    const source = await db.seats.get(seatKey(layout.id, 0, 0));
    expect(source).toBeDefined();
    expect(source?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 3, 4)))?.studentId).toBe("s1");
    db.close();
  });

  it("does nothing when the source and target are the same seat", async () => {
    const db = freshDb("move-self");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 2, 2, "s1");
    await moveSeat(db, layout.id, { row: 2, col: 2 }, { row: 2, col: 2 });

    expect((await db.seats.get(seatKey(layout.id, 2, 2)))?.studentId).toBe("s1");
    db.close();
  });

  it("does nothing when the source seat is empty", async () => {
    const db = freshDb("move-empty");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 1, 1, "s2");
    await moveSeat(db, layout.id, { row: 0, col: 0 }, { row: 1, col: 1 });

    expect((await db.seats.get(seatKey(layout.id, 1, 1)))?.studentId).toBe("s2");
    db.close();
  });
});

describe("clearSeat, makeSeat and makeGap", () => {
  it("keeps the three seat states distinct", async () => {
    const db = freshDb("states");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");

    await clearSeat(db, layout.id, 0, 0);
    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();

    await makeGap(db, layout.id, 0, 0);
    expect(await db.seats.get(seatKey(layout.id, 0, 0))).toBeUndefined();

    await makeSeat(db, layout.id, 0, 0);
    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    db.close();
  });
});

describe("resizeLayout", () => {
  it("reports the pupils whose chair falls outside the new room", async () => {
    const db = freshDb("resize-unseat");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 4, 5, "s1");
    await seatStudent(db, layout.id, 0, 0, "s2");

    const { unseated } = await resizeLayout(db, layout, 2, 2);

    expect(unseated).toEqual(["s1"]);
    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s2");
    expect(await db.seats.where("layoutId").equals(layout.id).count()).toBe(4);
    db.close();
  });

  it("does not refill a carved gap when the room grows", async () => {
    // The bug this pins: inferring the old extent from the seats that survive
    // meant carving away a whole edge row lowered the inferred extent, so the
    // next resize saw that row as new growth and put the aisle back.
    const db = freshDb("resize-gap");
    const layout = await getOrCreateLayout(db, "c1");
    for (let col = 0; col < 6; col += 1) await makeGap(db, layout.id, 4, col);

    await resizeLayout(db, { ...layout, rows: 5, cols: 6 }, 5, 8);

    const row4 = await db.seats
      .where("layoutId")
      .equals(layout.id)
      .filter((s) => s.row === 4)
      .toArray();
    // Only the two columns the room actually gained.
    expect(row4.map((s) => s.col).sort((a, b) => a - b)).toEqual([6, 7]);
    db.close();
  });

  it("stores the new extent on the layout", async () => {
    const db = freshDb("resize-extent");
    const layout = await getOrCreateLayout(db, "c1");
    await resizeLayout(db, layout, 3, 4);

    const stored = await db.seatingLayouts.get(layout.id);
    expect([stored?.rows, stored?.cols]).toEqual([3, 4]);
    expect(await db.seats.where("layoutId").equals(layout.id).count()).toBe(12);
    db.close();
  });
});

describe("swapSeats", () => {
  it("exchanges two occupants", async () => {
    const db = freshDb("swap-two");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await seatStudent(db, layout.id, 2, 3, "s2");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 2, col: 3 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s2");
    expect((await db.seats.get(seatKey(layout.id, 2, 3)))?.studentId).toBe("s1");
    db.close();
  });

  it("behaves as a move when the target is an empty seat", async () => {
    const db = freshDb("swap-empty");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 4, col: 5 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 4, 5)))?.studentId).toBe("s1");
    db.close();
  });

  it("changes nothing when a cell is swapped with itself", async () => {
    const db = freshDb("swap-self");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 1, 1, "s1");

    await swapSeats(db, layout.id, { row: 1, col: 1 }, { row: 1, col: 1 });

    expect((await db.seats.get(seatKey(layout.id, 1, 1)))?.studentId).toBe("s1");
    db.close();
  });

  it("refuses to swap into a gap rather than creating a seat there", async () => {
    // A gap is an aisle, a doorway, a pillar. Writing a seat row into one
    // would put a chair where the teacher carved the room open, and the grid
    // would render it as if they had asked for it.
    const db = freshDb("swap-gap");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 0, 0, "s1");
    await makeGap(db, layout.id, 3, 3);

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 3, col: 3 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBe("s1");
    expect(await db.seats.get(seatKey(layout.id, 3, 3))).toBeUndefined();
    db.close();
  });

  it("does nothing when the source seat is empty", async () => {
    const db = freshDb("swap-empty-source");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 2, 2, "s1");

    await swapSeats(db, layout.id, { row: 0, col: 0 }, { row: 2, col: 2 });

    expect((await db.seats.get(seatKey(layout.id, 0, 0)))?.studentId).toBeNull();
    expect((await db.seats.get(seatKey(layout.id, 2, 2)))?.studentId).toBe("s1");
    db.close();
  });
});

describe("seatStudent displacement", () => {
  it("displaces the pupil already sitting there, leaving them unseated", async () => {
    // This is the rule the rail relies on: dropping a pupil from the rail
    // onto an occupied seat always completes, and the occupant reappears in
    // the rail rather than the gesture being refused. It was already true and
    // asserted nowhere, which is how an invariant leaves.
    const db = freshDb("seat-displace");
    const layout = await getOrCreateLayout(db, "c1");
    await seatStudent(db, layout.id, 1, 1, "sitting");

    await seatStudent(db, layout.id, 1, 1, "incoming");

    expect((await db.seats.get(seatKey(layout.id, 1, 1)))?.studentId).toBe("incoming");
    const stillSeated = await db.seats
      .where("layoutId")
      .equals(layout.id)
      .filter((s) => s.studentId === "sitting")
      .count();
    expect(stillSeated).toBe(0);
    db.close();
  });
});
