/**
 * Competency grids: criteria scored 1 to 4.
 *
 * A level is deliberately not a mark. It never enters a gradebook average —
 * normalising "en cours d'acquisition" onto a /20 scale would invent a
 * precision the assessment does not have. The means computed here are for
 * reading a grid, not for a bulletin.
 */

export const RUBRIC_LEVELS = [1, 2, 3, 4] as const;

export type RubricLevel = (typeof RUBRIC_LEVELS)[number];

/**
 * Colour and label both carry the meaning: colour alone fails a colour-blind
 * reader, and the number alone is slow to scan across a filled grid.
 */
export const RUBRIC_LEVEL_COLORS: Record<RubricLevel, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#16a34a",
  4: "#2563eb",
};

/** One thing being assessed. No weight: nothing downstream depends on one. */
export interface RubricCriterion {
  id: string;
  label: string;
}

export interface RubricScoreLike {
  criterionId: string;
  studentId: string;
  level: RubricLevel;
}

/** Narrows unknown input to a level, rejecting anything not exactly 1–4. */
export function isRubricLevel(value: unknown): value is RubricLevel {
  return RUBRIC_LEVELS.some((level) => level === value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(levels: number[]): number | null {
  if (levels.length === 0) return null;
  return round2(levels.reduce((sum, l) => sum + l, 0) / levels.length);
}

/** One pupil across every criterion. Null when they have no score at all. */
export function studentMean(scores: RubricScoreLike[], studentId: string): number | null {
  return mean(scores.filter((s) => s.studentId === studentId).map((s) => s.level));
}

/** One criterion across every pupil — what the class found hard. */
export function criterionMean(scores: RubricScoreLike[], criterionId: string): number | null {
  return mean(scores.filter((s) => s.criterionId === criterionId).map((s) => s.level));
}

export type LevelDistribution = Record<RubricLevel, number>;

/** How many pupils sit at each level for one criterion. Every level present. */
export function levelDistribution(
  scores: RubricScoreLike[],
  criterionId: string,
): LevelDistribution {
  const counts = Object.fromEntries(RUBRIC_LEVELS.map((l) => [l, 0])) as LevelDistribution;
  for (const score of scores) {
    if (score.criterionId === criterionId) counts[score.level] += 1;
  }
  return counts;
}
