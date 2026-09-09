import { formatTime, formatTimeRange } from "@domain/schedule";
import { gridWindow, layoutDay } from "@domain/timetable";
import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";

/**
 * One column the grid draws — a weekday for `/schedule`, a calendar date for
 * the week-at-a-glance screen. `key` is what a lesson's `column` matches
 * against; it says nothing about what kind of column this is, because the
 * grid no longer needs to know.
 */
export interface GridColumn {
  key: string;
  label: string;
  /** Marks the column that is "now", for the header's own highlight. */
  today?: boolean;
}

/**
 * One lesson, already resolved to the strings the grid draws.
 *
 * The grid takes text, not rows: a class name, a salle name and a colour are
 * three live queries away from a `ScheduleEntry`, and a component that knew
 * how to reach them would be a second copy of the page's data loading. The
 * page resolves; this draws.
 */
export interface GridLesson {
  id: string;
  /** Matches a `GridColumn.key` — a weekday number as a string, or a date. */
  column: string;
  startMinute: number;
  endMinute: number;
  /** The class, and the only thing guaranteed to be legible in a short block. */
  title: string;
  /** The salle, dropped first when the block is too short for it. */
  room?: string;
  /** "A" or "B" for an alternating lesson; absent when it runs every week. */
  cycle?: string;
  /** The subject's colour, or undefined when it has no subject. */
  color?: string;
  /**
   * A real destination. Present, the block is a `Link` that navigates;
   * absent, it is a button that reports its id through `onSelect` — the
   * editor opens a form beside the grid without leaving the page.
   */
  href?: string;
  /** Whether this lesson's séance already has attendance or behaviour recorded. */
  recorded?: boolean;
}

/**
 * The week as hours rather than as a list.
 *
 * A stack of cards per day answers "what is on Monday" and nothing else. A
 * teacher glancing at their week wants the shape of it — where the free hours
 * are, how long the gap before the afternoon runs, which day is heaviest — and
 * that shape only exists when a lesson's height and position mean something.
 *
 * **The height is one CSS variable, not a flex chain.** `--hour` clamps
 * between a floor and a ceiling around a share of the viewport, so 7h–19h
 * lands on screen on a tall display and the page simply scrolls on a short
 * one. Positioning every block off that same unit in `calc()` is what keeps a
 * block and its hour line agreeing: both are `n × --hour` from the top, so
 * neither can drift from the other whatever the window does.
 *
 * The floor is 3rem rather than `--control-min` because a block is a target: a
 * 55-minute lesson is fifty-five sixtieths of an hour, and 3rem × 55/60 is
 * 44px, the tap floor exactly. Any smaller and the ordinary French lesson
 * becomes untappable.
 *
 * `columns` is a list rather than a count because that is what serves both
 * widths: five weekday columns on a tablet, one chosen day on a phone, one
 * component. It started as a list of ISO weekdays; it is a list of opaque
 * keys now, because the week-at-a-glance screen's columns are dates, not
 * weekdays, and the grid never needed to know which it was drawing — it only
 * ever matched a lesson to a column by equality and asked the caller for the
 * heading text.
 */
export function TimeGrid({
  columns,
  lessons,
  selectedId,
  onSelect,
  now,
}: {
  /** The columns to draw, in order. */
  columns: GridColumn[];
  /** Every lesson of the week; the grid picks out the columns it draws. */
  lessons: GridLesson[];
  /** The lesson currently open in the editor, if any. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** The current moment, drawn as a line — absent on `/schedule`, which has no "now". */
  now?: { column: string; minute: number };
}) {
  const { t, i18n } = useTranslation();

  // The window is computed from the WHOLE week, not from the columns on
  // screen: switching the phone's day picker to Wednesday must not slide
  // every block, and a Thursday evening lesson must not change where
  // Monday's ten o'clock is drawn.
  const { start, end } = gridWindow(lessons);
  const hours = (end - start) / 60;

  // Hour labels sit at the top of the hour they name, so the last boundary
  // carries no label — there is no hour below it to name.
  const hourMarks = Array.from({ length: hours }, (_, i) => start + i * 60);

  return (
    <div
      className="grid gap-x-1"
      style={
        {
          // The gutter is sized, not `auto`: its labels are positioned, so an
          // auto column has nothing in flow to measure and collapses, taking
          // the left digit of every hour off the screen.
          gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))`,
          // Sized off the viewport, floored so a lesson stays tappable and
          // capped so a teacher with three lessons does not get a wall of
          // whitespace. The 16rem is the chrome above and below; being a
          // little out makes the grid slightly taller or shorter, never wrong.
          "--hour": `clamp(3rem, (100dvh - 16rem) / ${hours}, 5rem)`,
          "--grid-height": `calc(${hours} * var(--hour))`,
        } as React.CSSProperties
      }
    >
      {/* Header row: an empty cell over the gutter, then the column labels. */}
      <div aria-hidden="true" />
      {columns.map((column) => (
        <h3
          key={column.key}
          className={`pb-1 font-medium text-sm ${column.today ? "text-accent" : "text-text-muted"}`}
        >
          {column.label}
        </h3>
      ))}

      {/* The gutter. Labels are positioned off `--hour` like the blocks are,
          so a label can never name the wrong line. */}
      <div className="relative pr-1 text-right" style={{ height: "var(--grid-height)" }}>
        {hourMarks.map((minute, i) => (
          <span
            key={minute}
            className="absolute right-1 text-text-faint text-xs tabular-nums"
            style={{ top: `calc(${i} * var(--hour))` }}
          >
            {formatTime(minute, i18n.language)}
          </span>
        ))}
      </div>

      {columns.map((column) => (
        <div
          key={column.key}
          className="relative rounded border border-border"
          style={{
            height: "var(--grid-height)",
            // The hour lines. A repeating background rather than a div per
            // hour: six columns of twelve hours is seventy-two elements that
            // exist only to be a line, and the gradient is anchored to the
            // same origin the blocks are.
            backgroundImage:
              "linear-gradient(to bottom, var(--color-border) 0 1px, transparent 1px)",
            backgroundSize: "100% var(--hour)",
          }}
        >
          {layoutDay(lessons.filter((lesson) => lesson.column === column.key)).map(
            ({ entry, column: entryColumn, columns: entryColumns }) => {
              const range = formatTimeRange(entry.startMinute, entry.endMinute, i18n.language);
              const description = [range, entry.title, entry.room, entry.cycle]
                .filter(Boolean)
                .join(", ");

              // Shared verbatim by both branches below — two hand-maintained
              // copies of this is how a block drifts on one screen only.
              const blockClass = `absolute overflow-hidden rounded-sm border border-border px-1 py-0.5 text-left leading-tight ${
                selectedId === entry.id ? "ring-2 ring-accent" : ""
              }`;
              const blockStyle: React.CSSProperties = {
                top: `calc(${(entry.startMinute - start) / 60} * var(--hour))`,
                height: `calc(${(entry.endMinute - entry.startMinute) / 60} * var(--hour))`,
                left: `${(entryColumn / entryColumns) * 100}%`,
                width: `calc(${100 / entryColumns}% - 2px)`,
                borderLeft: `3px solid ${entry.color ?? "var(--color-border)"}`,
                // Mixed into the page's own background rather than set
                // flat, so the tint darkens with the ardoise theme instead
                // of glowing out of it.
                background: entry.color
                  ? `color-mix(in srgb, ${entry.color} 14%, var(--color-bg))`
                  : "var(--color-bg-subtle)",
              };
              const blockBody = (
                <>
                  {/* The dot is a SIBLING of the title, not a child of it: the
                      title alone carries `truncate`, so a long class name
                      clips against its own boundary and never eats the dot
                      along with it. `min-w-0` is required for the truncating
                      child to shrink below its content size inside a flex
                      row at all; `shrink-0` keeps the dot at its own size
                      when the title is squeezed. */}
                  <span className="flex items-center gap-1">
                    <span className="min-w-0 truncate font-medium text-sm">{entry.title}</span>
                    {entry.recorded && (
                      <span className="shrink-0 text-success text-sm" aria-hidden="true">
                        ●
                      </span>
                    )}
                    {entry.recorded && <span className="sr-only">{t("today.recorded")}</span>}
                  </span>
                  <span className="block truncate text-text-muted text-xs">
                    {entry.cycle ? `${entry.cycle} · ` : ""}
                    {entry.room ?? range}
                  </span>
                </>
              );

              return entry.href === undefined ? (
                <button
                  // Keyed by the lesson's own id. The selection and the
                  // editor's draft both hang off it, and a key by position
                  // would retarget them the moment a time changes.
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect?.(entry.id)}
                  aria-label={t("schedule.editLesson", { lesson: description })}
                  title={description}
                  className={blockClass}
                  style={blockStyle}
                >
                  {blockBody}
                </button>
              ) : (
                // A real Link, not a click handler on a div: a div takes no
                // focus and Enter does not fire on it. Same rule DataTable
                // follows for a row.
                <Link
                  key={entry.id}
                  to={entry.href}
                  aria-label={description}
                  title={description}
                  className={blockClass}
                  style={blockStyle}
                >
                  {blockBody}
                </Link>
              );
            },
          )}

          {now !== undefined &&
            now.column === column.key &&
            now.minute >= start &&
            now.minute <= end && (
              <div
                className="pointer-events-none absolute inset-x-0 border-danger border-t-2"
                style={{ top: `calc(${(now.minute - start) / 60} * var(--hour))` }}
                aria-hidden="true"
              />
            )}
        </div>
      ))}
    </div>
  );
}
