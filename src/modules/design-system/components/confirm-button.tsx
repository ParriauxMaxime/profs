import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The two-step in-place confirm, in one place.
 *
 * `window.confirm` is banned here (it freezes the browser automation used to
 * verify these pages), so every destructive action arms on the first click and
 * fires on the second, with a cancel beside it. That pattern was hand-rolled in
 * four spots with four slightly different sets of classes; this is the same
 * behaviour, once.
 *
 * Arming is internal by default. Pass `armed` (with `onArmedChange`) when
 * something outside the button decides it is armed — the backup import is
 * armed by choosing a file, not by clicking. In that controlled case `label`
 * may be omitted, since the idle state never renders.
 */
export function ConfirmButton({
  label,
  confirmLabel,
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
  /** The armed button's text — say what is about to happen, cascade included. */
  confirmLabel: string;
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
  const confirmClass = variant === "link" ? "text-danger" : "btn btn-danger";
  const cancelClass = variant === "link" ? "text-text-muted" : "btn";

  if (!isArmed) {
    return (
      <button
        type="button"
        className={className ? `${idleClass} ${className}` : idleClass}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className={confirmClass}
        onClick={() => {
          // Only the self-armed case disarms here: when arming is controlled,
          // `onArmedChange(false)` is the parent's cancel, and confirming must
          // not trip it. The parent disarms by reacting to `onConfirm`.
          if (!isControlled) setSelfArmed(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className={cancelClass} onClick={() => setArmed(false)}>
        {cancelLabel ?? t("common.cancel")}
      </button>
    </>
  );
}
