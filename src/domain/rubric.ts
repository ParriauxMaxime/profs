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
  1: "var(--level-1)",
  2: "var(--level-2)",
  3: "var(--level-3)",
  4: "var(--level-4)",
};

/** The text colour for each level's fill. See BEHAVIOUR_TEXT_COLORS. */
export const RUBRIC_LEVEL_TEXT_COLORS: Record<RubricLevel, string> = {
  1: "var(--on-level-1)",
  2: "var(--on-level-2)",
  3: "var(--on-level-3)",
  4: "var(--on-level-4)",
};

/** Nearest whole level for colouring a continuous mean. Clamped to 1–4. */
export function meanColor(mean: number): string {
  const rounded = Math.min(4, Math.max(1, Math.round(mean))) as RubricLevel;
  return RUBRIC_LEVEL_COLORS[rounded];
}

/** One thing being assessed. No weight: nothing downstream depends on one. */
export interface RubricCriterion {
  id: string;
  label: string;
}

/** What `rubricCell` and the summaries need from one level row. */
export interface CriterionLevelLike {
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
export function studentMean(scores: CriterionLevelLike[], studentId: string): number | null {
  return mean(scores.filter((s) => s.studentId === studentId).map((s) => s.level));
}

/** One criterion across every pupil — what the class found hard. */
export function criterionMean(scores: CriterionLevelLike[], criterionId: string): number | null {
  return mean(scores.filter((s) => s.criterionId === criterionId).map((s) => s.level));
}

export type LevelDistribution = Record<RubricLevel, number>;

/** How many pupils sit at each level for one criterion. Every level present. */
export function levelDistribution(
  scores: CriterionLevelLike[],
  criterionId: string,
): LevelDistribution {
  const counts = Object.fromEntries(RUBRIC_LEVELS.map((l) => [l, 0])) as LevelDistribution;
  for (const score of scores) {
    if (score.criterionId === criterionId) counts[score.level] += 1;
  }
  return counts;
}

/**
 * What one pupil's rubric cell shows in the carnet.
 *
 * `complete` is the only state carrying a mean, and that is the whole point.
 * A mean over one critère of three sits in the same column as a mean over all
 * three, and the least-assessed pupil reliably posts the best figure — so
 * every mean in a column is over the same denominator, always. While the
 * grille is unfinished the cell shows its coverage instead: `2/3` is progress
 * rather than a result, and a fraction can never be misread as a level.
 *
 * The count is taken against the CURRENT criteria list, never against the
 * levels held: a level for a critère since removed is unreachable in the UI
 * and must not make a cell read 3/2.
 */
export type RubricCell =
  | { state: "empty" }
  | { state: "partial"; scored: number; total: number }
  | { state: "complete"; mean: number };

export function rubricCell(
  levels: CriterionLevelLike[],
  criteria: RubricCriterion[],
  studentId: string,
): RubricCell {
  const total = criteria.length;
  if (total === 0) return { state: "empty" };

  const wanted = new Set(criteria.map((criterion) => criterion.id));
  const mine = levels.filter((row) => row.studentId === studentId && wanted.has(row.criterionId));
  if (mine.length === 0) return { state: "empty" };
  if (mine.length < total) return { state: "partial", scored: mine.length, total };

  return {
    state: "complete",
    mean: round2(mine.reduce((sum, row) => sum + row.level, 0) / total),
  };
}
