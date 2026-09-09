import { useTranslation } from "react-i18next";
import { useInstallPrompt } from "../use-install-prompt";

/**
 * The invitation to install, on the one surface that gets it: Aujourd'hui.
 *
 * It sits at the BOTTOM of the front door, below the day's lessons, because a
 * teacher opening the app mid-morning came for the next hour and not for
 * this. It is a card like the rest of the page rather than a banner pinned to
 * an edge, and it is not — and must never become — a dialog: blocking dialogs
 * are banned repo-wide, and one that interrupted the walk to a lesson would
 * be the single most annoying thing in the app.
 *
 * `useInstallPrompt` returns "none" for an already-installed app, for a
 * dismissal, and for every browser that can neither install nor be told how,
 * so this renders nothing far more often than it renders.
 *
 * There is no second entry point in Réglages, and that is a decision rather
 * than an omission: once dismissed the invitation is gone for good on this
 * device, and the way back is the browser's own install control, which every
 * browser that could have shown the button already has in its menu. A
 * permanent copy in settings would be a second way to do one thing.
 */
export function InstallInvitation() {
  const { t } = useTranslation();
  const { offer, install, dismiss } = useInstallPrompt();

  if (offer === "none") return null;

  return (
    // Deliberately NOT `.paper`. That class is a sheet of copie and every card
    // above this one on Aujourd'hui is a lesson; giving the invitation the
    // same marge would make it read as a fourth thing in the teacher's day.
    // It is interface, so it stays a quiet box.
    <aside className="flex flex-col gap-2 rounded border border-border bg-bg-subtle p-3">
      <p className="font-medium">{t("install.title")}</p>
      <p className="text-sm text-text-muted">{t("install.body")}</p>
      {/* iOS Safari fires no install event, so the only honest thing to do is
          name the two taps. The share sheet is Safari's, not ours. */}
      {offer === "ios" && <p className="text-sm">{t("install.iosSteps")}</p>}
      <div className="flex flex-wrap gap-2">
        {offer === "prompt" && (
          <button type="button" className="btn btn-primary" onClick={install}>
            {t("install.action")}
          </button>
        )}
        <button type="button" className="btn" onClick={dismiss}>
          {t("install.dismiss")}
        </button>
      </div>
    </aside>
  );
}
