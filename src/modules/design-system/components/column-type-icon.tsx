import type { ColumnType } from "@domain/gradebook/column";

const GLYPHS: Record<ColumnType, string> = {
  numeric: "#",
  letter: "A",
  icon: "★",
  checkbox: "☑",
  text: "¶",
  attendance: "◷",
};

export function ColumnTypeIcon({ type }: { type: ColumnType }) {
  return (
    <span aria-hidden="true" className="text-text-faint">
      {GLYPHS[type]}
    </span>
  );
}
