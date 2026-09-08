import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./modal";

/**
 * A sheet that rises from the bottom of the screen.
 *
 * Bottom rather than side because what it carries is a row of layout
 * thumbnails: a side panel is a tall narrow column, which stacks five previews
 * into a list long enough to scroll on the device this app is used on.
 *
 * The panel stays mounted while closed, for the slide and for `inert`.
 * Anything it holds in state therefore survives a close — a form inside it
 * must reset itself when `open` turns true rather than trusting a remount.
 *
 * Everything a modal owes the keyboard lives in `Modal`.
 */
export function Sheet({
  open,
  onClose,
  title,
  returnFocusTo,
  initialFocusTo,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Focused when the sheet closes — the control that opened it. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
  /** Focused when the sheet opens. Defaults to the first focusable element. */
  initialFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="bottom"
      keepMounted
      labelledBy={titleId}
      returnFocusTo={returnFocusTo}
      initialFocusTo={initialFocusTo}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="m-0 font-semibold text-lg">
          {title}
        </h3>
        <button type="button" className="btn" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      {children}
    </Modal>
  );
}
