import type { AverageGrade } from "./average";
import type { CalculationSource } from "./calculation";
import { evaluateCalculation } from "./calculation";

function source(id: string, max: number, weight = 1): CalculationSource {
  return { id, max, weight };
}

function numericGrade(columnId: string, value: number): AverageGrade {
  return { columnId, value: { type: "numeric", value } };
}

describe("evaluateCalculation", () => {
  describe("mean", () => {
    it("normalises a /100 source against a /20 source", () => {
      const sources = [source("a", 100), source("b", 20)];
      const grades = [numericGrade("a", 50), numericGrade("b", 10)];
      // a: 50/100*20 = 10, b: 10/20*20 = 10 -> mean 10
      expect(
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "b"] }, sources, grades),
      ).toBe(10);
    });

    it("respects weight", () => {
      const sources = [source("a", 20, 1), source("b", 20, 3)];
      const grades = [numericGrade("a", 10), numericGrade("b", 20)];
      // weighted: (10*1 + 20*3) / (1+3) = 70/4 = 17.5
      expect(
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "b"] }, sources, grades),
      ).toBe(17.5);
    });

    it("returns null on an empty source list", () => {
      expect(evaluateCalculation({ kind: "mean", sourceColumnIds: [] }, [], [])).toBeNull();
    });

    it("returns null when the pupil has no marks in any source", () => {
      const sources = [source("a", 20), source("b", 20)];
      expect(
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "b"] }, sources, []),
      ).toBeNull();
    });

    it("ignores an unknown source id rather than throwing", () => {
      const sources = [source("a", 20)];
      const grades = [numericGrade("a", 10)];
      expect(() =>
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "ghost"] }, sources, grades),
      ).not.toThrow();
      expect(
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "ghost"] }, sources, grades),
      ).toBe(10);
    });

    it("skips a source whose grade value is not numeric", () => {
      const sources = [source("a", 20), source("b", 20)];
      const grades: AverageGrade[] = [
        numericGrade("a", 10),
        { columnId: "b", value: { type: "text", value: "abs" } },
      ];
      expect(
        evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "b"] }, sources, grades),
      ).toBe(10);
    });
  });

  describe("bestOf", () => {
    it("means the marks that exist when the pupil has fewer than bestCount", () => {
      const sources = [source("a", 20), source("b", 20), source("c", 20)];
      const grades = [numericGrade("a", 8), numericGrade("b", 12)];
      expect(
        evaluateCalculation(
          { kind: "bestOf", sourceColumnIds: ["a", "b", "c"], bestCount: 3 },
          sources,
          grades,
        ),
      ).toBe(10);
    });

    it("picks the best marks rather than the first ones", () => {
      const sources = [source("a", 20), source("b", 20), source("c", 20)];
      const grades = [numericGrade("a", 5), numericGrade("b", 20), numericGrade("c", 15)];
      // best 2 of [5, 20, 15] normalised to /20 -> [20, 15] -> mean 17.5
      expect(
        evaluateCalculation(
          { kind: "bestOf", sourceColumnIds: ["a", "b", "c"], bestCount: 2 },
          sources,
          grades,
        ),
      ).toBe(17.5);
    });

    it("returns null on an empty source list", () => {
      expect(
        evaluateCalculation({ kind: "bestOf", sourceColumnIds: [], bestCount: 2 }, [], []),
      ).toBeNull();
    });

    it("returns null when the pupil has no marks", () => {
      const sources = [source("a", 20), source("b", 20)];
      expect(
        evaluateCalculation(
          { kind: "bestOf", sourceColumnIds: ["a", "b"], bestCount: 2 },
          sources,
          [],
        ),
      ).toBeNull();
    });
  });

  describe("sum", () => {
    it("adds raw values without normalising", () => {
      const sources = [source("a", 100), source("b", 20)];
      const grades = [numericGrade("a", 50), numericGrade("b", 10)];
      expect(
        evaluateCalculation({ kind: "sum", sourceColumnIds: ["a", "b"] }, sources, grades),
      ).toBe(60);
    });

    it("returns null on an empty source list", () => {
      expect(evaluateCalculation({ kind: "sum", sourceColumnIds: [] }, [], [])).toBeNull();
    });

    it("returns null when the pupil has no marks", () => {
      const sources = [source("a", 20)];
      expect(evaluateCalculation({ kind: "sum", sourceColumnIds: ["a"] }, sources, [])).toBeNull();
    });
  });

  describe("count", () => {
    it("returns 0 rather than null for a pupil with nothing", () => {
      const sources = [source("a", 20), source("b", 20)];
      expect(evaluateCalculation({ kind: "count", sourceColumnIds: ["a", "b"] }, sources, [])).toBe(
        0,
      );
    });

    it("returns 0 on an empty source list", () => {
      expect(evaluateCalculation({ kind: "count", sourceColumnIds: [] }, [], [])).toBe(0);
    });

    it("counts sources that have a numeric value", () => {
      const sources = [source("a", 20), source("b", 20), source("c", 20)];
      const grades = [numericGrade("a", 10), numericGrade("c", 5)];
      expect(
        evaluateCalculation({ kind: "count", sourceColumnIds: ["a", "b", "c"] }, sources, grades),
      ).toBe(2);
    });
  });

  it("ignores sources with max <= 0 or weight <= 0", () => {
    const sources = [source("a", 20, 1), source("b", 0, 1), source("c", 20, 0)];
    const grades = [numericGrade("a", 10), numericGrade("b", 15), numericGrade("c", 5)];
    expect(
      evaluateCalculation({ kind: "mean", sourceColumnIds: ["a", "b", "c"] }, sources, grades),
    ).toBe(10);
  });
});
