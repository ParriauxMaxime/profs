/**
 * Column types for a gradebook.
 *
 * A column is one assessment or one tracked attribute. Its type decides what a
 * cell may hold, how the cell is edited, and whether the column takes part in
 * average computation (only `numeric` does).
 */

export const COLUMN_TYPES = [
  "numeric",
  "letter",
  "icon",
  "checkbox",
  "text",
  "calculation",
  "rubric",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Defaults offered by the column creation form. */
export const DEFAULT_COLUMN_WEIGHT = 1;
export const DEFAULT_COLUMN_MAX = 20;

/**
 * Only numeric columns contribute to averages. A `calculation` column is
 * derived and a `rubric` column holds levels rather than marks; both are
 * deliberately excluded. A level is not a mark out of 20 and no conversion
 * exists — see `src/domain/rubric.ts`.
 */
export function isNumericColumn(type: ColumnType): boolean {
  return type === "numeric";
}
