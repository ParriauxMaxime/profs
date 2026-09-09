import { deleteScheduleEntry } from "@db/cascade";
import { useDb } from "@db/provider";
import { isoWeekday } from "@domain/schedule";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useRoomNames } from "../rooms/use-room-names";
import { useMediaQuery } from "../shared/use-media-query";
import { EntryForm } from "./components/entry-form";
import { type GridLesson, TimeGrid } from "./components/time-grid";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The weekly timetable, drawn as hours.
 *
 * The stack of cards this replaced could say what was on Monday and nothing
 * else: every lesson was the same size, so a free morning and a solid one
 * looked alike, and a teacher checking whether Thursday was survivable had to
 * read times off nine cards and do the arithmetic. Hours of fixed height make
 * that shape visible without reading anything.
 *
 * Saturday and Sunday earn a column only when something is on them, as before
 * — a French secondary timetable rarely uses them, and two permanently empty
 * columns squeeze the five that matter.
 *
 * Below `lg` the same grid draws ONE day, chosen with the picker above it.
 * Five columns on a phone are five columns of nothing legible, and a
 * horizontally scrolling week hides the very shape the grid exists to show.
 */
export function SchedulePage() {
  const { t } = useTranslation();
  const db = useDb();
  const roomNames = useRoomNames();
  // Held as an entry id or the string "new", never an index into the list.
  const [editing, setEditing] = useState<string | null>(null);
  // A weekday, which IS its own identity — unlike a position in a list, it
  // cannot come to mean a different day when the entries change.
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const termStart = readTermStart();
  const wide = useMediaQuery("(min-width: 1024px)");

  const data = useLiveQuery(async () => {
    const [entries, classes, subjects] = await Promise.all([
      db.scheduleEntries.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
    ]);
    return { entries, classes, subjects };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const subjectColor = (id: string | undefined) =>
    id === undefined ? undefined : data.subjects.find((s) => s.id === id)?.color;

  // Resolved to text here rather than in the grid: a class name and a salle
  // name are two live queries away from a row, and the grid draws.
  const lessons: GridLesson[] = data.entries.map((entry) => ({
    id: entry.id,
    weekday: entry.weekday,
    startMinute: entry.startMinute,
    endMinute: entry.endMinute,
    title: className(entry.classId),
    ...(roomNames.get(entry.roomId ?? "") ? { room: roomNames.get(entry.roomId ?? "") } : {}),
    ...(entry.weekCycle !== "all" ? { cycle: t(`schedule.cycleShort.${entry.weekCycle}`) } : {}),
    ...(subjectColor(entry.subjectId) ? { color: subjectColor(entry.subjectId) } : {}),
  }));

  // Weekend columns only earn their space when they hold something.
  const days: number[] = WEEKDAYS.filter(
    (day) => day <= 5 || lessons.some((lesson) => lesson.weekday === day),
  );

  // Today when today is drawn, else the first day of the week. Re-derived
  // rather than stored, so a weekend column disappearing cannot strand the
  // picker on a day that is no longer there.
  const today = isoWeekday(Date.now());
  const shownDay =
    pickedDay !== null && days.includes(pickedDay)
      ? pickedDay
      : days.includes(today)
        ? today
        : (days[0] ?? 1);

  const editingEntry =
    editing === null || editing === "new"
      ? null
      : (data.entries.find((entry) => entry.id === editing) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("schedule.title")}</h2>
        {data.classes.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            {t("schedule.addEntry")}
          </button>
        )}
      </div>

      {/* A/B weeks are computed from the term start. Without it the editor
          still works — a teacher can declare their week — but nothing on an
          alternating cycle can ever be shown, so say so here rather than
          letting Today look broken. */}
      {termStart === null && data.entries.some((e) => e.weekCycle !== "all") && (
        <p className="text-sm text-text-muted">
          {t("schedule.needsTermStart")}{" "}
          <Link to={Router.Settings()} className="underline">
            {t("nav.settings")}
          </Link>
        </p>
      )}

      {data.classes.length === 0 && (
        <p className="text-text-muted">
          {t("schedule.needsClass")}{" "}
          <Link to={Router.Classes()} className="underline">
            {t("nav.classes")}
          </Link>
        </p>
      )}

      {editing !== null && (
        <EntryForm
          // Keyed on the entry's identity: switching which lesson is being
          // edited must reset the draft, not carry one lesson's times onto
          // another.
          key={editing}
          entry={editingEntry}
          classes={data.classes}
          subjects={data.subjects}
          siblings={data.entries}
          onDelete={
            editingEntry === null
              ? undefined
              : async () => {
                  await deleteScheduleEntry(db, editingEntry.id);
                  setEditing(null);
                }
          }
          onDone={() => setEditing(null)}
        />
      )}

      {data.entries.length === 0 && data.classes.length > 0 && (
        <p className="text-text-muted">{t("schedule.empty")}</p>
      )}

      {/* The picker is the phone's day columns, collapsed to a row of
          buttons. On a wide screen every day is drawn, so it would be a
          control that changes nothing. */}
      {!wide && (
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">{t("schedule.pickDay")}</legend>
          {days.map((day) => (
            <button
              key={day}
              type="button"
              className={`btn btn-sm ${day === shownDay ? "btn-primary" : ""}`}
              aria-pressed={day === shownDay}
              onClick={() => setPickedDay(day)}
            >
              {t(`schedule.dayShort.${day}`)}
            </button>
          ))}
        </fieldset>
      )}

      <TimeGrid
        days={wide ? days : [shownDay]}
        lessons={lessons}
        selectedId={editingEntry?.id ?? null}
        onSelect={setEditing}
      />
    </div>
  );
}
