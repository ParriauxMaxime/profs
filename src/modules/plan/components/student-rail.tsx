import type { Student } from "@db";
import { fuzzyMatchAny } from "@domain/search";
import type { Held } from "@domain/seating";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/** Above this many chips the rail stops being scannable and grows a search field. */
const SEARCH_THRESHOLD = 12;

/**
 * The pupils holding no seat, beside the grid rather than under it.
 *
 * Tap a chip to pick that pupil up, tap it again to put them down, then tap a
 * seat. Nothing here is ever disabled: the old pool was inert until a seat had
 * been armed, and its hint line appeared and disappeared with that state,
 * which moved every chip by a line height between the two taps of a single
 * gesture. The hint is always present now, and only its text changes.
 */
export function StudentRail({
  students,
  held,
  onHold,
}: {
  students: Student[];
  held: Held | null;
  onHold: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const showSearch = students.length > SEARCH_THRESHOLD;
  const visible = showSearch
    ? students.filter((s) => fuzzyMatchAny([s.lastName, s.firstName], query))
    : students;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 lg:sticky lg:top-4 lg:w-64 lg:shrink-0">
      <h3 className="flex items-center justify-between gap-2 font-medium text-sm text-text-muted">
        {t("plan.unseated")}
        <span className="rounded-full bg-accent px-2 py-0.5 text-white text-xs">
          {students.length}
        </span>
      </h3>

      {students.length === 0 ? (
        <p className="text-sm text-text-muted">{t("plan.allSeated")}</p>
      ) : (
        <>
          {showSearch && (
            <input
              className="field"
              type="search"
              placeholder={t("plan.searchPupil")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          {/* `flex-wrap` must be turned off at lg: with `flex-col` and a max
              height it wraps into a SECOND COLUMN past 28rem, so the rail
              scrolls sideways and clips the names it exists to show. */}
          <div className="flex flex-wrap gap-2 lg:max-h-[28rem] lg:flex-col lg:flex-nowrap lg:overflow-y-auto">
            {visible.map((student) => {
              const isHeld = held?.kind === "pool" && held.studentId === student.id;
              return (
                <button
                  key={student.id}
                  type="button"
                  aria-pressed={isHeld}
                  className={`btn flex min-h-11 items-center gap-1.5 text-sm lg:justify-start ${
                    isHeld ? "border-accent ring-2 ring-accent" : ""
                  }`}
                  onClick={() => onHold(student.id)}
                >
                  <PupilName student={student} />
                </button>
              );
            })}
          </div>

          <p className="text-text-faint text-xs">
            {held === null ? t("plan.hintPick") : t("plan.hintPlace")}
          </p>
        </>
      )}
    </div>
  );
}
