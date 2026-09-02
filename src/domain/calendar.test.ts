import {
  agendaDays,
  daysInRange,
  monthGrid,
  nextDay,
  previousDay,
  startOfIsoWeek,
  weekDays,
} from "./calendar";

const day = (y: number, m: number, d: number): number => new Date(y, m, d).getTime();
const label = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("nextDay and previousDay", () => {
  it("moves one calendar day, not 24 hours", () => {
    expect(label(nextDay(day(2026, 8, 1)))).toBe("2026-09-02");
    expect(label(previousDay(day(2026, 8, 1)))).toBe("2026-08-31");
  });

  it("crosses a month and a year boundary", () => {
    expect(label(nextDay(day(2026, 11, 31)))).toBe("2027-01-01");
    expect(label(previousDay(day(2027, 0, 1)))).toBe("2026-12-31");
  });

  it("lands on local midnight across a DST change", () => {
    // Europe/Paris moves on 25 October 2026. A day that is 25 hours long must
    // still advance by exactly one calendar day, and still land at 00:00 —
    // `+ 86_400_000` would land at 23:00 the day before.
    for (const start of [day(2026, 9, 24), day(2026, 9, 25), day(2027, 2, 27), day(2027, 2, 28)]) {
      const next = new Date(nextDay(start));
      expect([label(start), next.getHours()]).toEqual([label(start), 0]);
    }
    expect(label(nextDay(day(2026, 9, 24)))).toBe("2026-10-25");
    expect(label(nextDay(day(2026, 9, 25)))).toBe("2026-10-26");
  });
});

describe("weekDays", () => {
  it("returns Monday to Sunday of the containing week", () => {
    // Wednesday 2 September 2026.
    expect(weekDays(day(2026, 8, 2)).map(label)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("treats Sunday as the END of its week, not the start", () => {
    // The classic off-by-one: getDay() is 0 for Sunday.
    expect(weekDays(day(2026, 8, 6)).map(label)[0]).toBe("2026-08-31");
    expect(weekDays(day(2026, 8, 6)).map(label)[6]).toBe("2026-09-06");
  });
});

describe("monthGrid", () => {
  it("lays September 2026 out Monday-first", () => {
    const grid = monthGrid(2026, 8);
    expect(grid[0].map((d) => label(d.date))).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][1].inMonth).toBe(true);
  });

  it("holds every month of 2026 and 2027 without a gap, a duplicate or a slip", () => {
    // The guard. A month grid that is wrong by one day still looks exactly
    // like a calendar, so spot-checking one month proves nothing: this walks
    // twenty-four of them and checks the four properties that must hold.
    for (let year = 2026; year <= 2027; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const grid = monthGrid(year, month);
        const flat = grid.flat();
        const where = `${year}-${String(month + 1).padStart(2, "0")}`;

        // Always six weeks, so the page does not change height between months.
        expect([where, grid.length, flat.length]).toEqual([where, 6, 42]);

        // Starts on a Monday.
        expect([where, new Date(flat[0].date).getDay()]).toEqual([where, 1]);

        // Consecutive: every day is the one after its predecessor.
        for (let i = 1; i < flat.length; i += 1) {
          expect([where, i, label(flat[i].date)]).toEqual([
            where,
            i,
            label(nextDay(flat[i - 1].date)),
          ]);
        }

        // Contains every day of the month exactly once, and marks exactly
        // those as inMonth.
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const marked = flat.filter((d) => d.inMonth).map((d) => label(d.date));
        const expected = Array.from({ length: daysInMonth }, (_, i) =>
          label(day(year, month, i + 1)),
        );
        expect([where, marked]).toEqual([where, expected]);
      }
    }
  });

  it("gives a February starting on a Sunday its own leading week", () => {
    // 1 February 2026 is a Sunday — the case where a naive grid keyed on
    // getDay() puts the 1st in the first cell and shifts the whole month.
    const grid = monthGrid(2026, 1);
    expect(label(grid[0][0].date)).toBe("2026-01-26");
    expect(grid[0][6].inMonth).toBe(true);
    expect(label(grid[0][6].date)).toBe("2026-02-01");
  });
});

describe("daysInRange", () => {
  it("includes both ends", () => {
    expect(daysInRange(day(2026, 8, 1), day(2026, 8, 3)).map(label)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("is a single day when both ends are the same day", () => {
    expect(daysInRange(day(2026, 8, 1), day(2026, 8, 1))).toHaveLength(1);
  });

  it("ignores the time of day at either end", () => {
    const from = new Date(2026, 8, 1, 23, 30).getTime();
    const to = new Date(2026, 8, 2, 0, 30).getTime();
    expect(daysInRange(from, to).map(label)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("agendaDays", () => {
  const lessons = [
    { id: "l1", on: day(2026, 8, 1) },
    { id: "l2", on: day(2026, 8, 1) },
    { id: "l3", on: day(2026, 8, 4) },
  ];
  const entries = [
    { id: "e1", on: day(2026, 8, 2) },
    { id: "e2", on: day(2026, 8, 4) },
  ];
  const build = (from: number, to: number) =>
    agendaDays(
      from,
      to,
      lessons,
      (l) => l.on,
      entries,
      (e) => e.on,
    );

  it("omits days carrying neither a lesson nor an entry", () => {
    const days = build(day(2026, 8, 1), day(2026, 8, 30));
    expect(days.map((d) => label(d.date))).toEqual(["2026-09-01", "2026-09-02", "2026-09-04"]);
  });

  it("keeps a day that has an entry but no lesson", () => {
    // Writing about a day the timetable knows nothing about — a cover class,
    // or a plan made before the lesson existed — must not vanish.
    const days = build(day(2026, 8, 2), day(2026, 8, 2));
    expect(days).toHaveLength(1);
    expect([days[0].lessons.length, days[0].entries.length]).toEqual([0, 1]);
  });

  it("groups several lessons onto one day", () => {
    const days = build(day(2026, 8, 1), day(2026, 8, 1));
    expect(days[0].lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("excludes anything outside the range at either end", () => {
    expect(build(day(2026, 8, 2), day(2026, 8, 3)).map((d) => label(d.date))).toEqual([
      "2026-09-02",
    ]);
  });

  it("returns days in chronological order whatever order the inputs arrive in", () => {
    const shuffled = agendaDays(
      day(2026, 8, 1),
      day(2026, 8, 30),
      [...lessons].reverse(),
      (l) => l.on,
      [...entries].reverse(),
      (e) => e.on,
    );
    expect(shuffled.map((d) => label(d.date))).toEqual(["2026-09-01", "2026-09-02", "2026-09-04"]);
  });
});

describe("startOfIsoWeek is re-exported, not reimplemented", () => {
  it("agrees with weekDays", () => {
    // Two implementations of Monday-first normalisation would be two chances
    // to get it wrong, and the other one carries the A/B parity of the year.
    expect(startOfIsoWeek(day(2026, 8, 2))).toBe(weekDays(day(2026, 8, 2))[0]);
  });
});
