import { buildSeats, DEFAULT_COLS, DEFAULT_ROWS, resizeSeats, unseatedStudentIds } from "./seating";

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

  it("keeps seats inside the new bounds and adds the rest", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 2, 2);
    expect(seats).toHaveLength(4);
    expect(seats.find((s) => s.row === 0 && s.col === 0)?.studentId).toBe("a");
    expect(seats.find((s) => s.row === 1 && s.col === 1)?.studentId).toBe("b");
    expect(unseated).toEqual([]);
  });

  it("reports pupils that shrinking would unseat, and does not keep them", () => {
    const { seats, unseated } = resizeSeats(existing, "l1", 1, 1);
    expect(seats).toHaveLength(1);
    expect(unseated).toEqual(["b"]);
  });

  it("preserves gaps — a cell absent from the input stays absent", () => {
    const withGap = [{ layoutId: "l1", row: 0, col: 1, studentId: null }];
    const { seats } = resizeSeats(withGap, "l1", 1, 2);
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
