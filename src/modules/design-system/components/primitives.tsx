import type { ReactNode } from "react";

/**
 * The controls a teacher taps mid-lesson.
 *
 * These exist so the touch floor cannot be got wrong. Before them the same
 * conceptual button was 42px in `.btn`, 44px in the pupil card and 56px in a
 * seat tile, and a 20px destructive overlay shipped on the seating grid — none
 * of which any test would catch, because each was individually reasonable.
 * Height comes from `--control-min` in `global.css`; a caller cannot override
 * it, which is the point.
 *
 * Colour is never the only carrier of state: every control here also sets
 * `aria-pressed` or a visible border change.
 */

/** A single action. Use `.btn` directly only for page chrome, not live entry. */
export function ActionButton({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
  ariaLabel,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const variantClass =
    variant === "primary" ? "btn btn-primary" : variant === "danger" ? "btn btn-danger" : "btn";
  return (
    <button
      type="button"
      className={className ? `${variantClass} ${className}` : variantClass}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/**
 * A row of mutually exclusive options — attendance values, rubric levels.
 *
 * Options share the width equally so the row is predictable under the thumb,
 * and tapping the selected option again clears it. That last part is a
 * deliberate affordance, not a convenience: a mis-tap mid-lesson has to be
 * recoverable without a dialog, and dialogs are banned here.
 */
export function ToggleGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm text-text-muted">{label}</span>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ToggleOption({
  children,
  selected,
  onSelect,
  color,
  textColor,
  ariaLabel,
  title,
}: {
  children: ReactNode;
  selected: boolean;
  onSelect: () => void;
  /** Fills the control when selected. Never the sole indicator of state. */
  color?: string;
  /**
   * The ink that goes on `color`. Required alongside it: white is not a safe
   * default — on a mid-tone fill it measures around 2.3:1, well under AA.
   */
  textColor?: string;
  /**
   * The accessible name, when the visible content is abbreviated. A dense
   * matrix shows the level number alone to stay scannable; the full label
   * still has to reach a screen reader, so it comes through here.
   */
  ariaLabel?: string;
  title?: string;
}) {
  const base =
    "flex min-h-(--control-min) min-w-(--control-min) flex-1 items-center justify-center rounded-(--control-radius) border px-3 py-2 font-medium text-sm";
  const state = selected
    ? color
      ? "border-transparent"
      : "border-accent bg-accent text-white"
    : "border-border bg-bg text-text hover:bg-bg-hover";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={title}
      className={`${base} ${state}`}
      style={selected && color ? { background: color, color: textColor ?? "#ffffff" } : undefined}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

/** A seat on the class plan. One size, from the tokens, wherever it appears. */
export function SeatTile({
  children,
  onClick,
  armed,
  dashed,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  armed?: boolean;
  dashed?: boolean;
  title?: string;
}) {
  const border = armed
    ? "border-accent ring-2 ring-accent"
    : dashed
      ? "border-border border-dashed"
      : "border-border";
  return (
    <button
      type="button"
      title={title}
      aria-pressed={armed}
      className={`flex h-(--tile-h) w-(--tile-w) flex-col items-center justify-center gap-0.5 rounded-(--control-radius) border p-1 hover:bg-bg-hover ${border}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A small read-only count or status. Never interactive — use a button if it is. */
export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm"
      style={color ? { borderColor: color, color } : undefined}
    >
      {color && (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
