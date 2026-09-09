import { deleteSession } from "@db/cascade";
import type { AppDatabase } from "@db/index";
import { useDb } from "@db/provider";
import { setSessionTimes, startOfDay } from "@db/sessions";
import { formatTimeRange, hmToMinutes, minutesToHm } from "@domain/schedule";
import type { Slot } from "@domain/seance";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

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

/**
 * Correct a séance's times — including the ones the v16 backfill guessed at.
 *
 * Keyed by the caller on the séance id, so tapping a different lesson in the
 * strip resets the draft rather than carrying one séance's times onto
 * another — the bug this codebase has produced in five disguises.
 *
 * Save is disabled rather than clamping or swapping when the end does not
 * follow the start: the same posture `parseGradeValue` takes for a bad mark —
 * refuse, leave the existing value standing, keep the bad input visible for
 * correction.
 */
function SeanceTimeEditor({
  db,
  sessionId,
  current,
}: {
  db: AppDatabase;
  sessionId: string;
  current: Slot;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState(toTimeValue(current.startsAt));
  const [draftEnd, setDraftEnd] = useState(toTimeValue(current.endsAt));

  if (!editing) {
    return (
      <button type="button" className="btn" onClick={() => setEditing(true)}>
        {t("seance.editTimes")}
      </button>
    );
  }

  const startMinutes = fromTimeValue(draftStart);
  const endMinutes = fromTimeValue(draftEnd);
  const invalid = startMinutes === null || endMinutes === null || endMinutes <= startMinutes;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">
        <span className="sr-only">{t("seance.startsAt")}</span>
        <input
          type="time"
          className="field"
          value={draftStart}
          onChange={(e) => setDraftStart(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-1">
        <span className="sr-only">{t("seance.endsAt")}</span>
        <input
          type="time"
          className="field"
          value={draftEnd}
          onChange={(e) => setDraftEnd(e.target.value)}
        />
      </label>
      {invalid ? <span className="text-danger text-sm">{t("seance.timesInvalid")}</span> : null}
      <button
        type="button"
        className="btn"
        disabled={invalid}
        onClick={async () => {
          if (startMinutes === null || endMinutes === null) return;
          await setSessionTimes(db, sessionId, { startsAt: startMinutes, endsAt: endMinutes });
          setDraftStart(toTimeValue(startMinutes));
          setDraftEnd(toTimeValue(endMinutes));
          setEditing(false);
        }}
      >
        {t("common.save")}
      </button>
      <button type="button" className="btn" onClick={() => setEditing(false)}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

/**
 * Which day is on screen, and which of that day's lessons.
 *
 * Two controls, because they are two questions. The strip used to answer both
 * in one row — the day's slots PLUS one slot from the nearest lesson either
 * side, all styled alike — so `7 sept. 8h00 | 10h00 | 10 sept. 14h00` put
 * three days in one list and marked none of them as a different day.
 *
 * The day is a menu again, and the objection that removed the last one does
 * not apply to this one. **That select gated the register**: nothing resolved
 * until the teacher chose. This one does not — `defaultDay` still resolves the
 * day from the URL, from the clock, or from the last one taught, and the page
 * opens on it ready to mark. The menu is how you LEAVE a day, never how you
 * arrive at one. If that ever stops being true, bring the strip back, because
 * the objection will have become true again.
 *
 * Nothing here writes on its own. A slot with no `sessionId` is a lesson the
 * timetable predicts and nobody has recorded yet, and tapping it only changes
 * which lesson is on screen — the séance row appears on the first mark, the
 * first behaviour event, the first character of note, or "Commencer une
 * séance", never on arrival.
 */
export function SeanceStrip({
  days,
  slots,
  current,
  canStart,
  className,
  onSelectDay,
  onSelect,
  onStart,
}: {
  /** Days offering a lesson, oldest first, always including the one on screen. */
  days: number[];
  /** THIS day's slots, earliest first. */
  slots: Slot[];
  current: Slot | null;
  /**
   * True when this lesson has no séance yet — starting makes it real — or
   * when it already does but no séance sits at the current clock hour, so an
   * extra one there would be new rather than a row already reachable from the
   * strip. A button that cannot do anything is worse than no button.
   */
  canStart: boolean;
  className?: string;
  onSelectDay: (day: number) => void;
  onSelect: (slot: Slot) => void;
  onStart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  const label = (slot: Slot): string => {
    const { hours, minutes } = minutesToHm(slot.startsAt);
    // Both forms of the hour, because padding it is a LANGUAGE decision and
    // belongs in the locale file: French writes 8h00 and English 08:00. The
    // minutes are padded in both, so they need only one form.
    return t("seance.at", {
      hours,
      hoursPadded: String(hours).padStart(2, "0"),
      minutes: String(minutes).padStart(2, "0"),
    });
  };

  const currentSessionId = current?.sessionId ?? null;

  const today = startOfDay(Date.now());
  // The day on screen, or — with no slot at all — whatever the caller listed
  // last, so the select never shows a value absent from its own options.
  const selectedDay = current?.date ?? days[days.length - 1] ?? today;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <label className="sr-only" htmlFor="seance-day">
        {t("seance.day")}
      </label>
      <select
        id="seance-day"
        className="field"
        style={{ width: "auto" }}
        value={selectedDay}
        onChange={(e) => onSelectDay(Number(e.target.value))}
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {dayFormat.format(day)}
            {day === today ? ` — ${t("seance.today")}` : ""}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1">
        {slots.map((slot) => {
          const isCurrent =
            current !== null && slot.date === current.date && slot.startsAt === current.startsAt;
          return (
            <button
              // Anchored to the slot's day and time, never to its position in
              // the strip: the list reorders as séances are created.
              key={`${slot.date}-${slot.startsAt}`}
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              // No height override: these are tapped mid-lesson, so they keep
              // the 44px floor `.btn` carries. The old `h-9` put them under it.
              className={`btn ${isCurrent ? "border-accent text-accent" : ""}`}
              onClick={() => onSelect(slot)}
            >
              {label(slot)}
            </button>
          );
        })}
      </div>

      {canStart && (
        <button type="button" className="btn" onClick={onStart}>
          {t("seance.start")}
        </button>
      )}

      <span className="flex-1" />

      {current !== null && currentSessionId !== null ? (
        <span className="text-sm text-text-muted tabular-nums">
          {formatTimeRange(current.startsAt, current.endsAt, i18n.language)}
        </span>
      ) : null}

      {current !== null && currentSessionId !== null ? (
        // Keyed by séance id: a draft must never carry one lesson's times
        // onto another when the teacher taps a different one in the strip.
        <SeanceTimeEditor
          key={`edit-times-${currentSessionId}`}
          db={db}
          sessionId={currentSessionId}
          current={current}
        />
      ) : null}

      {/* Deleting cascades the register and the behaviour with it, so it sits
          behind a confirm rather than under a thumb operating this page
          one-handed with a class in front of it. */}
      {current !== null && currentSessionId !== null ? (
        <ConfirmButton
          // Keyed by séance id: an armed delete must not survive onto the
          // neighbour when the teacher taps another lesson in the strip.
          key={currentSessionId}
          variant="link"
          danger
          label={t("common.delete")}
          confirmLabel={t("seance.confirmDelete", { day: dayFormat.format(current.date) })}
          body={t("seance.confirmDeleteBody")}
          onConfirm={() => deleteSession(db, currentSessionId)}
        />
      ) : null}
    </div>
  );
}
