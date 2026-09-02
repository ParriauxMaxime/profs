import {
  DEFAULT_THEME,
  parseThemeChoice,
  readThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_STORAGE_KEY,
  writeThemeChoice,
} from "./theme";

describe("theme choices", () => {
  it("offers system, copie and ardoise", () => {
    expect(THEME_CHOICES).toEqual(["system", "copie", "ardoise"]);
  });

  it("defaults to following the device", () => {
    expect(DEFAULT_THEME).toBe("system");
  });
});

describe("parseThemeChoice", () => {
  it("accepts a known choice", () => {
    expect(parseThemeChoice("ardoise")).toBe("ardoise");
  });

  it("refuses anything else", () => {
    expect(parseThemeChoice("dark")).toBeNull();
    expect(parseThemeChoice("")).toBeNull();
    expect(parseThemeChoice(undefined)).toBeNull();
    expect(parseThemeChoice(2)).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("takes an explicit choice regardless of the device", () => {
    expect(resolveTheme("copie", true)).toBe("copie");
    expect(resolveTheme("ardoise", false)).toBe("ardoise");
  });

  it("follows the device when set to system", () => {
    expect(resolveTheme("system", true)).toBe("ardoise");
    expect(resolveTheme("system", false)).toBe("copie");
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a choice", () => {
    writeThemeChoice("ardoise");
    expect(readThemeChoice()).toBe("ardoise");
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readThemeChoice()).toBe(DEFAULT_THEME);
  });

  it("falls back when the stored value is not a theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "midnight");
    expect(readThemeChoice()).toBe(DEFAULT_THEME);
  });
});
