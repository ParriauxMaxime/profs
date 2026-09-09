import { useTranslation } from "react-i18next";

/**
 * Previous / Aujourd'hui / next, and a label for the window they move.
 *
 * Purely presentational: it does not know whether it steps a day, a week or a
 * month, which is what lets the journal and the front door share it while
 * stepping differently. The label is composed by the caller for the same
 * reason `TimeGrid` takes its column headings rather than computing them.
 */
export function CalendarNav({
  label,
  onPrevious,
  onNext,
  onToday,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
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
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}
