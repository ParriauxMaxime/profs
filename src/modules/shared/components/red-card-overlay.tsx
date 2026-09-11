import type { Student } from "@db";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";
import { useEscape } from "../use-escape";
import { useMediaQuery } from "../use-media-query";

/** Long enough to be seen from across a room, short enough not to be waited on. */
const DWELL_MS = 2500;

/**
 * The moment a run of avertissements becomes a carton rouge.
 *
 * NOT a `<dialog>`, and not any blocking browser dialog — those are banned
 * here, and they freeze the automation these screens are verified with. It is
 * an ordinary fixed element above everything, and it leaves ON ITS OWN: a
 * teacher mid-lesson never has to find a button, and a tablet cannot be left
 * sitting on a red card instead of on the register.
 *
 * There is deliberately no *Annuler* on it. The moment after a mis-tap is
 * exactly when a wrong red is most likely — and the undo already sits one tap
 * away in the pupil card's own event list, where deleting the YELLOW is the
 * honest correction, since the red was never the thing that happened.
 *
 * `role="status"` with a polite live region rather than `alert`: the pupil's
 * name is read out once, and nothing here takes focus.
 */
export function RedCardOverlay({ student, onDone }: { student: Student; onDone: () => void }) {
  const { t } = useTranslation();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEscape(onDone);

  useEffect(() => {
    const timer = window.setTimeout(onDone, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it and it closes itself; the click is a convenience for a finger, and the element is a status region rather than a control.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgb(0 0 0 / 55%)" }}
      role="status"
      aria-live="polite"
      onClick={onDone}
    >
      <div
        className="flex flex-col items-center gap-4 rounded-lg px-10 py-14 text-center"
        style={{
          background: "var(--behaviour-red)",
          color: "var(--on-behaviour-red)",
          minWidth: "min(80vw, 420px)",
          boxShadow: "0 12px 40px rgb(0 0 0 / 45%)",
          animation: reduced
            ? "escalation-fade 240ms ease-out"
            : "escalation-pop 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2)",
        }}
      >
        <span className="font-semibold text-sm uppercase tracking-widest">
          {t("escalation.overlayTitle")}
        </span>
        <span className="font-bold text-3xl">
          <PupilName student={student} />
        </span>
      </div>
    </div>
  );
}
