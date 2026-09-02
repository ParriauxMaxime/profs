import {
  buildSeats,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  resizeSeats,
  resolveDrop,
  unseatedStudentIds,
} from "./seating";

describe("buildSeats", () => {
  it("fills the whole grid with empty seats", () => {
    const seats = buildSeats("l1", 2, 3);
    expect(seats).toHaveLength(6);
    expect(seats.every((s) => s.studentId === null)).toBe(true);
    expect(seats[0]).toEqual({ layoutId: "l1", row: 0, col: 0, studentId: null });
    expect(seats[5]).toEqual({ layoutId: "l1", row: 1, col: 2, studentId: null });
  });

  it("defaults to a plausible classroom", () => {
    expect(buildSeats("l1", DEFAULT_ROWS, DEFAULT_COLS)).toHaveLength(30);
  });
});

describe("resizeSeats", () => {
  const existing = [
    { layoutId: "l1", row: 0, col: 0, studentId: "a" },
    { layoutId: "l1", row: 1, col: 1, studentId: "b" },
  ];

  it("keeps every seat when the size does not change", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 2, 2, 2, 2);
    // Two seats in, two seats out: the cells absent from the input are gaps,
    // and a resize that changes nothing must invent nothing.
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.row === 0 && s.col === 0)?.studentId).toBe("a");
    expect(seats.find((s) => s.row === 1 && s.col === 1)?.studentId).toBe("b");
    expect(unseated).toEqual([]);
  });

  it("adds seats only where the grid actually grew", () => {
    const { seats } = resizeSeats(existing, "l1", 3, 3, 2, 2);
    // Row 2 and column 2 are new, so their five cells become empty seats,
    // joining the two occupied ones. The two gaps inside the old 2x2 extent
    // stay gaps.
    expect(seats).toHaveLength(7);
    expect(seats.some((s) => s.row === 0 && s.col === 1)).toBe(false);
    expect(seats.some((s) => s.row === 1 && s.col === 0)).toBe(false);
    expect(seats.filter((s) => s.row === 2)).toHaveLength(3);
  });

  it("never restores a whole edge row that was carved away", () => {
    // The regression the first fix missed: remove ALL of row 1 from a 2x3
    // room, then re-save the size form unchanged. Inferring the old extent
    // from the surviving seats put oldMaxRow at 0, so row 1 looked like
    // growth and came back. The stored layout still says 2 rows, so it must
    // not.
    const withoutLastRow = buildSeats("l1", 2, 3).filter((s) => s.row !== 1);
    const { seats } = resizeSeats(withoutLastRow, "l1", 2, 3, 2, 3);
    expect(seats).toHaveLength(3);
    expect(seats.some((s) => s.row === 1)).toBe(false);
  });

  it("still adds the row when the room genuinely grows", () => {
    const twoRows = buildSeats("l1", 2, 3);
    const { seats } = resizeSeats(twoRows, "l1", 3, 3, 2, 3);
    expect(seats).toHaveLength(9);
    expect(seats.filter((s) => s.row === 2)).toHaveLength(3);
  });

  it("never refills an aisle the teacher carved when the room widens", () => {
    // The regression that matters: a full 2x3 room with (0,1) removed as an
    // aisle. Widening must leave that hole alone.
    const withAisle = buildSeats("l1", 2, 3).filter((s) => !(s.row === 0 && s.col === 1));
    const { seats } = resizeSeats(withAisle, "l1", 2, 4, 2, 3);
    expect(seats.some((s) => s.row === 0 && s.col === 1)).toBe(false);
    expect(seats).toHaveLength(7);
  });

  it("reports pupils that shrinking would unseat, and does not keep them", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 1, 1, 2, 2);
    expect(seats).toHaveLength(1);
    expect(unseated).toEqual(["b"]);
  });

  it("preserves gaps — a cell absent from the input stays absent", () => {
    const withGap = [{ layoutId: "l1", row: 0, col: 1, studentId: null }];
    const { seats } = resizeSeats(withGap, "l1", 1, 2, 1, 2);
    expect(seats).toHaveLength(1);
    expect(seats[0].col).toBe(1);
  });
});

describe("unseatedStudentIds", () => {
  it("returns pupils holding no seat, in the given order", () => {
    const students = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const seats = [
      { layoutId: "l1", row: 0, col: 0, studentId: "b" },
      { layoutId: "l1", row: 0, col: 1, studentId: null },
    ];
    expect(unseatedStudentIds(students, seats)).toEqual(["a", "c"]);
  });
});

describe("resolveDrop", () => {
  const seat = (studentId: string | null) => ({ layoutId: "l1", row: 9, col: 9, studentId });

  it("seats a pupil held from the rail on an empty seat", () => {
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, seat(null), { row: 1, col: 2 })).toEqual({
      kind: "seat",
      studentId: "s1",
      row: 1,
      col: 2,
    });
  });

  it("seats a pupil held from the rail on an occupied seat, displacing its occupant", () => {
    // seatStudent overwrites the occupant, who returns to the rail. The
    // gesture always completes; a refusal would put back the round trip this
    // whole change removes.
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, seat("s2"), { row: 1, col: 2 })).toEqual({
      kind: "seat",
      studentId: "s1",
      row: 1,
      col: 2,
    });
  });

  it("swaps two seated pupils", () => {
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, seat("s2"), { row: 3, col: 4 })).toEqual({
      kind: "swap",
      from: { row: 0, col: 0 },
      to: { row: 3, col: 4 },
    });
  });

  it("moves a seated pupil onto an empty seat, as a swap with nobody", () => {
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, seat(null), { row: 3, col: 4 })).toEqual({
      kind: "swap",
      from: { row: 0, col: 0 },
      to: { row: 3, col: 4 },
    });
  });

  it("does nothing when a seated pupil is dropped back on their own chair", () => {
    expect(resolveDrop({ kind: "seat", row: 2, col: 2 }, seat("s1"), { row: 2, col: 2 })).toEqual({
      kind: "none",
    });
  });

  it("does nothing over a gap, whoever is held", () => {
    // No seat row means no chair. Neither branch may invent one.
    expect(resolveDrop({ kind: "pool", studentId: "s1" }, undefined, { row: 1, col: 1 })).toEqual({
      kind: "none",
    });
    expect(resolveDrop({ kind: "seat", row: 0, col: 0 }, undefined, { row: 1, col: 1 })).toEqual({
      kind: "none",
    });
  });
});
