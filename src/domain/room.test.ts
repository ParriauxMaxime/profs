import {
  ARC_SPACING,
  canPlace,
  compareReadingOrder,
  fitsRoom,
  frame,
  type Held,
  MAX_POSITIONS,
  occupantsInReadingOrder,
  overlaps,
  PITCH,
  type Position,
  ROOM_MAX,
  reseat,
  resolveDrop,
  resolveFloorDrop,
  type Seated,
  TABLE,
} from "./room";

describe("constants", () => {
  it("gives a table one unit of air at pitch", () => {
    expect(TABLE).toBe(2);
    expect(PITCH).toBe(TABLE + 1);
  });

  it("spaces a curved row wide enough to survive the diagonal and rounding", () => {
    // max(|dx|,|dy|) must be >= 2 AFTER rounding, so >= 3 before it, so the
    // centre distance must be >= 3 * sqrt(2), and a chord is ~0.93 of its arc.
    expect(ARC_SPACING).toBeGreaterThanOrEqual((3 * Math.SQRT2) / 0.93);
  });

  it("bounds a room and a roster", () => {
    expect(ROOM_MAX).toBe(120);
    expect(MAX_POSITIONS).toBe(100);
  });
});

describe("overlaps", () => {
  it("is per-axis, because a table is an axis-aligned square", () => {
    expect(overlaps({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(overlaps({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(overlaps({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });

  it("clears a pair that is far on one axis and touching on the other", () => {
    expect(overlaps({ x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
  });

  it("is symmetric", () => {
    expect(overlaps({ x: 3, y: 1 }, { x: 2, y: 2 })).toBe(overlaps({ x: 2, y: 2 }, { x: 3, y: 1 }));
  });
});

describe("fitsRoom", () => {
  const room = { width: 10, height: 10 };

  it("accepts a table whose whole footprint is inside", () => {
    expect(fitsRoom({ x: 8, y: 8 }, room)).toBe(true);
  });

  it("refuses a table hanging off an edge", () => {
    expect(fitsRoom({ x: 9, y: 0 }, room)).toBe(false);
    expect(fitsRoom({ x: 0, y: 9 }, room)).toBe(false);
  });

  it("refuses a negative coordinate", () => {
    expect(fitsRoom({ x: -1, y: 0 }, room)).toBe(false);
  });
});

describe("canPlace", () => {
  const room = { width: 20, height: 20 };

  it("accepts an empty room", () => {
    expect(canPlace([], { x: 4, y: 4 }, room)).toBe(true);
  });

  it("refuses a spot that overlaps an existing table", () => {
    expect(canPlace([{ x: 4, y: 4 }], { x: 5, y: 4 }, room)).toBe(false);
  });

  it("accepts the very next unit once it clears", () => {
    expect(canPlace([{ x: 4, y: 4 }], { x: 6, y: 4 }, room)).toBe(true);
  });

  it("refuses a spot outside the room even when nothing is there", () => {
    expect(canPlace([], { x: 19, y: 0 }, room)).toBe(false);
  });
});

describe("compareReadingOrder", () => {
  it("sorts front to back, then left to right", () => {
    const sorted = [
      { x: 5, y: 3 },
      { x: 0, y: 3 },
      { x: 9, y: 0 },
    ].sort(compareReadingOrder);
    expect(sorted).toEqual([
      { x: 9, y: 0 },
      { x: 0, y: 3 },
      { x: 5, y: 3 },
    ]);
  });
});

describe("frame", () => {
  it("shifts positions to a one-unit margin and sizes the room around them", () => {
    const shape = frame([
      { x: -4, y: 2 },
      { x: 2, y: 8 },
    ]);
    expect(shape.positions).toEqual([
      { x: 1, y: 1 },
      { x: 7, y: 7 },
    ]);
    expect(shape.width).toBe(7 + TABLE + 1);
    expect(shape.height).toBe(7 + TABLE + 1);
  });

  it("gives an empty room a minimum size rather than a zero one", () => {
    const shape = frame([]);
    expect(shape.positions).toEqual([]);
    expect(shape.width).toBeGreaterThanOrEqual(TABLE + 2);
    expect(shape.height).toBeGreaterThanOrEqual(TABLE + 2);
  });

  it("every position it returns fits inside the room it returns, even far outside ROOM_MAX", () => {
    const inputs: Position[][] = [
      [{ x: 0, y: 0 }],
      [
        { x: -4, y: 2 },
        { x: 2, y: 8 },
      ],
      [
        { x: 0, y: 0 },
        { x: 500, y: 500 },
      ],
      [
        { x: -1000, y: 3 },
        { x: 250, y: -750 },
        { x: 0, y: 0 },
      ],
    ];
    for (const input of inputs) {
      const shape = frame(input);
      for (const position of shape.positions) {
        expect(fitsRoom(position, shape)).toBe(true);
      }
    }
  });
});

const seat = (id: string, x: number, y: number, studentId: string | null = null): Seated => ({
  id,
  x,
  y,
  studentId,
});

describe("occupantsInReadingOrder", () => {
  it("reads the room front to back, then left to right, skipping empty tables", () => {
    expect(
      occupantsInReadingOrder([
        seat("c", 6, 3, "p3"),
        seat("a", 0, 0, "p1"),
        seat("b", 3, 0, "p2"),
        seat("d", 0, 3, null),
      ]),
    ).toEqual(["p1", "p2", "p3"]);
  });
});

describe("reseat", () => {
  it("pours pupils into the new positions in order, so the front row stays in front", () => {
    const { seats, overflow } = reseat(
      ["p1", "p2"],
      [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 7, y: 1 },
      ],
    );
    expect(seats).toEqual([
      { x: 1, y: 1, studentId: "p1" },
      { x: 4, y: 1, studentId: "p2" },
      { x: 7, y: 1, studentId: null },
    ]);
    expect(overflow).toEqual([]);
  });

  it("returns the pupils who no longer fit rather than dropping them", () => {
    const { seats, overflow } = reseat(["p1", "p2", "p3"], [{ x: 1, y: 1 }]);
    expect(seats).toEqual([{ x: 1, y: 1, studentId: "p1" }]);
    expect(overflow).toEqual(["p2", "p3"]);
  });

  it("leaves an empty room empty", () => {
    expect(reseat([], [])).toEqual({ seats: [], overflow: [] });
  });
});

describe("resolveDrop", () => {
  const held: Record<string, Held> = {
    pool: { kind: "pool", studentId: "p1" },
    seat: { kind: "seat", seatId: "s1" },
    table: { kind: "table", seatId: "s1" },
  };

  it("does nothing when the target table is gone", () => {
    expect(resolveDrop(held.pool, undefined)).toEqual({ kind: "none" });
    expect(resolveDrop(held.seat, undefined)).toEqual({ kind: "none" });
  });

  it("seats a pupil held from the rail, displacing whoever is there", () => {
    expect(resolveDrop(held.pool, seat("s2", 4, 1, "p9"))).toEqual({
      kind: "seat",
      studentId: "p1",
      seatId: "s2",
    });
  });

  it("swaps a pupil held from a table", () => {
    expect(resolveDrop(held.seat, seat("s2", 4, 1, "p9"))).toEqual({
      kind: "swap",
      fromSeatId: "s1",
      toSeatId: "s2",
    });
  });

  it("degrades a swap onto an empty table to a move", () => {
    expect(resolveDrop(held.seat, seat("s2", 4, 1, null))).toEqual({
      kind: "swap",
      fromSeatId: "s1",
      toSeatId: "s2",
    });
  });

  it("does nothing when a held pupil is dropped back on their own table", () => {
    expect(resolveDrop(held.seat, seat("s1", 0, 0, "p1"))).toEqual({ kind: "none" });
  });

  it("does nothing when a held TABLE is dropped on another table", () => {
    // Furniture is moved onto floor, never onto furniture.
    expect(resolveDrop(held.table, seat("s2", 4, 1, null))).toEqual({ kind: "none" });
  });
});

describe("resolveFloorDrop", () => {
  it("moves a held table to the floor tapped", () => {
    expect(resolveFloorDrop({ kind: "table", seatId: "s1" }, { x: 6, y: 6 })).toEqual({
      kind: "moveTable",
      seatId: "s1",
      to: { x: 6, y: 6 },
    });
  });

  it("does nothing when a pupil is dropped on bare floor", () => {
    expect(resolveFloorDrop({ kind: "pool", studentId: "p1" }, { x: 6, y: 6 })).toEqual({
      kind: "none",
    });
    expect(resolveFloorDrop({ kind: "seat", seatId: "s1" }, { x: 6, y: 6 })).toEqual({
      kind: "none",
    });
  });
});
