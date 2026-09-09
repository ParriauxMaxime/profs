import { useDb } from "@db/provider";
import { sessionsInRange, startOfDay } from "@db/sessions";
import { addDays, weekDays } from "@domain/calendar";
import { entriesForDay, isoWeekday } from "@domain/schedule";
import { slotsForDay } from "@domain/seance";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { CalendarNav } from "../design-system/components/calendar-nav";
import { type GridColumn, type GridLesson, TimeGrid } from "../design-system/components/time-grid";
import { useRoomNames } from "../rooms/use-room-names";
import { InstallInvitation } from "../shared/components/install-invitation";
import { useMediaQuery } from "../shared/use-media-query";

/**
 * The front door: the week that is actually happening, drawn as hours.
 *
 * `/schedule` draws the recurring INTENTION — weekday columns, A/B badges, no
 * dates, an editor behind every block. This draws real dates: séances already
 * recorded show their dot, a line marks the current time, and every block is
 * a link into that lesson. Nothing is written from here — it is a signpost,
 * never a working surface.
 *
 * `date` names a DAY, never a week: the width decides whether that day's week
 * or that single day is drawn, so the narrow branch is the same screen
 * showing less of itself rather than a second URL.
 */
export function TodayPage({ date }: { date?: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const roomNames = useRoomNames();
  const termStart = readTermStart();
  const wide = useMediaQuery("(min-width: 1024px)");

  // Resolve-or-ignore: a URL can name a day that no longer parses — hand-
  // edited, truncated by a chat client, or an empty `?date=` — and the front
  // door must never open on NaN. `Number("")` is `0`, not NaN, so an empty
  // value is folded into the missing case before parsing rather than left for
  // `Number` to silently turn into 1 January 1970.
  const raw = date === undefined ? "" : date.trim();
  const parsed = raw === "" ? Number.NaN : Number(raw);
  const anchor = Number.isFinite(parsed) ? startOfDay(parsed) : startOfDay(Date.now());
  const days = wide ? weekDays(anchor) : [anchor];
  const from = days[0];
  const to = days[days.length - 1];

  // Always `replace`: walking to next week is a change of view, not a
  // navigation, and a `push` per tap makes Back crawl backwards one week at a
  // time.
  const step = (by: number): void =>
    Router.replace("Home", { date: String(addDays(anchor, wide ? by * 7 : by)) });
  // Clears the param rather than writing today's date into it: it keeps the
  // common URL clean and makes the button's meaning exact.
  const goToday = (): void => Router.replace("Home", {});

  const data = useLiveQuery(async () => {
    const [entries, classes, subjects, sessions] = await Promise.all([
      db.scheduleEntries.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
      sessionsInRange(db, from, to),
    ]);
    return { entries, classes, subjects, sessions };
  }, [db, from, to]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const subjectColor = (id: string | undefined) =>
    id === undefined ? undefined : data.subjects.find((s) => s.id === id)?.color;
  const roomName = (id: string | undefined) => (id === undefined ? undefined : roomNames.get(id));

  const today = startOfDay(Date.now());
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" });

  // Monday to Friday always; Saturday and Sunday earn a column only when that
  // DATE carries something — a Saturday make-up lesson is a fact about the
  // 12th, not about Saturdays.
  const perDay = days.map((day) => {
    const scheduled = entriesForDay(data.entries, termStart, day);
    const daySessions = data.sessions.filter((s) => s.date === day);
    return { day, slots: slotsForDay(daySessions, scheduled, day), scheduled };
  });
  const shown = perDay.filter(({ day, slots }) => isoWeekday(day) <= 5 || slots.length > 0);

  const columns: GridColumn[] = shown.map(({ day }) => ({
    key: String(day),
    label: dayLabel.format(new Date(day)),
    today: day === today,
  }));

  const lessons: GridLesson[] = shown.flatMap(({ day, slots, scheduled }) =>
    slots.map((slot) => {
      const entry = scheduled.find((e) => e.id === slot.entryId);
      const session = data.sessions.find((s) => s.id === slot.sessionId);
      const classId = entry?.classId ?? session?.classId ?? "";
      return {
        id: `${day}-${slot.startsAt}-${classId}`,
        column: String(day),
        startMinute: slot.startsAt,
        endMinute: slot.endsAt,
        title: className(classId),
        ...(roomName(entry?.roomId) ? { room: roomName(entry?.roomId) } : {}),
        ...(subjectColor(entry?.subjectId) ? { color: subjectColor(entry?.subjectId) } : {}),
        ...(slot.sessionId === null ? {} : { recorded: true }),
        href: Router.Class({ classId, date: String(day), at: String(slot.startsAt) }),
      };
    }),
  );

  const windowLabel = wide
    ? new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "long", year: "numeric" })
        // Chrome/Node's `formatRange` collapses the shared month and year
        // rather than repeating them — "7 – 11 septembre 2026", not
        // "7 septembre 2026 – 11 septembre 2026".
        .formatRange(new Date(from), new Date(to))
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date(anchor));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">{t("today.title")}</h2>
      <CalendarNav
        label={windowLabel}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        onToday={goToday}
      />

      {lessons.length === 0 ? (
        <EmptyToday hasEntries={data.entries.length > 0} termStart={termStart} wide={wide} />
      ) : (
        <TimeGrid
          columns={columns}
          lessons={lessons}
          now={{ column: String(today), minute: nowMinute }}
        />
      )}

      {/* Last on the front door, and usually nothing at all: it renders only
          in a browser that can actually install, and only until the teacher
          has installed or said "plus tard" once. */}
      <InstallInvitation />
    </div>
  );
}

/**
 * Empty states are directions, not decoration: each one says what is missing
 * and where it is fixed.
 */
function EmptyToday({
  hasEntries,
  termStart,
  wide,
}: {
  hasEntries: boolean;
  termStart: number | null;
  wide: boolean;
}) {
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
      <p className="text-text-muted">{t(wide ? "today.nothingThisWeek" : "today.nothingToday")}</p>
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
