import {
  BEHAVIOUR_RANGES,
  DEFAULT_BEHAVIOUR_RANGE,
  RECENT_DAYS,
  rangeStart,
  withinRange,
} from "./behaviour-range";

const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m, d, h).getTime();

describe("rangeStart", () => {
  it("has no lower bound for everything", () => {
    expect(rangeStart("all", at(2026, 8, 1), at(2026, 8, 8))).toBeNull();
  });

  it("reaches back exactly 30 days, to local midnight", () => {
    const now = at(2026, 8, 8, 15);
    const start = rangeStart("days30", null, now);
    expect(start).not.toBeNull();
    const d = new Date(start as number);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 9]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("is exactly 30 calendar days back on every day of a year, DST included", () => {
    // The spot check above only proves one date. Subtracting 30 * 86_400_000
    // is an hour out after each clock change and, from a morning, lands on the
    // day BEFORE the intended one — silently dropping a day of events, in a
    // count a teacher may repeat to a parent. This walks a full year, both
    // clock changes included, and asserts the bound is always local midnight
    // exactly 30 calendar days earlier. It makes no assumption about which
    // timezone the suite runs in.
    for (let i = 0; i < 400; i += 1) {
      const day = new Date(2026, 0, 1, 9, 30);
      day.setDate(day.getDate() + i);

      const expected = new Date(day);
      expected.setHours(0, 0, 0, 0);
      expected.setDate(expected.getDate() - RECENT_DAYS);

      const actual = new Date(rangeStart("days30", null, day.getTime()) as number);
      expect([actual.getFullYear(), actual.getMonth(), actual.getDate()]).toEqual([
        expected.getFullYear(),
        expected.getMonth(),
        expected.getDate(),
      ]);
      expect([actual.getHours(), actual.getMinutes()]).toEqual([0, 0]);
    }
  });

  it("starts a term at the anchor's local midnight, not at its stored time", () => {
    const anchor = at(2026, 8, 1, 17);
    const start = rangeStart("term", anchor, at(2026, 8, 8)) as number;
    const d = new Date(start);
    expect([d.getMonth(), d.getDate(), d.getHours()]).toEqual([8, 1, 0]);
  });

  it("falls back to everything when no term anchor is set", () => {
    // Zero events because nobody entered a term-start date would read as a
    // pupil with a clean record.
    expect(rangeStart("term", null, at(2026, 8, 8))).toBeNull();
  });

  it("covers every declared range", () => {
    for (const range of BEHAVIOUR_RANGES) {
      expect(() => rangeStart(range, at(2026, 8, 1), at(2026, 8, 8))).not.toThrow();
    }
  });
});

describe("withinRange", () => {
  const events = [
    { createdAt: at(2026, 5, 1), type: "red" },
    { createdAt: at(2026, 8, 1), type: "green" },
    { createdAt: at(2026, 8, 7), type: "yellow" },
  ];

  it("keeps everything when there is no bound", () => {
    expect(withinRange(events, null)).toHaveLength(3);
  });

  it("keeps only what falls on or after the bound", () => {
    expect(withinRange(events, at(2026, 8, 1, 0)).map((e) => e.type)).toEqual(["green", "yellow"]);
  });

  it("includes an event exactly on the bound", () => {
    // A lower bound of local midnight must not exclude the lesson that morning.
    const bound = at(2026, 8, 7, 0);
    expect(withinRange([{ createdAt: bound }], bound)).toHaveLength(1);
  });

  it("returns a copy, never the caller's array", () => {
    const result = withinRange(events, null);
    expect(result).not.toBe(events);
  });

  it("is empty when nothing falls inside", () => {
    expect(withinRange(events, at(2027, 0, 1))).toEqual([]);
  });
});

describe("the default", () => {
  it("is everything, so the pupil page keeps the behaviour it had", () => {
    expect(DEFAULT_BEHAVIOUR_RANGE).toBe("all");
  });
});
