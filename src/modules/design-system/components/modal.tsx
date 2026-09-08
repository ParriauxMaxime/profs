import { useEffect, useRef } from "react";
import { useEscape } from "../../shared/use-escape";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A panel over the page, and the discipline that makes it one.
 *
 * Not a `<dialog>`: `showModal` is unavailable here for the same reason
 * `window.confirm` is — a blocking browser dialog freezes the automation these
 * pages are verified with — so the discipline is written out. Escape closes,
 * focus moves in on open and returns to whatever opened it, Tab is trapped
 * inside the panel, the backdrop closes on click, body scroll is locked, and a
 * panel kept in the DOM while closed carries `inert` so it never sits silently
 * in the tab order.
 *
 * This is the ONE copy of that list. It was written twice within a day — once
 * for the drawer, once for the creation sheet — and a third for the delete
 * confirm would have made a focus trap the app maintains in triplicate. The
 * `AppDrawer` still has its own and deliberately so: it is the control every
 * lesson goes through, and folding it in is a change that wants its own
 * review rather than a ride along with someone else's screen.
 *
 * `keepMounted` is the difference between the two shapes this serves. A sheet
 * slides, so it has to exist while closed. A confirm dialog appears beside a
 * delete button that may be one row of thirty, so mounting a hidden panel per
 * button is thirty panels the page did not need.
 */
export function Modal({
  open,
  onClose,
  placement = "center",
  keepMounted = false,
  labelledBy,
  returnFocusTo,
  initialFocusTo,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** `"bottom"` rises from the edge; `"center"` sits in the middle. */
  placement?: "bottom" | "center";
  /** Keep the panel in the DOM while closed, for a transition. */
  keepMounted?: boolean;
  /** Id of the element naming this panel. */
  labelledBy?: string;
  /** Focused on close — the control that opened it. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** Focused on open. Defaults to the first focusable element. */
  initialFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEscape(() => {
    if (open) onClose();
  });

  // Focus in on open, back to the opener on close. Without the return, a
  // keyboard user who closes the panel lands at the top of the document and
  // has to tab back through everything.
  //
  // `everOpened` guards the first render: a panel that has never been open has
  // nothing to hand focus back to, and focusing the opener anyway would pull
  // the page to a control the teacher never touched.
  const everOpened = useRef(false);
  useEffect(() => {
    if (open) {
      everOpened.current = true;
      const target =
        initialFocusTo?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
      return;
    }
    if (everOpened.current) returnFocusTo?.current?.focus();
  }, [open, returnFocusTo, initialFocusTo]);

  // The page must not scroll behind an open panel: the content slides away
  // underneath and the teacher loses their place.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Tab must not escape the panel while it is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open && !keepMounted) return null;

  const panelClass =
    placement === "bottom"
      ? `fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-t-xl border-border border-t bg-bg p-4 transition-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`
      : "fixed inset-0 z-50 m-auto flex h-fit max-h-[85vh] w-[min(30rem,92vw)] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-bg p-4 shadow-lg";

  return (
    <>
      {/* The backdrop needs no key handler of its own: Escape already closes
          the panel from anywhere. It is a convenience for pointers, not the
          only way out, so it stays aria-hidden rather than becoming a second
          announced control. */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClass}
        style={
          placement === "bottom"
            ? { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }
            : undefined
        }
        inert={open ? undefined : true}
      >
        {children}
      </div>
    </>
  );
}
