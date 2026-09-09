import {
  criterionMean,
  isRubricLevel,
  levelDistribution,
  RUBRIC_LEVEL_COLORS,
  RUBRIC_LEVELS,
  type RubricLevel,
  rubricCell,
  studentMean,
} from "./rubric";

describe("levels", () => {
  it("runs 1 to 4", () => {
    expect(RUBRIC_LEVELS).toEqual([1, 2, 3, 4]);
  });

  it("gives every level a colour", () => {
    for (const level of RUBRIC_LEVELS) {
      expect(RUBRIC_LEVEL_COLORS[level]).toMatch(/^var\(--level-[1-4]\)$/);
    }
  });

  it("recognises only the four levels", () => {
    expect(isRubricLevel(1)).toBe(true);
    expect(isRubricLevel(4)).toBe(true);
    expect(isRubricLevel(0)).toBe(false);
    expect(isRubricLevel(5)).toBe(false);
    expect(isRubricLevel(2.5)).toBe(false);
    expect(isRubricLevel("3")).toBe(false);
  });
});

describe("studentMean", () => {
  const scores = [
    { criterionId: "c1", studentId: "p1", level: 4 as const },
    { criterionId: "c2", studentId: "p1", level: 3 as const },
    { criterionId: "c1", studentId: "p2", level: 1 as const },
  ];

  it("averages one pupil's levels", () => {
    expect(studentMean(scores, "p1")).toBe(3.5);
  });

  it("ignores other pupils", () => {
    expect(studentMean(scores, "p2")).toBe(1);
  });

  it("is null when a pupil has no score — never zero", () => {
    expect(studentMean(scores, "p3")).toBeNull();
  });

  it("rounds to two decimals", () => {
    expect(
      studentMean(
        [
          { criterionId: "a", studentId: "p", level: 1 as const },
          { criterionId: "b", studentId: "p", level: 1 as const },
          { criterionId: "c", studentId: "p", level: 2 as const },
        ],
        "p",
      ),
    ).toBe(1.33);
  });
});

describe("criterionMean", () => {
  it("averages one criterion across pupils", () => {
    expect(
      criterionMean(
        [
          { criterionId: "c1", studentId: "p1", level: 4 as const },
          { criterionId: "c1", studentId: "p2", level: 2 as const },
          { criterionId: "c2", studentId: "p1", level: 1 as const },
        ],
        "c1",
      ),
    ).toBe(3);
  });

  it("is null for an unscored criterion", () => {
    expect(criterionMean([], "c1")).toBeNull();
  });
});

describe("levelDistribution", () => {
  it("counts pupils at each level for one criterion", () => {
    expect(
      levelDistribution(
        [
          { criterionId: "c1", studentId: "p1", level: 4 as const },
          { criterionId: "c1", studentId: "p2", level: 4 as const },
          { criterionId: "c1", studentId: "p3", level: 1 as const },
          { criterionId: "c2", studentId: "p1", level: 2 as const },
        ],
        "c1",
      ),
    ).toEqual({ 1: 1, 2: 0, 3: 0, 4: 2 });
  });

  it("returns all zeros for an unscored criterion", () => {
    expect(levelDistribution([], "c1")).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });
});

describe("rubricCell", () => {
  const criteria = [
    { id: "just", label: "Justesse" },
    { id: "ryth", label: "Rythme" },
    { id: "ecou", label: "Écoute" },
  ];
  const level = (criterionId: string, studentId: string, level: RubricLevel) => ({
    criterionId,
    studentId,
    level,
  });

  it("is empty when the pupil has no level at all", () => {
    expect(rubricCell([], criteria, "adam")).toEqual({ state: "empty" });
  });

  it("counts progress while the grille is unfinished, and shows no mean", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({
      state: "partial",
      scored: 2,
      total: 3,
    });
  });

  it("means only once every critère is in", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4), level("ecou", "adam", 3)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "complete", mean: 3 });
  });

  it("falls back to partial when a critère is added under a finished pupil", () => {
    // The mean must not survive the denominator changing: a stale 3,0 over
    // three critères sitting in a column of four is the silently-wrong number
    // the completeness rule exists to refuse.
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4), level("ecou", "adam", 3)];
    const grown = [...criteria, { id: "inte", label: "Intention" }];
    expect(rubricCell(levels, grown, "adam")).toEqual({ state: "partial", scored: 3, total: 4 });
  });

  it("counts against the CURRENT critères, never against the levels it holds", () => {
    // A level for a critère since removed is unreachable data. Counting it
    // would report 3/2 and mean a level nothing displays.
    const levels = [level("just", "adam", 2), level("ryth", "adam", 4), level("gone", "adam", 1)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "partial", scored: 2, total: 3 });
  });

  it("ignores other pupils", () => {
    const levels = [level("just", "adam", 2), level("ryth", "lucas", 4)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "partial", scored: 1, total: 3 });
  });

  it("is empty when the column has no critère yet", () => {
    expect(rubricCell([], [], "adam")).toEqual({ state: "empty" });
  });

  it("rounds the mean to two decimals", () => {
    const levels = [level("just", "adam", 2), level("ryth", "adam", 3), level("ecou", "adam", 3)];
    expect(rubricCell(levels, criteria, "adam")).toEqual({ state: "complete", mean: 2.67 });
  });
});
