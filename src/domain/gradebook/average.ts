import { type ColumnType, isNumericColumn } from "./column";
import type { GradeValue } from "./grade";

/** The slice of a Column this module needs — keeps the maths free of DB types. */
export interface AverageColumn {
  id: string;
  type: ColumnType;
  weight: number;
  max: number;
  periodId: string;
}

export interface AverageGrade {
  columnId: string;
  value: GradeValue;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Weighted average of a student's numeric grades, expressed out of 20.
 *
 * Every numeric column is normalised by its own `max` first, so a /100 test and
 * a /20 test can sit in the same gradebook. Empty cells are skipped, never
 * counted as zero. Returns null when nothing countable exists.
 */
export function studentAverage(
  grades: AverageGrade[],
  columns: AverageColumn[],
  periodId?: string,
): number | null {
  const byId = new Map(columns.map((c) => [c.id, c]));

  let weighted = 0;
  let totalWeight = 0;

  for (const grade of grades) {
    const column = byId.get(grade.columnId);
    if (!column) continue;
    if (periodId !== undefined && column.periodId !== periodId) continue;
    if (!isNumericColumn(column.type)) continue;
    if (column.weight <= 0) continue;
    if (grade.value === undefined) continue;
    if (grade.value.type !== "numeric") continue;
    if (column.max <= 0) continue;

    const outOf20 = (grade.value.value / column.max) * 20;
    weighted += outOf20 * column.weight;
    totalWeight += column.weight;
  }

  if (totalWeight === 0) return null;
  return round2(weighted / totalWeight);
}

export interface ClassStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

/** Descriptive statistics over a set of averages. Null for an empty set. */
export function classStats(values: number[]): ClassStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round2(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
    median: round2(median),
  };
}
