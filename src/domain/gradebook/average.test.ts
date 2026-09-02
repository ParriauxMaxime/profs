import { type AverageColumn, type AverageGrade, classStats, studentAverage } from "./average";

function col(over: Partial<AverageColumn> & { id: string }): AverageColumn {
  return { type: "numeric", weight: 1, max: 20, periodId: "p1", ...over };
}

describe("studentAverage", () => {
  it("returns null when the student has no grades", () => {
    expect(studentAverage([], [col({ id: "c1" })])).toBeNull();
  });

  it("averages two equally weighted marks", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 16 } },
    ];
    expect(studentAverage(grades, columns)).toBe(13);
  });

  it("applies column weights", () => {
    const columns = [col({ id: "c1", weight: 1 }), col({ id: "c2", weight: 3 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 8 } },
      { columnId: "c2", value: { type: "numeric", value: 16 } },
    ];
    // (8*1 + 16*3) / 4 = 14
    expect(studentAverage(grades, columns)).toBe(14);
  });

  it("normalises a /100 column to /20 before averaging", () => {
    const columns = [col({ id: "c1", max: 100 }), col({ id: "c2", max: 20 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 80 } }, // = 16/20
      { columnId: "c2", value: { type: "numeric", value: 10 } },
    ];
    expect(studentAverage(grades, columns)).toBe(13);
  });

  it("ignores non-numeric columns", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2", type: "text" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 12 } },
      { columnId: "c2", value: { type: "text", value: "bon travail" } },
    ];
    expect(studentAverage(grades, columns)).toBe(12);
  });

  it("ignores missing cells rather than counting them as zero", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" })];
    const grades: AverageGrade[] = [{ columnId: "c1", value: { type: "numeric", value: 12 } }];
    expect(studentAverage(grades, columns)).toBe(12);
  });

  it("restricts to one period when a periodId is given", () => {
    const columns = [col({ id: "c1", periodId: "p1" }), col({ id: "c2", periodId: "p2" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 20 } },
    ];
    expect(studentAverage(grades, columns, "p1")).toBe(10);
  });

  it("ignores a grade referencing an unknown column", () => {
    const grades: AverageGrade[] = [{ columnId: "ghost", value: { type: "numeric", value: 20 } }];
    expect(studentAverage(grades, [col({ id: "c1" })])).toBeNull();
  });

  it("ignores columns with a zero or negative weight", () => {
    const columns = [col({ id: "c1", weight: 0 }), col({ id: "c2", weight: 2 })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 0 } },
      { columnId: "c2", value: { type: "numeric", value: 15 } },
    ];
    expect(studentAverage(grades, columns)).toBe(15);
  });

  it("rounds to two decimals", () => {
    const columns = [col({ id: "c1" }), col({ id: "c2" }), col({ id: "c3" })];
    const grades: AverageGrade[] = [
      { columnId: "c1", value: { type: "numeric", value: 10 } },
      { columnId: "c2", value: { type: "numeric", value: 11 } },
      { columnId: "c3", value: { type: "numeric", value: 13 } },
    ];
    expect(studentAverage(grades, columns)).toBe(11.33);
  });

  it("ignores a row that carries a note but no mark", () => {
    const columns = [{ id: "c1", type: "numeric" as const, weight: 1, max: 20, periodId: "p1" }];
    const withMark = studentAverage(
      [{ columnId: "c1", value: { type: "numeric", value: 10 } }],
      columns,
    );
    // A note-only row reaches this function with no value at all.
    const withNoteOnly = studentAverage(
      [
        { columnId: "c1", value: { type: "numeric", value: 10 } },
        { columnId: "c2", value: undefined as never },
      ],
      columns,
    );
    expect(withNoteOnly).toBe(withMark);
  });
});

describe("classStats", () => {
  it("returns null for an empty class", () => {
    expect(classStats([])).toBeNull();
  });

  it("computes min, max, mean and median for an odd count", () => {
    expect(classStats([10, 14, 6])).toEqual({
      count: 3,
      min: 6,
      max: 14,
      mean: 10,
      median: 10,
    });
  });

  it("takes the midpoint of the two middle values for an even count", () => {
    expect(classStats([10, 14, 6, 12])).toEqual({
      count: 4,
      min: 6,
      max: 14,
      mean: 10.5,
      median: 11,
    });
  });
});
