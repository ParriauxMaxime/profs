/**
 * Where one average sits in the class's spread.
 *
 * The first chart in this app, and drawn from ordinary elements: a chart
 * library from a CDN would break the no-network promise as surely as an
 * analytics call.
 *
 * It is deliberately NOT an SVG stretched to width. A `viewBox` with
 * `preserveAspectRatio="none"` scales x by ~2.8 at 375px and y by 1, so a
 * `<circle>` in it renders as a lozenge — and at either end of the scale half
 * of it falls outside the box and is clipped. Percentage `left` on a plain
 * element is immune to both: the marker is round at every width, and it
 * overhangs into the gap beside the min and max labels rather than being cut
 * in half at 0 and 1.
 *
 * It is never the only way to read the figures. `description` states the same
 * numbers in words and is what a screen reader gets; the bar is `aria-hidden`
 * decoration over it. Same rule the rubric levels follow — a label and a
 * colour, never a colour alone.
 */
export function PositionBar({
  fraction,
  meanFraction,
  minLabel,
  maxLabel,
  description,
}: {
  fraction: number;
  meanFraction: number;
  minLabel: string;
  maxLabel: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="text-text-faint text-xs tabular-nums">{minLabel}</span>
        <div className="relative h-3 flex-1">
          <div className="-translate-y-1/2 absolute inset-x-0 top-1/2 h-0.5 rounded-full bg-border" />
          {/* The class mean, full height so it reads as a scale mark rather
              than as a second pupil. */}
          <div
            className="-translate-x-1/2 absolute inset-y-0 w-0.5 bg-text-muted"
            style={{ left: `${meanFraction * 100}%` }}
          />
          <div
            className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-3 w-3 rounded-full bg-accent"
            style={{ left: `${fraction * 100}%` }}
          />
        </div>
        <span className="text-text-faint text-xs tabular-nums">{maxLabel}</span>
      </div>
      <span className="sr-only">{description}</span>
    </div>
  );
}
