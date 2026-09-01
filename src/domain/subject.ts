/**
 * The colours a subject may be given.
 *
 * A subject's colour is its only visual identity in the app, so it is picked
 * from a fixed palette rather than typed in: a free hex field lets a teacher
 * choose white on white, and it would scatter literal colours through the
 * components. The two colours the demo school is seeded with are part of the
 * palette on purpose, so an edited seed subject still matches a swatch.
 */

export const SUBJECT_COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // gold
  "#0d9488", // teal
  "#7c3aed", // violet
  "#db2777", // pink
  "#475569", // slate
] as const;

export type SubjectColor = (typeof SUBJECT_COLORS)[number];

export const DEFAULT_SUBJECT_COLOR: SubjectColor = SUBJECT_COLORS[0];

/**
 * A stored colour is a plain string — a backup or an older version may hold
 * something outside the palette, and the swatch picker must not pretend such a
 * value is selected.
 */
export function isSubjectColor(value: string): value is SubjectColor {
  return (SUBJECT_COLORS as readonly string[]).includes(value);
}
