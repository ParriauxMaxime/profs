import type { ScheduleEntry } from "@db";
import { deleteScheduleEntry } from "@db/cascade";
import { useDb } from "@db/provider";
import { formatTimeRange } from "@domain/schedule";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { EntryForm } from "./components/entry-form";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The weekly timetable, declared once.
 *
 * Seven day columns on a wide screen, a stacked list below it. Saturday and
 * Sunday are shown only when something is on them — a French secondary
 * timetable rarely uses them, and two permanently empty columns squeeze the
 * five that matter.
 */
export function SchedulePage() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  // Held as an entry id or the string "new", never an index into the list.
  const [editing, setEditing] = useState<string | null>(null);
  const termStart = readTermStart();

  const data = useLiveQuery(async () => {
    const [entries, classes, subjects, gradebooks] = await Promise.all([
      db.scheduleEntries.toArray(),
      db.classes.toArray(),
      db.subjects.toArray(),
      db.gradebooks.toArray(),
    ]);
    return { entries, classes, subjects, gradebooks };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const subjectColor = (id: string | undefined) =>
    id === undefined ? undefined : data.subjects.find((s) => s.id === id)?.color;

  const forDay = (weekday: number): ScheduleEntry[] =>
    data.entries
      .filter((entry) => entry.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);

  // Weekend columns only earn their space when they hold something.
  const days = WEEKDAYS.filter((day) => day <= 5 || forDay(day).length > 0);

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
          gradebooks={data.gradebooks}
          siblings={data.entries}
          onDone={() => setEditing(null)}
        />
      )}

      {data.entries.length === 0 && data.classes.length > 0 ? (
        <p className="text-text-muted">{t("schedule.empty")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {days.map((day) => (
            <section key={day} className="flex flex-col gap-2">
              <h3 className="font-medium text-sm text-text-muted">{t(`schedule.day.${day}`)}</h3>
              {forDay(day).length === 0 ? (
                <p className="text-sm text-text-faint">{t("schedule.dayEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {forDay(day).map((entry) => (
                    <li
                      key={entry.id}
                      className="paper flex flex-col gap-1 rounded border border-border p-2"
                      style={{
                        borderLeft: `4px solid ${subjectColor(entry.subjectId) ?? "transparent"}`,
                      }}
                    >
                      <span className="font-medium text-sm">
                        {formatTimeRange(entry.startMinute, entry.endMinute, i18n.language)}
                      </span>
                      <span className="text-sm">{className(entry.classId)}</span>
                      <span className="flex flex-wrap items-center gap-1 text-text-muted text-xs">
                        {entry.weekCycle !== "all" && (
                          <span className="rounded bg-bg-hover px-1">
                            {t(`schedule.cycleLabel.${entry.weekCycle}`)}
                          </span>
                        )}
                        {entry.room}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setEditing(entry.id)}
                        >
                          {t("common.edit")}
                        </button>
                        <ConfirmButton
                          // Keyed by entry id: without this, the armed delete
                          // would retarget onto whoever now sits at that
                          // position if the list reorders underneath it.
                          key={entry.id}
                          variant="link"
                          label={t("common.delete")}
                          confirmLabel={t("schedule.confirmDelete")}
                          onConfirm={() => deleteScheduleEntry(db, entry.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
