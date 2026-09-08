import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./modal";

/**
 * Every destructive action in the app, and the dialog that asks first.
 *
 * `window.confirm` is banned here — it freezes the browser automation these
 * pages are verified with — so this is a dialog the app draws itself, with the
 * keyboard discipline `Modal` owns.
 *
 * It used to arm IN PLACE: the button replaced itself with a longer confirm
 * button plus a cancel. That moved everything around it at the moment of the
 * decision — in a table row it reflowed the row, and on the salle editor it
 * pushed the toolbar — and the sentence explaining the cascade had to fit
 * inside a button. A dialog can state the consequence in prose, and the page
 * behind it does not move.
 *
 * The idle button stays mounted behind the dialog rather than being replaced,
 * which is what gives focus somewhere to return to and keeps the layout still.
 *
 * Arming is internal by default. Pass `armed` (with `onArmedChange`) when
 * something outside decides it — the backup import is armed by choosing a
 * file, not by clicking. In that controlled case `label` may be omitted, since
 * there is no idle button to render.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  body,
  cancelLabel,
  onConfirm,
  danger = false,
  variant = "button",
  className,
  armed,
  onArmedChange,
}: {
  /** The idle button's text. Optional only when the button is never idle. */
  label?: string;
  /** The dialog's heading: the question being asked. */
  confirmLabel: string;
  /** What else goes with it, in prose. Omit when there is no cascade to name. */
  body?: string;
  /** Defaults to the shared "Annuler". */
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /** Red idle and confirm buttons, for a destructive action. */
  danger?: boolean;
  /** `"link"` renders bare text instead of `.btn`, for dense table headers. */
  variant?: "button" | "link";
  /** Extra classes on the idle button only. */
  className?: string;
  /** Controlled arming. Omit to let the button arm itself. */
  armed?: boolean;
  onArmedChange?: (armed: boolean) => void;
}) {
  const { t } = useTranslation();
  const [selfArmed, setSelfArmed] = useState(false);
  const idleRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  const isControlled = armed !== undefined;
  const isArmed = isControlled ? armed : selfArmed;

  const setArmed = (next: boolean): void => {
    if (!isControlled) setSelfArmed(next);
    onArmedChange?.(next);
  };

  const idleClass =
    variant === "link"
      ? danger
        ? "text-danger hover:underline"
        : "text-text-muted hover:text-accent"
      : danger
        ? "btn btn-danger"
        : "btn";

  return (
    <>
      {label === undefined ? null : (
        <button
          ref={idleRef}
          type="button"
          className={className ? `${idleClass} ${className}` : idleClass}
          onClick={() => setArmed(true)}
        >
          {label}
        </button>
      )}

      <Modal
        open={isArmed}
        onClose={() => setArmed(false)}
        labelledBy={messageId}
        returnFocusTo={idleRef}
        // Cancel takes the focus, not the destructive action: a dialog that
        // opens with "Supprimer" under the return key is a dialog that deletes
        // on a stray keystroke.
        initialFocusTo={cancelRef}
      >
        <div className="flex flex-col gap-2">
          <h2 id={messageId} className="m-0 font-semibold text-[17px]">
            {confirmLabel}
          </h2>
          {/* The consequence, in prose. It used to have to fit inside the
              armed button, which is why every cascade was once a dash and a
              clause. */}
          {body === undefined ? null : <p className="m-0 text-sm text-text-muted">{body}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" className="btn" onClick={() => setArmed(false)}>
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            onClick={() => {
              // Only the self-armed case disarms here: when arming is
              // controlled, `onArmedChange(false)` is the parent's cancel, and
              // confirming must not trip it. The parent disarms by reacting to
              // `onConfirm`.
              if (!isControlled) setSelfArmed(false);
              void onConfirm();
            }}
          >
            {label ?? t("common.confirm")}
          </button>
        </div>
      </Modal>
    </>
  );
}
