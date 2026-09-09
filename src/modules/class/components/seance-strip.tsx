import { deleteSession } from "@db/cascade";
import { useDb } from "@db/provider";
import { startOfDay } from "@db/sessions";
import { minutesToHm } from "@domain/schedule";
import type { Slot } from "@domain/seance";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

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
   * True only once this lesson is already recorded and no séance sits at the
   * current clock hour — starting then would only reuse a row already
   * reachable from the strip. A button that cannot do anything is worse than
   * no button.
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
    if (slot.startsAt === null) return t("seance.unscheduled");
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
              key={`${slot.date}-${slot.startsAt ?? "x"}`}
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
