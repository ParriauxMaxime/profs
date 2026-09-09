/**
 * Whether to invite the teacher to install the app, and how.
 *
 * This app is worth more installed than in a tab: launched from the home
 * screen it opens full screen, it starts without the browser's chrome eating
 * the top of a phone, and — the part that matters mid-lesson — it opens with
 * no network at all. A tab is also where a teacher loses it, and the data is
 * only ever on the device that holds it.
 *
 * The rule that governs the invitation is that it must never nag. It is an
 * ordinary element in the page, never a dialog — `window.confirm` and friends
 * are banned repo-wide — it is dismissible, and the dismissal is permanent on
 * this device. There is exactly one surface that shows it.
 *
 * The decision lives here rather than in the component because it has four
 * inputs and three outcomes, and because it is the kind of logic that is
 * silently wrong: an invitation that renders inside an already-installed app
 * is not a bug anyone reports, it is just embarrassing, and nothing about a
 * component test would catch it.
 */

export const INSTALL_DISMISSED_STORAGE_KEY = "profs-install-dismissed";

export const INSTALL_OFFERS = ["none", "prompt", "ios"] as const;

export type InstallOffer = (typeof INSTALL_OFFERS)[number];

/**
 * Browsers that pretend to be Safari on iOS but cannot add to the home
 * screen. Every iOS browser is WebKit and every one of them says "Safari" in
 * its user agent, so the only reliable test is for the token the wrapper adds
 * — and an in-app webview (a link opened inside Facebook or Instagram) has no
 * share sheet to give the instruction about.
 */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//;

/**
 * iOS Safari, where the invitation is a sentence rather than a button.
 *
 * Safari fires no `beforeinstallprompt` and offers no programmatic install —
 * the whole flow is Share → "Sur l'écran d'accueil", performed by hand — so
 * on iOS the app can only say where the control is.
 *
 * `maxTouchPoints` is not defensive padding: since iPadOS 13 an iPad in its
 * default "desktop" mode reports itself as a Macintosh, so the device string
 * alone misses every iPad. A real Mac reports 0 touch points, a trackpad
 * notwithstanding.
 */
export function isIosSafari(ua: string, maxTouchPoints: number): boolean {
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  return isIosDevice && !NOT_SAFARI.test(ua);
}

export interface InstallConditions {
  /** The app is already running from the home screen or the dock. */
  standalone: boolean;
  /** The teacher has said "later" on this device before. */
  dismissed: boolean;
  /** A `beforeinstallprompt` event is held and can still be fired. */
  canPrompt: boolean;
  /** iOS Safari, per `isIosSafari`. */
  iosSafari: boolean;
}

/**
 * Standalone and dismissed both mean silence, and they are checked first
 * because they outrank the platform: an installed app must not advertise
 * installation, and a teacher who said "later" said it about every route.
 *
 * `canPrompt` beats `iosSafari` so a browser that can actually install gets
 * the button rather than instructions for a share sheet it does not have.
 *
 * Everything else — desktop Firefox, a Safari on macOS, a browser that has
 * simply not fired the event yet — gets nothing. An invitation with no way to
 * accept it is worse than none: it asks for something and then does not say
 * how, and every one of those browsers already offers install in its own menu.
 */
export function installOffer(conditions: InstallConditions): InstallOffer {
  if (conditions.standalone || conditions.dismissed) return "none";
  if (conditions.canPrompt) return "prompt";
  if (conditions.iosSafari) return "ios";
  return "none";
}

export function readInstallDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_STORAGE_KEY) !== null;
  } catch {
    // A browser with site data blocked cannot remember the dismissal. Reading
    // "not dismissed" shows the invitation again, which is the wrong side to
    // err on — but the alternative is never offering it at all, and this is
    // the same browser that will lose the gradebook on close.
    return false;
  }
}

export function writeInstallDismissed(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_STORAGE_KEY, String(Date.now()));
  } catch {
    // Losing the dismissal is survivable; failing to render is not.
  }
}
