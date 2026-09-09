import {
  type InstallOffer,
  installOffer,
  isIosSafari,
  readInstallDismissed,
  writeInstallDismissed,
} from "@domain/install";
import { useCallback, useEffect, useState } from "react";

/**
 * Chromium's install event. It is not in lib.dom, because it is not in any
 * standard — Firefox and Safari never fire it — so the shape is declared here
 * rather than cast away at the call site.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Every display mode that means "not in a browser tab".
 *
 * `standalone` is what the manifest asks for, but a teacher can have added
 * the app before that member said so, and desktop Chrome's "open in window"
 * lands on `minimal-ui`. Missing one of these shows an install invitation
 * inside the installed app.
 */
const INSTALLED_MODES = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"];

function isStandalone(): boolean {
  const byDisplayMode = INSTALLED_MODES.some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
  // iOS never matches a display-mode query; Safari answers this instead, and
  // it is the only signal there is that the app was launched from the home
  // screen.
  const iosLaunched = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return byDisplayMode || iosLaunched;
}

/**
 * The install invitation's whole state: what to offer, and the two things a
 * teacher can do about it.
 *
 * `beforeinstallprompt` is captured and its default prevented, which is what
 * stops Chromium from putting up its own mini-infobar and lets the invitation
 * appear where the app chooses. The event is stored rather than used
 * immediately: it can only be fired from a user gesture, so it has to wait for
 * the button.
 *
 * A held prompt is single-use — Chromium refuses a second `prompt()` on the
 * same event — so it is dropped after firing whatever the teacher answered.
 * Declining install is not the same as dismissing the invitation: the
 * invitation goes away because the browser will fire the event again on a
 * later visit, and it would then have nothing to fire.
 */
export function useInstallPrompt(): {
  offer: InstallOffer;
  install: () => void;
  dismiss: () => void;
} {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => readInstallDismissed());
  const [standalone, setStandalone] = useState<boolean>(() => isStandalone());
  const [iosSafari] = useState<boolean>(() =>
    isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
  );

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    // Fired after the app is installed by any route — the invitation's button,
    // or the browser's own menu. Without it, installing from the menu leaves
    // the invitation on screen asking for something already done.
    const onInstalled = (): void => {
      setPrompt(null);
      setStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(() => {
    if (prompt === null) return;
    setPrompt(null);
    void prompt.prompt();
  }, [prompt]);

  const dismiss = useCallback(() => {
    writeInstallDismissed();
    setDismissed(true);
  }, []);

  return {
    offer: installOffer({ standalone, dismissed, canPrompt: prompt !== null, iosSafari }),
    install,
    dismiss,
  };
}
