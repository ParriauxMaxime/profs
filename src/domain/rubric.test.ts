import {
  criterionMean,
  isRubricLevel,
  levelDistribution,
  RUBRIC_LEVEL_COLORS,
  RUBRIC_LEVELS,
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
