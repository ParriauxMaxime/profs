/**
 * Where one average sits in the class's spread.
 *
 * The first chart in this app, and hand-written inline SVG because it has to
 * be: a chart library from a CDN would break the no-network promise as surely
 * as an analytics call.
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
  const pct = (n: number): string => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="text-text-faint text-xs tabular-nums">{minLabel}</span>
        <svg
          className="h-3 flex-1"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          role="presentation"
        >
          <title>{description}</title>
          <line x1="0" y1="6" x2="100" y2="6" className="stroke-border" strokeWidth="2" />
          <line
            x1={meanFraction * 100}
            y1="1"
            x2={meanFraction * 100}
            y2="11"
            className="stroke-text-muted"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={fraction * 100} cy="6" r="5" className="fill-accent" />
        </svg>
        <span className="text-text-faint text-xs tabular-nums">{maxLabel}</span>
      </div>
      <span className="sr-only">{description}</span>
      <span className="sr-only">{pct(fraction)}</span>
    </div>
  );
}
