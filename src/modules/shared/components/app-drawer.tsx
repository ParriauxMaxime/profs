import { Link } from "@swan-io/chicane";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { useEscape } from "../use-escape";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface Destination {
  key: string;
  to: string;
  label: string;
}

/**
 * The left drawer, and the only navigation in the app.
 *
 * Not a `<dialog>`, but it takes a dialog's discipline: Escape closes it,
 * focus moves in on open and returns to the button on close, focus is trapped
 * while it is open, and the backdrop closes on click. Blocking browser
 * dialogs stay banned — they freeze the automation these pages are verified
 * with — so the trap is written out rather than delegated to `showModal`.
 */
export function AppDrawer({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEscape(() => {
    if (open) onClose();
  });

  // Focus in on open, back to the hamburger on close. Without the return, a
  // keyboard user who closes the drawer lands at the top of the document and
  // has to tab back through everything.
  useEffect(() => {
    if (open) {
      firstLinkRef.current?.focus();
      return;
    }
    returnFocusTo.current?.focus();
  }, [open, returnFocusTo]);

  // The body must not scroll behind an open drawer: on a phone the content
  // slides away under the panel and the teacher loses their place.
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
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
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

  const destinations: Destination[] = [
    { key: "today", to: Router.Home(), label: t("nav.today") },
    { key: "classes", to: Router.Classes(), label: t("nav.classes") },
    { key: "gradebooks", to: Router.Gradebooks(), label: t("nav.gradebooks") },
    { key: "students", to: Router.Students(), label: t("nav.students") },
    { key: "schedule", to: Router.Schedule(), label: t("nav.schedule") },
    { key: "diary", to: Router.Diary(), label: t("nav.diary") },
    { key: "settings", to: Router.Settings(), label: t("nav.settings") },
  ];

  return (
    <>
      {/* The backdrop needs no key handler of its own: Escape already closes
          the drawer from anywhere. It is a convenience for pointers, not the
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
        id="app-drawer"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-1 border-border border-r bg-bg p-3 transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        // Hidden from assistive tech AND from the tab order when closed:
        // a translated-off panel is still focusable without this.
        inert={open ? undefined : true}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="font-bold text-lg">{t("app.name")}</span>
          <button type="button" className="btn" onClick={onClose}>
            {t("nav.closeMenu")}
          </button>
        </div>

        {/* Above the destinations, not inside the <nav>: which école is open
            changes what every destination below shows, and it is not itself
            a destination. Its buttons join the focus trap by being in the
            panel — the trap queries the panel, not the nav. */}
        <WorkspaceSwitcher onSwitch={onClose} />

        <nav className="flex flex-col gap-1" aria-label={t("nav.menu")}>
          {destinations.map((destination, index) => (
            <Link
              key={destination.key}
              ref={index === 0 ? firstLinkRef : undefined}
              to={destination.to}
              onClick={onClose}
              className="rounded px-3 py-3 font-medium text-text-muted hover:bg-bg-hover hover:text-text"
              activeClassName="bg-bg-hover text-text"
              // Chicane sets activeClassName on an exact match; aria-current
              // has to be told separately or a screen reader never learns
              // which destination is the current one.
              aria-current={
                destination.to === window.location.pathname ||
                (destination.key === "today" && window.location.pathname === Router.Home())
                  ? "page"
                  : undefined
              }
            >
              {destination.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
