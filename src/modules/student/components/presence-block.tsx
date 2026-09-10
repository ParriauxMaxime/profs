import type { Session, Student } from "@db";
import { toggleAttendance } from "@db/attendance";
import { useDb } from "@db/provider";
import { ATTENDANCE_VALUES, type AttendanceValue } from "@domain/attendance";
import { attendanceSummary, defaultOpenMonth, groupSeancesByMonth } from "@domain/student-summary";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ToggleOption } from "../../design-system/components/primitives";

/**
 * This pupil's attendance, lesson by lesson, editable in place.
 *
 * The séance IS the row: its date and hour are on screen, so the edit lands on
 * the lesson the teacher is pointing at. That is what makes this not the
 * "second, inline path" the invariant forbids — the register on a roster row
 * left the séance implicit, and a teacher could not see which lesson they were
 * marking.
 *
 * **No séance is ever created here.** Only lessons that already have a row can
 * be marked, so a page opened in December to read about September cannot file a
 * lesson nobody taught.
 *
 * A lesson nobody marked draws as a row with nothing pressed. `attendance.ts`
 * defines no default precisely so that reads as *not recorded* rather than as
 * *present*.
 */
export function PresenceBlock({ student, sessions }: { student: Student; sessions: Session[] }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const records = useLiveQuery(
    () => db.attendance.where({ studentId: student.id }).toArray(),
    [db, student.id],
  );

  const months = groupSeancesByMonth(sessions);
  // Held as a month key, never an index: the list regroups whenever a séance is
  // added elsewhere, and an index would open a different month. "" (the
  // teacher explicitly closed it) is distinct from null (nothing chosen yet,
  // fall back to the default), so collapsing the default-open month must not
  // silently re-open it.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = openKey ?? defaultOpenMonth(months, Date.now());

  if (records === undefined) return null;

  const sessionIds = new Set(sessions.map((session) => session.id));
  // Only this class's lessons count. A pupil moved between classes keeps rows
  // pointing at their old class's séances, and those are not this record.
  const mine = records.filter((record) => sessionIds.has(record.sessionId));
  const summary = attendanceSummary(mine);
  const attendanceOf = new Map(mine.map((record) => [record.sessionId, record.value]));

  const dayFormatter = new Intl.DateTimeFormat(i18n.language, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
  });
  const hour = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}h${String(minutes % 60).padStart(2, "0")}`;

  const set = async (sessionId: string, value: AttendanceValue): Promise<void> => {
    await toggleAttendance(db, sessionId, student.id, value);
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm text-text-muted">{t("student.assiduity")}</h3>

      {summary.rate !== null && (
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-lg tabular-nums">
            {new Intl.NumberFormat(i18n.language, {
              style: "percent",
              maximumFractionDigits: 1,
            }).format(summary.rate)}
          </span>
          <span className="text-sm text-text-muted">
            {`${t("student.markedSeances", { count: summary.marked })} — ${t("student.unjustified", { count: summary.unjustified })}`}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_VALUES.map((value) => (
          <div
            key={value}
            className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>{t(`attendance.${value}`)}</span>
            <span className="font-semibold tabular-nums">{summary.counts[value]}</span>
          </div>
        ))}
      </div>

      {months.length === 0 ? (
        <p className="text-sm text-text-faint">{t("student.noSeances")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {months.map((month) => {
            const isOpen = month.key === open;
            const label = monthFormatter.format(new Date(month.year, month.month, 1));
            return (
              <li key={month.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  className="btn w-full justify-between text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpenKey(isOpen ? "" : month.key)}
                >
                  <span>{label}</span>
                  <span className="text-text-muted">
                    {t("student.monthSeances", { count: month.sessions.length })}
                  </span>
                </button>

                {isOpen && (
                  <ul className="flex flex-col gap-1">
                    {month.sessions.map((session) => {
                      const current = attendanceOf.get(session.id);
                      return (
                        <li
                          key={session.id}
                          // gap-1, not gap-2: the four buttons are 44px each
                          // (never smaller — mid-lesson tap targets), so the
                          // date is what has to give room. A two-digit day and
                          // a two-digit hour ("sam. 28 nov. · 10h00") is the
                          // widest this ever renders, and it fits one line at
                          // 375px only with the gap this tight and the date at
                          // text-xs — measured, not assumed; see
                          // presence-block's own note in the task report.
                          // `flex-wrap` stays as a fallback for a locale whose
                          // date is longer still: it would rather drop the
                          // date to its own line than clip it or force a
                          // horizontal scrollbar.
                          className="flex flex-wrap items-center justify-between gap-1 rounded border border-border px-2 py-1"
                        >
                          <span className="min-w-0 whitespace-nowrap text-text-muted text-xs tabular-nums">
                            {dayFormatter.format(session.date)} · {hour(session.startsAt)}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {ATTENDANCE_VALUES.map((value) => (
                              <ToggleOption
                                key={value}
                                selected={current === value}
                                onSelect={() => void set(session.id, value)}
                                ariaLabel={t(`attendance.${value}`)}
                                title={t(`attendance.${value}`)}
                              >
                                {/* The initial is a translated key, never
                                    value[0]: English "late" is L, not R. The
                                    full word reaches the accessible name and
                                    the tooltip through `ToggleOption`, and the
                                    selected state is carried by its border and
                                    fill, never colour alone. */}
                                <span className="font-semibold tabular-nums">
                                  {t(`attendance.initial.${value}`)}
                                </span>
                              </ToggleOption>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
