import {
  entriesForDate,
  formatTimeRange,
  hmToMinutes,
  minutesToHm,
  overlaps,
  WEEK_CYCLES,
  weekParity,
} from "./schedule";

const TERM_START = new Date(2026, 8, 1).getTime(); // Tuesday 1 September 2026

describe("WEEK_CYCLES", () => {
  it("is all, A, B", () => {
    expect(WEEK_CYCLES).toEqual(["all", "A", "B"]);
  });
});

describe("weekParity", () => {
  it("makes the term's first week A", () => {
    expect(weekParity(TERM_START, new Date(2026, 8, 1).getTime())).toBe("A");
    expect(weekParity(TERM_START, new Date(2026, 8, 6).getTime())).toBe("A");
  });

  it("makes the second week B", () => {
    // Monday 7 September is the start of week two.
    expect(weekParity(TERM_START, new Date(2026, 8, 7).getTime())).toBe("B");
    expect(weekParity(TERM_START, new Date(2026, 8, 13).getTime())).toBe("B");
  });

  it("alternates onward", () => {
    expect(weekParity(TERM_START, new Date(2026, 8, 14).getTime())).toBe("A");
    expect(weekParity(TERM_START, new Date(2026, 8, 21).getTime())).toBe("B");
  });

  it("treats the week as starting on Monday, not on the term-start weekday", () => {
    // Term starts Tuesday; the Monday BEFORE it is not week two.
    expect(weekParity(TERM_START, new Date(2026, 7, 31).getTime())).toBe("A");
  });

  it("survives a DST change", () => {
    // Europe/Paris moves on 25 October 2026. Parity must not slip.
    const before = weekParity(TERM_START, new Date(2026, 9, 19).getTime());
    const after = weekParity(TERM_START, new Date(2026, 9, 26).getTime());
    expect(before).not.toBe(after);
  });

  it("flips only on Mondays, for a whole school year", () => {
    // The DST tests above only prove two dates differ. This walks every day
    // from September to the following October — both clock changes included —
    // and asserts parity never flips mid-week. A slip of one day would show a
    // whole week the wrong lessons, and the two spot checks would still pass.
    let previous: string | null = null;
    const flips: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const day = new Date(2026, 8, 1);
      day.setDate(day.getDate() + i);
      const parity = weekParity(TERM_START, day.getTime());
      if (previous !== null && parity !== previous) {
        // getDay() is 1 for Monday.
        expect([day.toDateString(), day.getDay()]).toEqual([day.toDateString(), 1]);
        flips.push(i);
      }
      previous = parity;
    }
    // 400 days is a little over 57 weeks, so a flip every week.
    expect(flips).toHaveLength(57);
  });

  it("survives a year boundary", () => {
    const dec = weekParity(TERM_START, new Date(2026, 11, 28).getTime());
    const jan = weekParity(TERM_START, new Date(2027, 0, 4).getTime());
    expect(dec).not.toBe(jan);
  });
});

describe("entriesForDate", () => {
  const entries = [
    { id: "e1", weekday: 2, startMinute: 600, endMinute: 660, weekCycle: "all" as const },
    { id: "e2", weekday: 2, startMinute: 480, endMinute: 540, weekCycle: "A" as const },
    { id: "e3", weekday: 2, startMinute: 540, endMinute: 600, weekCycle: "B" as const },
    { id: "e4", weekday: 3, startMinute: 480, endMinute: 540, weekCycle: "all" as const },
  ];

  it("returns the day's entries for the active cycle, earliest first", () => {
    // Tuesday 1 September 2026 is weekday 2, week A.
    const found = entriesForDate(entries, TERM_START, new Date(2026, 8, 1).getTime());
    expect(found.map((e) => e.id)).toEqual(["e2", "e1"]);
  });

  it("swaps the cycle-specific entry in week B", () => {
    const found = entriesForDate(entries, TERM_START, new Date(2026, 8, 8).getTime());
    expect(found.map((e) => e.id)).toEqual(["e3", "e1"]);
  });

  it("returns nothing for a day with no entries", () => {
    expect(entriesForDate(entries, TERM_START, new Date(2026, 8, 5).getTime())).toEqual([]);
  });

  it("returns nothing before the term starts", () => {
    // A date before the anchor has no meaningful parity; showing week A's
    // lessons in August would be worse than showing none.
    expect(entriesForDate(entries, TERM_START, new Date(2026, 7, 25).getTime())).toEqual([]);
  });
});

describe("minutes helpers", () => {
  it("round-trips", () => {
    expect(minutesToHm(605)).toEqual({ hours: 10, minutes: 5 });
    expect(hmToMinutes(10, 5)).toBe(605);
  });

  it("formats a range in the app locale", () => {
    expect(formatTimeRange(600, 660, "fr")).toBe("10:00 – 11:00");
  });
});

describe("overlaps", () => {
  const base = { weekday: 2, startMinute: 600, endMinute: 660, weekCycle: "all" as const };

  it("detects a clash on the same day and cycle", () => {
    expect(overlaps(base, { ...base, startMinute: 630, endMinute: 690 })).toBe(true);
  });

  it("allows touching edges", () => {
    expect(overlaps(base, { ...base, startMinute: 660, endMinute: 720 })).toBe(false);
  });

  it("ignores a different weekday", () => {
    expect(overlaps(base, { ...base, weekday: 3 })).toBe(false);
  });

  it("ignores opposite cycles", () => {
    expect(overlaps({ ...base, weekCycle: "A" }, { ...base, weekCycle: "B" })).toBe(false);
  });

  it("clashes when one side runs every week", () => {
    expect(overlaps(base, { ...base, weekCycle: "A" })).toBe(true);
  });
});
