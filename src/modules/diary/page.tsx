import type { Session } from "@db";
import { useDb } from "@db/provider";
import { sessionsInRange, startOfDay } from "@db/sessions";
import { addDays, monthGrid, startOfIsoWeek, weekDays } from "@domain/calendar";
import { minutesToHm } from "@domain/schedule";
import { fuzzyMatchAny } from "@domain/search";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarNav } from "../design-system/components/calendar-nav";
import { ToggleGroup, ToggleOption } from "../design-system/components/primitives";
import { SeanceNote } from "./components/seance-note";

const VIEWS = ["agenda", "week", "month"] as const;
type View = (typeof VIEWS)[number];

/**
 * One class's journal, read through a calendar.
 *
 * Deliberately not called a cahier de textes: that record is legally mandated
 * in France and must be consultable by pupils, parents and the chef
 * d'établissement, which an app with no network cannot be. The naming is where
 * that distinction is kept — there is no on-screen disclaimer, because a
 * teacher who installed a local-only app does not need telling it is not the
 * ENT. PRIVACY.md and README.md carry the statement in full.
 *
 * A day holds one entry per séance, so this reads `Session` rather than a
 * day-keyed diary entry: a class taught twice in one day carries two notes,
 * and a class never opened that day carries none — the archive shows only
 * lessons that actually happened, never a prediction from the timetable.
 *
 * `classId` is required, and the cross-class view it used to offer behind a
 * selector is gone with the `/diary` destination: a teacher looks back at 3°B,
 * from 3°B. Reading every class at once answered a question nobody was asking
 * and cost a whole drawer entry to reach.
 */
export function DiaryPage({ classId }: { classId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const [view, setView] = useState<View>("agenda");
  const [query, setQuery] = useState("");
  // The day the visible window is anchored on. Local midnight, always.
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));

  const { from, to } = windowFor(view, anchor);

  const data = useLiveQuery(async () => {
    const [classes, sessions] = await Promise.all([
      db.classes.toArray(),
      sessionsInRange(db, from, to),
    ]);
    return { classes, sessions };
  }, [db, from, to]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const sessions = data.sessions.filter((s) => s.classId === classId);

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";

  // Search filters the days shown, not the text inside them: a teacher looking
  // for "fractions" wants the days they taught fractions, with the whole
  // séance readable, not a highlighted fragment.
  const matching = (session: Session) =>
    fuzzyMatchAny([session.note, className(session.classId)], query);
  const searching = query.trim() !== "";
  const searchedSessions = searching ? sessions.filter(matching) : sessions;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* No heading: the link that reaches this page is already labelled
            Journal, and a second one two lines below it says nothing. */}
        <ToggleGroup label={t("diary.view")}>
          {VIEWS.map((option) => (
            <ToggleOption key={option} selected={view === option} onSelect={() => setView(option)}>
              {t(`diary.viewLabel.${option}`)}
            </ToggleOption>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="field max-w-xs"
          placeholder={t("diary.searchPlaceholder")}
          aria-label={t("diary.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <CalendarNav
          label={windowLabel(view, anchor, i18n.language)}
          onPrevious={() => setAnchor(shift(view, anchor, -1))}
          onNext={() => setAnchor(shift(view, anchor, 1))}
          onToday={() => setAnchor(startOfDay(Date.now()))}
        />
      </div>

      {view === "agenda" && (
        <AgendaView
          sessions={searchedSessions}
          locale={i18n.language}
          className={className}
          searching={searching}
        />
      )}

      {view === "week" && (
        <GridView
          days={weekDays(anchor).map((date) => ({ date, inMonth: true }))}
          columns={7}
          sessions={searchedSessions}
          locale={i18n.language}
          className={className}
          onPick={(date) => {
            setAnchor(date);
            setView("agenda");
          }}
        />
      )}

      {view === "month" && (
        <GridView
          days={monthGrid(new Date(anchor).getFullYear(), new Date(anchor).getMonth()).flat()}
          columns={7}
          sessions={searchedSessions}
          locale={i18n.language}
          className={className}
          onPick={(date) => {
            setAnchor(date);
            setView("agenda");
          }}
        />
      )}
    </div>
  );
}

/**
 * The visible span for a view.
 *
 * Agenda shows a month at a time rather than the whole year: an unbounded
 * range would read every session ever recorded on every keystroke of the
 * search box, and paging is cheap.
 */
function windowFor(view: View, anchor: number): { from: number; to: number } {
  if (view === "week") {
    const days = weekDays(anchor);
    return { from: days[0], to: days[6] };
  }
  const d = new Date(anchor);
  const first = startOfDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  const last = startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime());
  if (view === "agenda") return { from: first, to: last };
  // A month grid spills into the adjacent months, so its window must too.
  const grid = monthGrid(d.getFullYear(), d.getMonth()).flat();
  return { from: grid[0].date, to: grid[grid.length - 1].date };
}

/**
 * Move the window one week or one month.
 *
 * A week is walked with `addDays` rather than by adding seven times
 * 86_400_000: across a daylight-saving change that offset lands an hour early
 * and eventually a whole day out.
 */
function shift(view: View, anchor: number, by: number): number {
  if (view !== "week") {
    const d = new Date(anchor);
    return startOfDay(new Date(d.getFullYear(), d.getMonth() + by, 1).getTime());
  }
  return addDays(startOfIsoWeek(anchor), by > 0 ? 7 : -7);
}

function windowLabel(view: View, anchor: number, locale: string): string {
  if (view === "week") {
    const days = weekDays(anchor);
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    return `${fmt.format(new Date(days[0]))} – ${fmt.format(new Date(days[6]))}`;
  }
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(anchor),
  );
}

/** A séance's start time, formatted in the app locale. `formatTimeRange` is
 * not right here — a séance has a start only, never an end. */
function formatSeanceTime(startsAt: number, locale: string): string {
  const { hours, minutes } = minutesToHm(startsAt);
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function AgendaView({
  sessions,
  locale,
  className,
  searching,
}: {
  sessions: Session[];
  locale: string;
  className: (id: string) => string;
  searching: boolean;
}) {
  const { t } = useTranslation();

  // `sessions` arrives newest day first with each day's séances already
  // earliest-first — the order `sessionsInRange` documents as "the order the
  // journal reads them in" — so grouping only needs to preserve it.
  const byDay = new Map<number, Session[]>();
  for (const session of sessions) {
    const day = byDay.get(session.date) ?? [];
    day.push(session);
    byDay.set(session.date, day);
  }
  const days = [...byDay.entries()];

  const dayFormat = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (days.length === 0) {
    return <p className="text-text-muted">{searching ? t("diary.noMatch") : t("diary.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {days.map(([date, daySessions]) => (
        <li key={date} className="flex flex-col gap-2">
          <h3 className="font-medium text-sm text-text-muted">
            {dayFormat.format(new Date(date))}
          </h3>
          {daySessions.map((session) => (
            <div
              key={session.id}
              className="paper flex flex-col gap-2 rounded border border-border p-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium">{className(session.classId)}</span>
                <span className="text-sm text-text-muted">
                  {session.startsAt === undefined
                    ? t("diary.unscheduled")
                    : t("diary.seanceAt", { time: formatSeanceTime(session.startsAt, locale) })}
                </span>
              </div>
              <SeanceNote
                // Anchored to the séance itself, never to its position in the
                // list: two lessons for the same class on the same day must
                // keep separate drafts.
                key={session.id}
                sessionId={session.id}
                text={session.note ?? ""}
              />
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}

function GridView({
  days,
  columns,
  sessions,
  locale,
  className,
  onPick,
}: {
  days: { date: number; inMonth: boolean }[];
  columns: number;
  sessions: Session[];
  locale: string;
  className: (id: string) => string;
  onPick: (date: number) => void;
}) {
  const { t } = useTranslation();
  const today = startOfDay(Date.now());
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {days.slice(0, 7).map((day) => (
          <span key={`head-${day.date}`} className="text-center text-text-muted text-xs">
            {weekdayFormat.format(new Date(day.date))}
          </span>
        ))}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const daySessions = sessions.filter((s) => s.date === day.date);
          const hasNote = daySessions.some((s) => s.note !== undefined);
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onPick(day.date)}
              className={`flex flex-col items-start gap-1 rounded border p-1 text-left ${
                day.date === today ? "border-accent" : "border-border"
              } ${day.inMonth ? "" : "opacity-50"}`}
              style={{ minHeight: "var(--control-min)" }}
              aria-label={new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(
                new Date(day.date),
              )}
            >
              <span className="text-xs tabular-nums">{new Date(day.date).getDate()}</span>
              {daySessions.map((session) => (
                <span key={session.id} className="w-full truncate text-[10px] text-text-muted">
                  {className(session.classId)}
                </span>
              ))}
              {/* The note does not fit in a cell, so a day carrying one is
                  marked rather than quoted. */}
              {hasNote && (
                <span className="text-[10px] text-accent" title={t("diary.hasEntry")}>
                  ●<span className="sr-only">{t("diary.hasEntry")}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
