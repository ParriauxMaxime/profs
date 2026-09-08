import type { ScheduleEntry, Session } from "@db";
import { useDb } from "@db/provider";
import { startOfDay } from "@db/sessions";
import { entriesForDay, formatTimeRange } from "@domain/schedule";
import { slotsForDay } from "@domain/seance";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useRoomNames } from "../rooms/use-room-names";

/**
 * One row of Today: a lesson that is scheduled, under way, or both.
 *
 * A lesson that is both must appear ONCE. Rendering the schedule list and the
 * session list one after the other would show a started lesson twice, and the
 * teacher would have no way to tell which of the two to tap.
 */
interface TodayLesson {
  key: string;
  classId: string;
  entry: ScheduleEntry | null;
  session: Session | null;
  /** Minutes from midnight, or null for a session with no scheduled time. */
  startMinute: number | null;
}

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const roomNames = useRoomNames();
  const termStart = readTermStart();
  const now = Date.now();
  const today = startOfDay(now);
  const nowMinute = new Date(now).getHours() * 60 + new Date(now).getMinutes();

  const data = useLiveQuery(async () => {
    const [entries, classes, subjects, sessions] = await Promise.all([
      db.scheduleEntries.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
      db.sessions.where("date").equals(startOfDay(Date.now())).toArray(),
    ]);
    return { entries, classes, subjects, sessions };
  }, [db, today]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const subjectName = (id: string | undefined) =>
    id === undefined ? undefined : data.subjects.find((s) => s.id === id)?.name;
  const subjectColor = (id: string | undefined) =>
    id === undefined ? undefined : data.subjects.find((s) => s.id === id)?.color;

  // `entriesForDay` carries the missing-anchor rule: without a term start,
  // nothing on an alternating cycle has a meaningful parity, so only the
  // every-week lessons are shown rather than a week being guessed. The class
  // page reads the same function — this used to be a copy in each.
  const scheduled: ScheduleEntry[] = entriesForDay(data.entries, termStart, now);

  // Every class at once, which is what makes `slotsForDay`'s class rule load
  // bearing here: it pairs a séance only with a lesson of its OWN class, so
  // two classes taught at the same minute cannot claim each other's. It claims
  // each entry at most once, keeps unmatched séances (a cover class, or a
  // lesson opened before the timetable existed) and unmatched scheduled
  // lessons, and orders earliest first with untimed last.
  const slots = slotsForDay(data.sessions, scheduled, today);
  const lessons: TodayLesson[] = slots.map((slot) => {
    const entry =
      slot.entryId === null ? null : (scheduled.find((e) => e.id === slot.entryId) ?? null);
    const session =
      slot.sessionId === null ? null : (data.sessions.find((s) => s.id === slot.sessionId) ?? null);
    return {
      key: slot.sessionId ?? slot.entryId ?? "",
      classId: entry?.classId ?? session?.classId ?? "",
      entry,
      session,
      startMinute: slot.startsAt,
    };
  });

  const nextIndex = lessons.findIndex(
    (lesson) => lesson.entry !== null && lesson.entry.endMinute > nowMinute,
  );

  const dateLabel = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(
    new Date(today),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg">{t("today.title")}</h2>
        <span className="text-sm text-text-muted">{dateLabel}</span>
      </div>

      {lessons.length === 0 ? (
        <EmptyToday hasEntries={data.entries.length > 0} termStart={termStart} />
      ) : (
        <ul className="flex flex-col gap-2">
          {lessons.map((lesson, index) => (
            <li key={lesson.key}>
              <Link
                to={Router.Class({
                  classId: lesson.classId,
                  date: String(startOfDay(now)),
                  at: lesson.startMinute === null ? undefined : String(lesson.startMinute),
                })}
                className={`paper flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border p-3 hover:bg-bg-hover ${
                  index === nextIndex ? "border-accent" : "border-border"
                }`}
                style={{
                  borderLeft: `4px solid ${
                    subjectColor(lesson.entry?.subjectId ?? undefined) ?? "transparent"
                  }`,
                }}
              >
                <span className="font-medium tabular-nums">
                  {lesson.entry === null
                    ? t("today.unscheduled")
                    : formatTimeRange(
                        lesson.entry.startMinute,
                        lesson.entry.endMinute,
                        i18n.language,
                      )}
                </span>
                <span className="font-medium">{className(lesson.classId)}</span>
                {subjectName(lesson.entry?.subjectId ?? undefined) && (
                  <span className="text-sm text-text-muted">
                    {subjectName(lesson.entry?.subjectId ?? undefined)}
                  </span>
                )}
                {lesson.entry?.roomId && roomNames.has(lesson.entry.roomId) && (
                  <span className="text-sm text-text-muted">
                    {roomNames.get(lesson.entry.roomId)}
                  </span>
                )}
                {/* A lesson that is both scheduled and started says so here
                    rather than appearing twice. */}
                {lesson.session !== null && (
                  <span className="rounded bg-bg-hover px-2 py-0.5 text-xs">
                    {t("today.underway")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Empty states are directions, not decoration: each one says what is missing
 * and where it is fixed.
 */
function EmptyToday({ hasEntries, termStart }: { hasEntries: boolean; termStart: number | null }) {
  const { t } = useTranslation();

  if (!hasEntries) {
    return (
      <p className="text-text-muted">
        {t("today.noSchedule")}{" "}
        <Link to={Router.Schedule()} className="underline">
          {t("nav.schedule")}
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-muted">{t("today.nothingToday")}</p>
      {termStart === null && (
        <p className="text-sm text-text-muted">
          {t("today.needsTermStart")}{" "}
          <Link to={Router.Settings()} className="underline">
            {t("nav.settings")}
          </Link>
        </p>
      )}
    </div>
  );
}
