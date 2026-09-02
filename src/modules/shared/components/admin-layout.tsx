import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppDrawer } from "./app-drawer";

/**
 * The whole chrome of the app: one floating button, one drawer.
 *
 * The top bar it replaced carried two destinations and cost a row of vertical
 * space on every screen. A teacher mid-lesson holds the device in one hand,
 * so the one control that is always present sits under the thumb rather than
 * spanning the top.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-screen">
      <button
        ref={buttonRef}
        type="button"
        className="btn fixed top-0 left-0 z-30 m-2 flex items-center justify-center"
        // 44px is the live-entry tap floor, and the safe-area inset clears a
        // notch on an iPhone held in portrait.
        style={{
          minWidth: "var(--control-min)",
          minHeight: "var(--control-min)",
          marginTop: "max(0.5rem, env(safe-area-inset-top))",
        }}
        aria-label={t("nav.openMenu")}
        aria-expanded={menuOpen}
        aria-controls="app-drawer"
        onClick={() => setMenuOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>

      <AppDrawer open={menuOpen} onClose={() => setMenuOpen(false)} returnFocusTo={buttonRef} />

      {/* The button floats over the content, so every page is pushed clear of
          it — including the safe-area inset, or the first heading hides under
          a notch. */}
      <main
        className="mx-auto max-w-6xl p-4"
        style={{
          paddingTop: "calc(max(0.5rem, env(safe-area-inset-top)) + var(--control-min) + 1rem)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
