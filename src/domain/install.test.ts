import {
  INSTALL_DISMISSED_STORAGE_KEY,
  type InstallConditions,
  installOffer,
  isIosSafari,
  readInstallDismissed,
  writeInstallDismissed,
} from "./install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const MAC_SAFARI = IPAD_DESKTOP_MODE;
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const conditions = (over: Partial<InstallConditions> = {}): InstallConditions => ({
  standalone: false,
  dismissed: false,
  canPrompt: false,
  iosSafari: false,
  ...over,
});

describe("isIosSafari", () => {
  it("recognises Safari on an iPhone", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
  });

  it("recognises an iPad reporting itself as a Macintosh", () => {
    // iPadOS 13 and later send a desktop user agent by default; the touch
    // points are the only thing that tells it apart from a real Mac.
    expect(isIosSafari(IPAD_DESKTOP_MODE, 5)).toBe(true);
  });

  it("does not mistake a Mac for an iPad", () => {
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
  });

  it("refuses an iOS browser that cannot add to the home screen", () => {
    // Chrome on iOS is WebKit and says "Safari", but has no share-sheet path
    // to the home screen, so the instruction would send the teacher nowhere.
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
  });

  it("refuses an in-app webview", () => {
    expect(isIosSafari(`${IPHONE_SAFARI} FBAV/470.0.0`, 5)).toBe(false);
  });

  it("refuses Android", () => {
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("installOffer", () => {
  it("offers the button when a prompt is held", () => {
    expect(installOffer(conditions({ canPrompt: true }))).toBe("prompt");
  });

  it("offers instructions on iOS Safari, which has no prompt", () => {
    expect(installOffer(conditions({ iosSafari: true }))).toBe("ios");
  });

  it("says nothing when the app is already installed", () => {
    // The one that would never be reported as a bug: an install invitation
    // rendered inside the installed app.
    expect(installOffer(conditions({ standalone: true, canPrompt: true }))).toBe("none");
    expect(installOffer(conditions({ standalone: true, iosSafari: true }))).toBe("none");
  });

  it("says nothing once dismissed, whatever the platform", () => {
    expect(installOffer(conditions({ dismissed: true, canPrompt: true }))).toBe("none");
    expect(installOffer(conditions({ dismissed: true, iosSafari: true }))).toBe("none");
  });

  it("prefers a real prompt to instructions", () => {
    expect(installOffer(conditions({ canPrompt: true, iosSafari: true }))).toBe("prompt");
  });

  it("says nothing in a browser that can neither prompt nor be instructed", () => {
    // Desktop Firefox, or a Chromium that has not fired the event. Both
    // already carry install in their own menu; an invitation with no way to
    // accept it only asks.
    expect(installOffer(conditions())).toBe("none");
  });
});

describe("the dismissal", () => {
  beforeEach(() => {
    localStorage.removeItem(INSTALL_DISMISSED_STORAGE_KEY);
  });

  it("is absent until it is written", () => {
    expect(readInstallDismissed()).toBe(false);
  });

  it("survives, because an invitation that returns is a nag", () => {
    writeInstallDismissed();
    expect(readInstallDismissed()).toBe(true);
  });
});
