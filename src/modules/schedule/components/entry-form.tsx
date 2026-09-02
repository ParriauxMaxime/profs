import type { Gradebook, ScheduleEntry, SchoolClass, Subject } from "@db";
import { useDb } from "@db/provider";
import { saveScheduleEntry } from "@db/schedule";
import { hmToMinutes, minutesToHm, overlaps, WEEK_CYCLES, type WeekCycle } from "@domain/schedule";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

/** `HH:MM` for an `<input type="time">`. */
function toTimeValue(minutes: number): string {
  const { hours, minutes: mins } = minutesToHm(minutes);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** `HH:MM` back to minutes. Returns null for anything else. */
function fromTimeValue(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hmToMinutes(hours, mins);
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Create or edit one recurring lesson.
 *
 * Keyed by the caller on the entry id, so switching which entry is being
 * edited resets the draft rather than carrying one lesson's times onto
 * another — the bug this codebase has produced in five disguises.
 */
export function EntryForm({
  entry,
  classes,
  subjects,
  gradebooks,
  siblings,
  onDone,
}: {
  entry: ScheduleEntry | null;
  classes: SchoolClass[];
  subjects: Subject[];
  gradebooks: Gradebook[];
  /** Every other entry, for the overlap warning. */
  siblings: ScheduleEntry[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();

  const [classId, setClassId] = useState(entry?.classId ?? classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(entry?.subjectId ?? "");
  const [gradebookId, setGradebookId] = useState(entry?.gradebookId ?? "");
  const [weekday, setWeekday] = useState(entry?.weekday ?? 1);
  const [start, setStart] = useState(toTimeValue(entry?.startMinute ?? 8 * 60));
  const [end, setEnd] = useState(toTimeValue(entry?.endMinute ?? 9 * 60));
  const [weekCycle, setWeekCycle] = useState<WeekCycle>(entry?.weekCycle ?? "all");
  const [room, setRoom] = useState(entry?.room ?? "");
  const [error, setError] = useState<string | null>(null);

  useEscape(onDone);

  const startMinute = fromTimeValue(start);
  const endMinute = fromTimeValue(end);

  // Only gradebooks of the chosen class can be attached — offering another
  // class's grid would let a lesson open onto the wrong pupils.
  const classGradebooks = gradebooks.filter((g) => g.classId === classId);

  // Computed on every render rather than on submit: a teacher deserves to see
  // the clash while they are still choosing the time, not after saving.
  const clashes =
    startMinute !== null && endMinute !== null && endMinute > startMinute
      ? siblings.filter(
          (other) =>
            other.id !== entry?.id &&
            other.classId === classId &&
            overlaps({ weekday, startMinute, endMinute, weekCycle }, other),
        )
      : [];

  async function save(): Promise<void> {
    if (startMinute === null || endMinute === null) {
      setError(t("schedule.badTime"));
      return;
    }
    const result = await saveScheduleEntry(db, {
      ...(entry ? { id: entry.id } : {}),
      classId,
      ...(subjectId ? { subjectId } : {}),
      ...(gradebookId ? { gradebookId } : {}),
      weekday,
      startMinute,
      endMinute,
      weekCycle,
      room,
    });
    if (!result.saved) {
      setError(
        result.reason === "invalid-range" ? t("schedule.endBeforeStart") : t("schedule.badWeekday"),
      );
      return;
    }
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          {t("schedule.class")}
          <select
            className="field"
            // The first field of the form takes focus, so a teacher adding
            // several lessons never reaches for the pointer between them.
            // biome-ignore lint/a11y/noAutofocus: the form opens on demand.
            autoFocus
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              // The attached gradebook belonged to the old class.
              setGradebookId("");
            }}
          >
            {classes.map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.subject")}
          <select
            className="field"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">{t("schedule.noSubject")}</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.gradebook")}
          <select
            className="field"
            value={gradebookId}
            onChange={(e) => setGradebookId(e.target.value)}
          >
            <option value="">{t("schedule.noGradebook")}</option>
            {classGradebooks.map((gradebook) => (
              <option key={gradebook.id} value={gradebook.id}>
                {gradebook.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.weekday")}
          <select
            className="field"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {t(`schedule.day.${day}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.start")}
          <input
            type="time"
            className="field"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.end")}
          <input
            type="time"
            className="field"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.cycle")}
          <select
            className="field"
            value={weekCycle}
            onChange={(e) => setWeekCycle(e.target.value as WeekCycle)}
          >
            {WEEK_CYCLES.map((cycle) => (
              <option key={cycle} value={cycle}>
                {t(`schedule.cycleLabel.${cycle}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          {t("schedule.room")}
          <input
            className="field"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder={t("schedule.roomPlaceholder")}
          />
        </label>
      </div>

      {/* A warning, never a refusal: a teacher may legitimately have two
          things at once, and this app does not know their week better than
          they do. Saying WHICH lesson it clashes with is the whole value —
          "attention, chevauchement" alone would just be noise. */}
      {clashes.length > 0 && (
        <p className="text-sm text-warning" role="status">
          {t("schedule.overlapWarning", {
            lessons: clashes
              .map((c) => `${t(`schedule.day.${c.weekday}`)} ${toTimeValue(c.startMinute)}`)
              .join(", "),
          })}
        </p>
      )}

      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
