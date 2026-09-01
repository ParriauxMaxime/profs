import { formatDecimal, parseDecimal } from "./decimal";

describe("formatDecimal", () => {
  it("uses a comma in French", () => {
    expect(formatDecimal(13.4, "fr")).toBe("13,4");
  });

  it("uses a dot in English", () => {
    expect(formatDecimal(13.4, "en")).toBe("13.4");
  });

  it("honours a regional tag", () => {
    expect(formatDecimal(13.4, "en-GB")).toBe("13.4");
    expect(formatDecimal(13.4, "fr-CH")).toBe("13,4");
  });

  it("trims trailing zeros", () => {
    expect(formatDecimal(13.5, "fr")).toBe("13,5");
    expect(formatDecimal(13, "fr")).toBe("13");
    expect(formatDecimal(13, "en")).toBe("13");
  });

  it("rounds to two decimals", () => {
    expect(formatDecimal(13.456, "fr")).toBe("13,46");
    expect(formatDecimal(13.454, "en")).toBe("13.45");
  });

  it("never groups thousands", () => {
    expect(formatDecimal(1234.5, "fr")).toBe("1234,5");
    expect(formatDecimal(1234.5, "en")).toBe("1234.5");
  });

  it("falls back to French for an unknown locale", () => {
    expect(formatDecimal(13.4, "zz")).toBe("13,4");
  });
});

describe("parseDecimal", () => {
  it("accepts a comma", () => {
    expect(parseDecimal("13,4")).toBe(13.4);
  });

  it("accepts a dot", () => {
    expect(parseDecimal("13.4")).toBe(13.4);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseDecimal("  12  ")).toBe(12);
  });

  it("parses zero", () => {
    expect(parseDecimal("0")).toBe(0);
  });

  it("returns null for blank input", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
  });

  it("returns null for text that is not a number", () => {
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal("12a")).toBeNull();
  });

  it("round-trips what formatDecimal produced, in either locale", () => {
    expect(parseDecimal(formatDecimal(13.45, "fr"))).toBe(13.45);
    expect(parseDecimal(formatDecimal(13.45, "en"))).toBe(13.45);
  });
});
