import {
  AVATAR_CLOTHES,
  AVATAR_GROUNDS,
  AVATAR_HAIRS,
  AVATAR_SKINS,
  avatarSvg,
  hasAvatar,
  hashSeed,
} from "./avatar";

const seeds = Array.from({ length: 500 }, (_, i) => `student-${i}`);

describe("hashSeed", () => {
  it("is stable for the same seed", () => {
    expect(hashSeed("bernard-adam")).toBe(hashSeed("bernard-adam"));
  });

  it("is never negative, so it can index a palette directly", () => {
    for (const seed of seeds) {
      expect(hashSeed(seed)).toBeGreaterThanOrEqual(0);
    }
  });

  it("separates seeds that differ by one character", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("hasAvatar", () => {
  it("is stable for the same seed", () => {
    expect(hasAvatar("bernard-adam")).toBe(hasAvatar("bernard-adam"));
  });

  it("leaves roughly a third of pupils without one, so the initials fallback stays visible", () => {
    const withAvatar = seeds.filter(hasAvatar).length;
    const share = withAvatar / seeds.length;

    expect(share).toBeGreaterThan(0.55);
    expect(share).toBeLessThan(0.8);
  });
});

describe("avatarSvg", () => {
  it("is stable for the same seed, so reseeding does not reshuffle faces", () => {
    expect(avatarSvg("bernard-adam")).toBe(avatarSvg("bernard-adam"));
  });

  it("differs between pupils", () => {
    const distinct = new Set(seeds.map(avatarSvg));

    expect(distinct.size).toBeGreaterThan(20);
  });

  it("is a square SVG at the app's stored photo size", () => {
    const svg = avatarSvg("bernard-adam");

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 256 256"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("only ever paints colours from the declared palettes", () => {
    // Every fill in the markup must come from a palette. A hand-typed hex
    // sneaking in is how a face ends up with a colour nobody chose.
    const allowed = new Set<string>([
      ...AVATAR_SKINS,
      ...AVATAR_HAIRS,
      ...AVATAR_GROUNDS,
      ...AVATAR_CLOTHES,
      "#1f2430",
      "none",
    ]);

    for (const seed of seeds) {
      for (const [, fill] of avatarSvg(seed).matchAll(/fill="([^"]+)"/g)) {
        expect(allowed).toContain(fill);
      }
    }
  });

  it("draws every hair shape and mouth across enough pupils", () => {
    // A variant that is never reachable is a variant that does not exist. If
    // the picker's modulo is wrong, this catches it rather than the demo
    // looking subtly uniform.
    const hairIds = new Set<string>();
    const mouthIds = new Set<string>();
    for (const seed of seeds) {
      const svg = avatarSvg(seed);
      hairIds.add(svg.match(/data-hair="(\d)"/)?.[1] ?? "");
      mouthIds.add(svg.match(/data-mouth="(\d)"/)?.[1] ?? "");
    }

    expect(hairIds).toEqual(new Set(["0", "1", "2", "3"]));
    expect(mouthIds).toEqual(new Set(["0", "1", "2"]));
  });

  it("contains no external reference, so a face cannot phone home", () => {
    // The app makes no network request of any kind. An <image href> or a
    // remote font in generated markup would be exactly that, from inside a
    // Blob nobody thinks to audit.
    for (const seed of seeds.slice(0, 20)) {
      const svg = avatarSvg(seed);
      // The SVG namespace is a name, not an address — nothing fetches it. Any
      // OTHER url would be a fetch, so strip it before asserting.
      const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
      expect(withoutNamespace).not.toContain("http");
      expect(svg).not.toContain("href");
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("<script");
    }
  });
});
