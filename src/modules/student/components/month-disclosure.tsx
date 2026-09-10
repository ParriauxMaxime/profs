/**
 * One month of a pupil's history, open or closed.
 *
 * Deliberately NOT a `.btn`. A `.btn` sets `justify-content: center`, and
 * `global.css` lands after `@import "tailwindcss"`, so at equal specificity it
 * beats a `justify-between` utility — which is why the month and its count used
 * to sit jammed together in the middle of a full-width row. A row that spans
 * the list is not a button chip anyway; the touch floor comes from
 * `--control-min` here exactly as it does there.
 *
 * Closed and open differ by more than the caret: the open row takes a fill, so
 * "which month am I reading" survives a glance that misses a small glyph. The
 * caret is a text glyph rather than an SVG, matching `ColumnTypeIcon` and the
 * `‹ ›` arrows, and is `aria-hidden` — `aria-expanded` is what a screen reader
 * reads.
 */
export function MonthDisclosure({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  /** What sits at the far end of the row — séances, events. Already pluralised. */
  count: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex min-h-(--control-min) w-full items-center justify-between gap-2 rounded-(--control-radius) border px-3 py-2 text-left hover:bg-bg-hover ${
        open ? "border-border bg-bg-subtle font-medium" : "border-border bg-bg"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {/* ONE glyph, rotated — never ▸ swapped for ▾. The two characters are
            different widths in Luciole, so swapping them nudged the month name
            sideways on every toggle. Rotation also gives the movement a
            direction, which is what makes "it opened" legible without reading
            anything. */}
        <span
          aria-hidden="true"
          className={`inline-block w-3 shrink-0 text-center transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="break-words">{label}</span>
      </span>
      <span className="shrink-0 text-sm text-text-muted tabular-nums">{count}</span>
    </button>
  );
}
