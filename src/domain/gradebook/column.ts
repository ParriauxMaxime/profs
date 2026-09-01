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
  "attendance",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export const ATTENDANCE_VALUES = ["present", "absent", "late", "excused"] as const;

export type AttendanceValue = (typeof ATTENDANCE_VALUES)[number];

/** Only numeric columns contribute to averages. */
export function isNumericColumn(type: ColumnType): boolean {
  return type === "numeric";
}
