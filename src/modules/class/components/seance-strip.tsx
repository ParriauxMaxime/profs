import { deleteSession } from "@db/cascade";
import { useDb } from "@db/provider";
import { minutesToHm } from "@domain/schedule";
import type { Slot } from "@domain/seance";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * Which lesson is on screen, and the ones either side of it.
 *
 * It states the day rather than offering a list: the séance is resolved from
 * the URL, from the clock, or from the last one taught, and the strip exists
 * so the neighbours are one tap away — not so a teacher has to choose before
 * they can take the register. That was the `<select>` this replaces.
 *
 * Nothing here writes on its own. A slot with no `sessionId` is a lesson the
 * timetable predicts and nobody has recorded yet, and tapping it only changes
 * which lesson is on screen — the séance row appears on the first mark, the
 * first behaviour event, the first character of note, or "Commencer une
 * séance", never on arrival.
 */
export function SeanceStrip({
  slots,
  current,
  className,
  onSelect,
  onStart,
}: {
  /** The neighbouring slots, earliest first, current one included. */
  slots: Slot[];
  current: Slot | null;
  className?: string;
  onSelect: (slot: Slot) => void;
  onStart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });
  const shortFormat = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" });

  const label = (slot: Slot): string => {
    if (slot.startsAt === null) return t("seance.unscheduled");
    const { hours, minutes } = minutesToHm(slot.startsAt);
    return t("seance.at", { hours, minutes: String(minutes).padStart(2, "0") });
  };

  const currentSessionId = current?.sessionId ?? null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="font-semibold">
        {current === null ? t("seance.none") : dayFormat.format(current.date)}
      </span>

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
              className={`btn h-9 min-h-9 ${isCurrent ? "border-accent text-accent" : ""}`}
              onClick={() => onSelect(slot)}
            >
              {slot.date === current?.date
                ? label(slot)
                : `${shortFormat.format(slot.date)} ${label(slot)}`}
            </button>
          );
        })}
      </div>

      <button type="button" className="btn" onClick={onStart}>
        {t("seance.start")}
      </button>

      {/* Deleting cascades the register and the behaviour with it, so it sits
          behind a confirm rather than under a thumb operating this page
          one-handed with a class in front of it. */}
      {current !== null && currentSessionId !== null ? (
        <ConfirmButton
          // Keyed by séance id: an armed delete must not survive onto the
          // neighbour when the teacher taps another lesson in the strip.
          key={currentSessionId}
          variant="link"
          label={t("seance.delete")}
          confirmLabel={t("seance.confirmDelete", { day: dayFormat.format(current.date) })}
          body={t("seance.confirmDeleteBody")}
          onConfirm={() => deleteSession(db, currentSessionId)}
        />
      ) : null}
    </div>
  );
}
