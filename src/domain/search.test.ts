import { fuzzyMatchAny } from "./search";

describe("fuzzyMatchAny", () => {
  it("matches a case-insensitive substring", () => {
    expect(fuzzyMatchAny(["Mathématiques"], "math")).toBe(true);
  });

  it("ignores accents in both the value and the query", () => {
    expect(fuzzyMatchAny(["Mathématiques"], "mathematiques")).toBe(true);
    expect(fuzzyMatchAny(["Mathematiques"], "mathé")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(fuzzyMatchAny(["Français"], "physique")).toBe(false);
  });

  it("skips undefined values", () => {
    expect(fuzzyMatchAny([undefined, "3°B"], "3")).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(fuzzyMatchAny(["anything"], "")).toBe(true);
  });
});
