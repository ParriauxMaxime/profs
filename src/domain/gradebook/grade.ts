import { z } from "zod";
import { ATTENDANCE_VALUES, type ColumnType } from "./column";
import { formatDecimal, parseDecimal } from "./decimal";

export type GradeValue =
  | { type: "numeric"; value: number }
  | { type: "letter"; value: string }
  | { type: "icon"; value: string }
  | { type: "checkbox"; value: boolean }
  | { type: "text"; value: string }
  | { type: "attendance"; value: (typeof ATTENDANCE_VALUES)[number] };

export const gradeValueSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("numeric"), value: z.number().min(0) }),
  z.object({ type: z.literal("letter"), value: z.string().min(1) }),
  z.object({ type: z.literal("icon"), value: z.string().min(1) }),
  z.object({ type: z.literal("checkbox"), value: z.boolean() }),
  z.object({ type: z.literal("text"), value: z.string().min(1) }),
  z.object({ type: z.literal("attendance"), value: z.enum(ATTENDANCE_VALUES) }),
]) satisfies z.ZodType<GradeValue>;

/**
 * True when raw editor input trims to nothing — the signal to clear a cell.
 * Callers must check this BEFORE calling `parseGradeValue`: that function
 * returns null both for blank input (clear) and for invalid input (refuse),
 * and those two cases must not be treated the same way by a caller — a
 * refused edit must never delete an existing mark. "0" is not blank; it is a
 * legitimate grade.
 */
export function isBlankInput(raw: unknown): boolean {
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  return text === "";
}

/**
 * Turn raw editor input into a validated GradeValue.
 * Returns null when the input is empty or invalid — use `isBlankInput` first
 * to tell those two cases apart: blank means "clear the cell", non-blank-but-
 * null means "refused, leave the stored value alone".
 * `max` only matters for numeric columns: a value above it is rejected (not
 * clamped) — silently rewriting a teacher's mistyped mark would be worse than
 * refusing it.
 */
export function parseGradeValue(type: ColumnType, raw: unknown, max?: number): GradeValue | null {
  if (type === "checkbox") {
    return typeof raw === "boolean" ? { type, value: raw } : null;
  }

  if (isBlankInput(raw)) return null;
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();

  switch (type) {
    case "numeric": {
      // French keyboards and Excel exports both produce "11,5".
      const parsed = parseDecimal(text);
      if (parsed === null || parsed < 0) return null;
      if (max !== undefined && parsed > max) return null;
      return { type, value: parsed };
    }
    case "letter":
      return { type, value: text.toUpperCase() };
    case "icon":
    case "text":
      return { type, value: text };
    case "attendance": {
      const candidate = ATTENDANCE_VALUES.find((v) => v === text);
      return candidate ? { type, value: candidate } : null;
    }
  }
}

/**
 * Display form for a cell. `max` only matters for numeric columns; `locale`
 * is the app's active language, which decides the decimal separator.
 */
export function formatGradeValue(value: GradeValue, max?: number, locale = "fr"): string {
  switch (value.type) {
    case "numeric": {
      const shown = formatDecimal(value.value, locale);
      return max === undefined ? shown : `${shown}/${max}`;
    }
    case "checkbox":
      return value.value ? "✓" : "✗";
    case "attendance":
    case "letter":
    case "icon":
    case "text":
      return value.value;
  }
}
