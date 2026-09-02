import type { AverageGrade } from "./average";

/**
 * Columns whose value is derived from other columns.
 *
 * Display only: a calculation NEVER enters `studentAverage`. French marking
 * already expresses weighting through the coefficient — `column.weight`, since
 * v1 — so a calculation feeding the average would duplicate that mechanism
 * while risking the one failure this app cannot afford, a silently wrong
 * bulletin. See `docs/superpowers/specs/2026-09-02-profs-phase3-annotations-groups-calculations.md`
 * for the full argument.
 *
 * Sources are plain numeric columns only. No calculation may read another, so
 * no cycle can exist and there is no evaluation order to define.
 */
export const CALCULATION_KINDS = ["mean", "sum", "bestOf", "count"] as const;

export type CalculationKind = (typeof CALCULATION_KINDS)[number];

export interface CalculationSpec {
  kind: CalculationKind;
  sourceColumnIds: string[];
  /** Only meaningful for `bestOf`. */
  bestCount?: number;
}

/** The slice of a source column this module needs, mirroring `AverageColumn`. */
export interface CalculationSource {
  id: string;
  max: number;
  weight: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A source's numeric value normalised to /20 by its own `max`, or null when
 * the source has no usable mark. Mirrors `studentAverage`'s normalisation so
 * a /100 test and a /20 test stay comparable across the two modules.
 */
function normalisedValue(source: CalculationSource, grades: AverageGrade[]): number | null {
  if (source.max <= 0 || source.weight <= 0) return null;
  const grade = grades.find((g) => g.columnId === source.id);
  if (grade?.value.type !== "numeric") return null;
  return (grade.value.value / source.max) * 20;
}

/**
 * Raw (non-normalised) value for a source, or null when unusable. Used by
 * `sum` and `count`, which deliberately do not compare across differing
 * `max` scales the way `mean` and `bestOf` do.
 */
function rawValue(source: CalculationSource, grades: AverageGrade[]): number | null {
  if (source.max <= 0 || source.weight <= 0) return null;
  const grade = grades.find((g) => g.columnId === source.id);
  if (grade?.value.type !== "numeric") return null;
  return grade.value.value;
}

/**
 * Derive one figure from a set of source columns, for a single pupil.
 *
 * Returns null — never 0 — whenever a pupil has no numeric value in any
 * source, for every kind except `count`: null renders as an empty cell, and
 * 0/20 would misrepresent a pupil who sat nothing. `count` is the one
 * exception, since "zero marks so far" is the honest answer to a count.
 *
 * A `sourceColumnIds` entry that matches no column (or no longer exists) is
 * ignored rather than treated as an error — a column can be deleted after a
 * calculation references it, and the calculation must degrade gracefully.
 */
export function evaluateCalculation(
  spec: CalculationSpec,
  sources: CalculationSource[],
  grades: AverageGrade[],
): number | null {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const resolved = spec.sourceColumnIds
    .map((id) => byId.get(id))
    .filter((s): s is CalculationSource => !!s);

  switch (spec.kind) {
    case "mean": {
      let weighted = 0;
      let totalWeight = 0;
      for (const source of resolved) {
        const value = normalisedValue(source, grades);
        if (value === null) continue;
        weighted += value * source.weight;
        totalWeight += source.weight;
      }
      return totalWeight === 0 ? null : round2(weighted / totalWeight);
    }

    case "bestOf": {
      const values = resolved
        .map((source) => normalisedValue(source, grades))
        .filter((v): v is number => v !== null)
        .sort((a, b) => b - a);
      if (values.length === 0) return null;
      const bestCount = spec.bestCount ?? values.length;
      const best = values.slice(0, Math.max(0, bestCount));
      if (best.length === 0) return null;
      return round2(best.reduce((sum, v) => sum + v, 0) / best.length);
    }

    case "sum": {
      const values = resolved
        .map((source) => rawValue(source, grades))
        .filter((v): v is number => v !== null);
      if (values.length === 0) return null;
      return round2(values.reduce((sum, v) => sum + v, 0));
    }

    case "count": {
      return resolved.filter((source) => rawValue(source, grades) !== null).length;
    }
  }
}
