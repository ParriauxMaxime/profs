import type { ScheduleEntry, Session } from "@db";
import { useDb } from "@db/provider";
import { startOfDay } from "@db/sessions";
import { entriesForDate, formatTimeRange } from "@domain/schedule";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";

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

  // Without an anchor, nothing on an alternating cycle has a meaningful
  // parity. `entriesForDate` needs one, so the `all` lessons are selected
  // directly rather than guessing a week — a teacher who has not set a term
  // start still sees the lessons that happen every week.
  const scheduled: ScheduleEntry[] =
    termStart === null
      ? data.entries
          .filter((e) => e.weekCycle === "all" && e.weekday === isoWeekdayOf(now))
          .sort((a, b) => a.startMinute - b.startMinute)
      : entriesForDate(data.entries, termStart, now);

  // The merge. A session is matched to a scheduled entry by class: a teacher
  // taking the same class twice in one day is rare enough that pairing the
  // session with the earliest of that class's lessons is right far more often
  // than showing it as an extra unscheduled row would be.
  const claimed = new Set<string>();
  const lessons: TodayLesson[] = scheduled.map((entry) => {
    const session =
      data.sessions.find((s) => s.classId === entry.classId && !claimed.has(s.id)) ?? null;
    if (session) claimed.add(session.id);
    return {
      key: entry.id,
      classId: entry.classId,
      entry,
      session,
      startMinute: entry.startMinute,
    };
  });

  // Anything started that no scheduled lesson claimed: a cover class, or a
  // lesson opened before the timetable existed. Both are real days of work
  // and must not vanish because they were not predicted.
  for (const session of data.sessions) {
    if (claimed.has(session.id)) continue;
    lessons.push({
      key: session.id,
      classId: session.classId,
      entry: null,
      session,
      startMinute: null,
    });
  }

  // Unscheduled sessions sort last: they have no time to sort by, and a
  // teacher reads Today as a clock.
  lessons.sort((a, b) => {
    if (a.startMinute === null && b.startMinute === null) return 0;
    if (a.startMinute === null) return 1;
    if (b.startMinute === null) return -1;
    return a.startMinute - b.startMinute;
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
                to={Router.ClassPlan({ classId: lesson.classId })}
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
                {lesson.entry?.room && (
                  <span className="text-sm text-text-muted">{lesson.entry.room}</span>
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

/** ISO weekday, 1 = Monday. Duplicated from the domain only to avoid an export. */
function isoWeekdayOf(ms: number): number {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
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
