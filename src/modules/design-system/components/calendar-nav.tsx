import { fromDateInputValue, toDateInputValue } from "@domain/term";
import { useTranslation } from "react-i18next";

/**
 * Previous / Aujourd'hui / next, and a label for the window they move.
 *
 * Purely presentational: it does not know whether it steps a day, a week or a
 * month, which is what lets the journal and the front door share it while
 * stepping differently. The label is composed by the caller for the same
 * reason `TimeGrid` takes its column headings rather than computing them.
 *
 * The date field is opt-in, and the same rule applies to it: it reports a DAY
 * and the caller decides what that means — the front door opens that day's
 * week on a wide screen and that day alone on a narrow one. Without it, three
 * buttons can only walk, and reaching a lesson two months back is a lot of
 * tapping to answer "what did I do with 3°B in June".
 *
 * A native `<input type="date">` rather than a calendar of our own: Réglages
 * already picks the term anchor with one, it is keyboard- and screen-reader
 * complete without us writing any of that, and its overlay is browser chrome
 * rather than one of the blocking dialogs this app bans.
 */
export function CalendarNav({
  label,
  date,
  onPrevious,
  onNext,
  onToday,
  onPickDate,
}: {
  label: string;
  /** The day the field shows. Omit it, with `onPickDate`, to draw no field. */
  date?: number;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** A day at local midnight. Omit it, with `date`, to draw no field. */
  onPickDate?: (day: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn"
          aria-label={t("calendar.previous")}
          onClick={onPrevious}
        >
          ‹
        </button>
        <button type="button" className="btn" onClick={onToday}>
          {t("calendar.today")}
        </button>
        <button type="button" className="btn" aria-label={t("calendar.next")} onClick={onNext}>
          ›
        </button>
      </div>

      {date !== undefined && onPickDate !== undefined && (
        <input
          type="date"
          // `max-w-*`, never `w-auto`: `.field` sets `width: 100%` and
          // `global.css` lands after `@import "tailwindcss"`, so at equal
          // specificity the class beats the utility and the field spans the
          // row. Capping the max width is what Réglages' own date input does.
          className="field max-w-[11rem]"
          aria-label={t("calendar.pickDate")}
          value={toDateInputValue(date)}
          onChange={(e) => {
            // A half-typed value parses to null and is ignored rather than
            // navigating: the field emits on every keystroke, so "2026-09-0"
            // would otherwise step the view through days nobody asked for.
            const day = fromDateInputValue(e.target.value);
            if (day !== null) onPickDate(day);
          }}
        />
      )}

      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}
