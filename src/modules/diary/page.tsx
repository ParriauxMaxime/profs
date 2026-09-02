import type { DiaryEntry, ScheduleEntry, SchoolClass } from "@db";
import { useDb } from "@db/provider";
import { startOfDay } from "@db/sessions";
import {
  agendaDays,
  daysInRange,
  monthGrid,
  nextDay,
  previousDay,
  startOfIsoWeek,
  weekDays,
} from "@domain/calendar";
import { entriesForDate, formatTimeRange } from "@domain/schedule";
import { fuzzyMatchAny } from "@domain/search";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ToggleGroup, ToggleOption } from "../design-system/components/primitives";
import { DayEntry } from "./components/day-entry";

const VIEWS = ["agenda", "week", "month"] as const;
type View = (typeof VIEWS)[number];

/** A lesson on a concrete day: a schedule entry resolved against a date. */
interface Lesson {
  entry: ScheduleEntry;
  date: number;
}

/**
 * The journal, read through a calendar.
 *
 * Deliberately not called a cahier de textes: that record is legally mandated
 * in France and must be consultable by pupils, parents and the chef
 * d'établissement, which an app with no network cannot be. The naming is where
 * that distinction is kept — there is no on-screen disclaimer, because a
 * teacher who installed a local-only app does not need telling it is not the
 * ENT. PRIVACY.md and README.md carry the statement in full.
 *
 * With the class filter off and the week mode on, this is what was scoped as
 * the 4c planner. A second calendar rendering the same tables would have been
 * one more thing to keep in sync.
 */
export function DiaryPage() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const termStart = readTermStart();

  const [view, setView] = useState<View>("agenda");
  // Held as a class id, never an index into the list.
  const [classId, setClassId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The day the visible window is anchored on. Local midnight, always.
  const [anchor, setAnchor] = useState(() => startOfDay(Date.now()));

  const { from, to } = windowFor(view, anchor);

  const data = useLiveQuery(async () => {
    const [classes, schedule, entries] = await Promise.all([
      db.classes.toArray(),
      db.scheduleEntries.toArray(),
      db.diaryEntries.where("date").between(from, to, true, true).toArray(),
    ]);
    return { classes, schedule, entries };
  }, [db, from, to]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const visibleClasses =
    classId === null ? data.classes : data.classes.filter((c) => c.id === classId);
  const visibleClassIds = new Set(visibleClasses.map((c) => c.id));

  const schedule = data.schedule.filter((e) => visibleClassIds.has(e.classId));
  const entries = data.entries.filter((e) => visibleClassIds.has(e.classId));

  // Resolve the recurring timetable against every day of the window. Without a
  // term start, only the lessons that run every week can be placed: an A/B
  // lesson has no meaningful parity, and showing it on the wrong week is worse
  // than not showing it.
  const lessons: Lesson[] = daysInRange(from, to).flatMap((date) => {
    const forDay =
      termStart === null
        ? schedule.filter((e) => e.weekCycle === "all" && e.weekday === isoWeekday(date))
        : entriesForDate(schedule, termStart, date);
    return forDay.map((entry) => ({ entry, date }));
  });

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";

  // Search filters the days shown, not the text inside them: a teacher looking
  // for "fractions" wants the days they taught fractions, with the whole entry
  // readable, not a highlighted fragment.
  const matching = (entry: DiaryEntry) =>
    fuzzyMatchAny([entry.text, className(entry.classId)], query);
  const searching = query.trim() !== "";
  const searchedEntries = searching ? entries.filter(matching) : entries;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("diary.title")}</h2>
        <ToggleGroup label={t("diary.view")}>
          {VIEWS.map((option) => (
            <ToggleOption key={option} selected={view === option} onSelect={() => setView(option)}>
              {t(`diary.viewLabel.${option}`)}
            </ToggleOption>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="field w-auto"
          aria-label={t("diary.filterByClass")}
          value={classId ?? ""}
          onChange={(e) => setClassId(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">{t("diary.allClasses")}</option>
          {data.classes.map((schoolClass: SchoolClass) => (
            <option key={schoolClass.id} value={schoolClass.id}>
              {schoolClass.name}
            </option>
          ))}
        </select>

        <input
          type="search"
          className="field max-w-xs"
          placeholder={t("diary.searchPlaceholder")}
          aria-label={t("diary.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn"
            aria-label={t("diary.previous")}
            onClick={() => setAnchor(shift(view, anchor, -1))}
          >
            ‹
          </button>
          <button type="button" className="btn" onClick={() => setAnchor(startOfDay(Date.now()))}>
            {t("diary.today")}
          </button>
          <button
            type="button"
            className="btn"
            aria-label={t("diary.next")}
            onClick={() => setAnchor(shift(view, anchor, 1))}
          >
            ›
          </button>
        </div>

        <span className="text-sm text-text-muted">{windowLabel(view, anchor, i18n.language)}</span>
      </div>

      {data.classes.length === 0 && (
        <p className="text-text-muted">
          {t("diary.needsClass")}{" "}
          <Link to={Router.Classes()} className="underline">
            {t("nav.classes")}
          </Link>
        </p>
      )}

      {termStart === null && schedule.some((e) => e.weekCycle !== "all") && (
        <p className="text-sm text-text-muted">
          {t("diary.needsTermStart")}{" "}
          <Link to={Router.Settings()} className="underline">
            {t("nav.settings")}
          </Link>
        </p>
      )}

      {view === "agenda" && (
        <AgendaView
          from={from}
          to={to}
          lessons={lessons}
          entries={searchedEntries}
          classes={visibleClasses}
          locale={i18n.language}
          className={className}
          searching={searching}
        />
      )}

      {view === "week" && (
        <GridView
          days={weekDays(anchor).map((date) => ({ date, inMonth: true }))}
          columns={7}
          lessons={lessons}
          entries={searchedEntries}
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
          lessons={lessons}
          entries={searchedEntries}
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

/** ISO weekday, 1 = Monday. */
function isoWeekday(ms: number): number {
  const day = new Date(ms).getDay();
  return day === 0 ? 7 : day;
}

/**
 * The visible span for a view.
 *
 * Agenda shows a month at a time rather than the whole year: an unbounded
 * range would read every entry ever written on every keystroke of the search
 * box, and paging is cheap.
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
 * A week is walked a day at a time rather than by adding seven times
 * 86_400_000: across a daylight-saving change that offset lands an hour early
 * and eventually a whole day out.
 */
function shift(view: View, anchor: number, by: number): number {
  if (view !== "week") {
    const d = new Date(anchor);
    return startOfDay(new Date(d.getFullYear(), d.getMonth() + by, 1).getTime());
  }
  let day = startOfIsoWeek(anchor);
  for (let i = 0; i < 7; i += 1) {
    day = by > 0 ? nextDay(day) : previousDay(day);
  }
  return day;
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

function AgendaView({
  from,
  to,
  lessons,
  entries,
  classes,
  locale,
  className,
  searching,
}: {
  from: number;
  to: number;
  lessons: Lesson[];
  entries: DiaryEntry[];
  classes: SchoolClass[];
  locale: string;
  className: (id: string) => string;
  searching: boolean;
}) {
  const { t } = useTranslation();
  // While searching, only the days whose entries matched are worth showing —
  // every lesson of the month would bury the three days being looked for. But
  // those days keep THEIR lessons: dropping lessons wholesale made a matched
  // day read "pas de cours prévu" while the timetable plainly had one, which
  // is the UI stating something false rather than merely showing less.
  const matchedDays = new Set(entries.map((entry) => entry.date));
  const visibleLessons = searching
    ? lessons.filter((lesson) => matchedDays.has(lesson.date))
    : lessons;

  const days = agendaDays(
    from,
    to,
    visibleLessons,
    (lesson) => lesson.date,
    entries,
    (entry) => entry.date,
  );
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
      {days.map((day) => {
        // Which classes get a box on this day: those with a lesson, plus any
        // that already have an entry — a cover class, or a plan written before
        // the timetable knew about it, must not lose its text.
        const withLesson = new Set(day.lessons.map((l) => l.entry.classId));
        const withEntry = new Set(day.entries.map((e) => e.classId));
        const ids = [...new Set([...withLesson, ...withEntry])];

        return (
          <li key={day.date} className="flex flex-col gap-2">
            <h3 className="font-medium text-sm text-text-muted">
              {dayFormat.format(new Date(day.date))}
            </h3>
            {ids.map((id) => {
              const lessonsHere = day.lessons.filter((l) => l.entry.classId === id);
              const entry = day.entries.find((e) => e.classId === id) ?? null;
              return (
                <div
                  key={id}
                  className="paper flex flex-col gap-2 rounded border border-border p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium">{className(id)}</span>
                    {lessonsHere.map((lesson) => (
                      <span key={lesson.entry.id} className="text-sm text-text-muted">
                        {formatTimeRange(lesson.entry.startMinute, lesson.entry.endMinute, locale)}
                        {lesson.entry.room ? ` · ${lesson.entry.room}` : ""}
                      </span>
                    ))}
                    {lessonsHere.length === 0 && (
                      <span className="text-sm text-text-faint">{t("diary.noLesson")}</span>
                    )}
                  </div>
                  <DayEntry
                    // Anchored to the class AND the day: switching either must
                    // reset the draft, never carry one lesson's text onto
                    // another.
                    key={`${id}:${day.date}`}
                    classId={id}
                    date={day.date}
                    entry={entry}
                  />
                </div>
              );
            })}
          </li>
        );
      })}
      {classes.length === 0 && <li className="text-text-muted">{t("diary.empty")}</li>}
    </ul>
  );
}

function GridView({
  days,
  columns,
  lessons,
  entries,
  locale,
  className,
  onPick,
}: {
  days: { date: number; inMonth: boolean }[];
  columns: number;
  lessons: Lesson[];
  entries: DiaryEntry[];
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
          const dayLessons = lessons.filter((l) => l.date === day.date);
          const dayEntries = entries.filter((e) => e.date === day.date);
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
              {dayLessons.map((lesson) => (
                <span key={lesson.entry.id} className="w-full truncate text-[10px] text-text-muted">
                  {className(lesson.entry.classId)}
                </span>
              ))}
              {/* The text does not fit in a cell, so a day carrying an entry
                  is marked rather than quoted. */}
              {dayEntries.length > 0 && (
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
