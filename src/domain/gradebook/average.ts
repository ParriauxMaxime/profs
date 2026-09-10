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

/**
 * The class's mean on ONE column, in that column's OWN scale.
 *
 * Deliberately NOT normalised to /20, which is the one thing that separates it
 * from `studentAverage`. It is printed directly beneath the pupil's own cell,
 * and that cell shows the mark as stored — `78/100` — so a mean of 12,4 under
 * a 78 would read as a collapse rather than as the same scale.
 *
 * Nothing here feeds a bulletin: a per-column mean is a reading aid for one
 * row of one pupil's page, and every average that counts still comes from
 * `studentAverage`, weights and all. Non-numeric values are skipped rather
 * than coerced — a ticked checkbox is not a 1.
 */
export function columnMean(values: GradeValue[]): number | null {
  let total = 0;
  let count = 0;

  for (const value of values) {
    if (value.type !== "numeric") continue;
    total += value.value;
    count += 1;
  }

  if (count === 0) return null;
  return round2(total / count);
}
