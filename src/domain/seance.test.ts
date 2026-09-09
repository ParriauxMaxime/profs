import { nextDay, previousDay } from "./calendar";
import { entriesForDay } from "./schedule";
import {
  backfillSeanceTimes,
  DEFAULT_SEANCE_MINUTES,
  hourOfDay,
  repairSeanceCollisions,
  resolveSlot,
  type Slot,
  slotsForDay,
  teachingDays,
} from "./seance";

const DAY = 1_757_289_600_000; // an arbitrary startOfDay

const session = (id: string, startsAt: number, classId = "c1", endsAt = startsAt + 55) => ({
  id,
  classId,
  startsAt,
  endsAt,
});
const entry = (id: string, startMinute: number, classId = "c1", endMinute = startMinute + 55) => ({
  id,
  classId,
  weekday: 1,
  startMinute,
  endMinute,
  weekCycle: "all" as const,
});

describe("slotsForDay", () => {
  it("pairs a séance with the lesson it was taught at", () => {
    const slots = slotsForDay([session("s1", 600)], [entry("e1", 600)], DAY);
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, endsAt: 655, sessionId: "s1", entryId: "e1" },
    ]);
  });

  /**
   * The timetable predicts. A lesson with no séance is still a slot — that is
   * what lets a teacher open it and write next week's plan.
   */
  it("keeps a scheduled lesson that has no séance", () => {
    const slots = slotsForDay([], [entry("e1", 600)], DAY);
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, endsAt: 655, sessionId: null, entryId: "e1" },
    ]);
  });

  it("gives a slot the entry's end when the timetable predicted it", () => {
    const slots = slotsForDay(
      [],
      [{ id: "e1", classId: "c1", startMinute: 600, endMinute: 655 }],
      DAY,
    );
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, endsAt: 655, sessionId: null, entryId: "e1" },
    ]);
  });

  it("gives an unpaired séance its own stored end, not a guess", () => {
    const slots = slotsForDay([{ id: "s1", classId: "c1", startsAt: 840, endsAt: 950 }], [], DAY);
    expect(slots).toEqual([
      { date: DAY, startsAt: 840, endsAt: 950, sessionId: "s1", entryId: null },
    ]);
  });

  /**
   * Two classes at the same minute is legal — `overlaps` warns and never
   * refuses — and Aujourd'hui reads every class at once. Pairing on time
   * alone put one class's name on another class's row.
   */
  it("does not let a class claim another class's lesson at the same minute", () => {
    const slots = slotsForDay(
      [session("s1", 600, "c1")],
      // The other class's lesson comes FIRST, so a time-only match takes it.
      [entry("e2", 600, "c2"), entry("e1", 600, "c1")],
      DAY,
    );
    expect(slots.find((s) => s.sessionId === "s1")?.entryId).toBe("e1");
    expect(slots).toContainEqual({
      date: DAY,
      startsAt: 600,
      endsAt: 655,
      sessionId: null,
      entryId: "e2",
    });
  });

  it("still pairs a séance only with a lesson of its own class", () => {
    // Two classes at one minute is legal, and Aujourd'hui reads every class at
    // once — so time alone would let one class's séance claim another's lesson.
    const slots = slotsForDay(
      [{ id: "s1", classId: "c2", startsAt: 600, endsAt: 655 }],
      [
        { id: "e1", classId: "c1", startMinute: 600, endMinute: 655 },
        { id: "e2", classId: "c2", startMinute: 600, endMinute: 655 },
      ],
      DAY,
    );
    expect(slots.find((s) => s.sessionId === "s1")?.entryId).toBe("e2");
    expect(slots).toHaveLength(2);
  });

  it("takes the séance's end over the entry's when a paired lesson ran long", () => {
    // The séance records what happened; the entry records what was intended.
    const slots = slotsForDay(
      [{ id: "s1", classId: "c1", startsAt: 600, endsAt: 720 }],
      [{ id: "e1", classId: "c1", startMinute: 600, endMinute: 655 }],
      DAY,
    );
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, endsAt: 720, sessionId: "s1", entryId: "e1" },
    ]);
  });

  it("pairs each class's séance with its own lesson when both are at the same minute", () => {
    const slots = slotsForDay(
      [session("s1", 600, "c1"), session("s2", 600, "c2")],
      [entry("e2", 600, "c2"), entry("e1", 600, "c1")],
      DAY,
    );
    expect(slots).toHaveLength(2);
    expect(slots.find((s) => s.sessionId === "s1")?.entryId).toBe("e1");
    expect(slots.find((s) => s.sessionId === "s2")?.entryId).toBe("e2");
  });

  it("does not pair two séances with one lesson", () => {
    const slots = slotsForDay([session("s1", 600), session("s2", 600)], [entry("e1", 600)], DAY);
    expect(slots).toHaveLength(2);
    expect(slots.filter((s) => s.entryId === "e1")).toHaveLength(1);
  });
});

describe("resolveSlot", () => {
  const slots: Slot[] = [
    { date: DAY, startsAt: 600, endsAt: 655, sessionId: "s1", entryId: "e1" },
    { date: DAY, startsAt: 840, endsAt: 895, sessionId: null, entryId: "e2" },
  ];

  it("finds the slot at the time asked for", () => {
    expect(resolveSlot(slots, { startsAt: 840 })?.entryId).toBe("e2");
  });

  /**
   * A lesson moved from 10h to 11h leaves older links naming a time nothing
   * sits at. Falling back to the day's first séance beats an empty screen.
   */
  it("falls back to the day's first slot when the time matches nothing", () => {
    expect(resolveSlot(slots, { startsAt: 1200 })?.startsAt).toBe(600);
  });

  it("takes the day's first slot when no time is asked for", () => {
    expect(resolveSlot(slots, null)?.startsAt).toBe(600);
  });

  it("gives nothing for a day with nothing on it", () => {
    expect(resolveSlot([], { startsAt: 600 })).toBeNull();
  });
});

describe("teachingDays", () => {
  const WINDOW = { backDays: 28, aheadDays: 14 };
  // A Monday, so an entry on weekday 1 lands on it.
  const MONDAY = 1_757_289_600_000;
  const dayEntry = (weekday: number) => ({
    weekday,
    startMinute: 600,
    endMinute: 655,
    weekCycle: "all" as const,
  });

  it("lists a day that holds only a séance", () => {
    const past = previousDay(MONDAY);
    expect(teachingDays([], [{ date: past }], null, MONDAY, WINDOW)).toEqual([past]);
  });

  it("lists a day that holds only a scheduled lesson", () => {
    const days = teachingDays([dayEntry(1)], [], null, MONDAY, WINDOW);
    expect(days).toContain(MONDAY);
    expect(days.length).toBeGreaterThan(1);
  });

  it("lists a day holding both a séance and a lesson exactly once", () => {
    const days = teachingDays([dayEntry(1)], [{ date: MONDAY }], null, MONDAY, WINDOW);
    expect(days.filter((d) => d === MONDAY)).toHaveLength(1);
  });

  it("returns days oldest first", () => {
    const days = teachingDays([dayEntry(1)], [{ date: previousDay(MONDAY) }], null, MONDAY, WINDOW);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("excludes a séance older than the window", () => {
    let old = MONDAY;
    for (let i = 0; i < 40; i += 1) old = previousDay(old);
    expect(teachingDays([], [{ date: old }], null, MONDAY, WINDOW)).toEqual([]);
  });

  it("excludes a séance beyond the window ahead", () => {
    let far = MONDAY;
    for (let i = 0; i < 20; i += 1) far = nextDay(far);
    expect(teachingDays([], [{ date: far }], null, MONDAY, WINDOW)).toEqual([]);
  });

  /**
   * A/B parity is `entriesForDay`'s business, and this must not second-guess
   * it: a fortnightly lesson appears on its own weeks and no others.
   */
  it("respects A/B parity through entriesForDay", () => {
    const fortnightly = [{ weekday: 1, startMinute: 600, endMinute: 655, weekCycle: "A" as const }];
    const days = teachingDays(fortnightly, [], MONDAY, MONDAY, WINDOW);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(entriesForDay(fortnightly, MONDAY, day).length).toBeGreaterThan(0);
    }
  });

  /**
   * The walk steps the CALENDAR. Adding 86_400_000 slides an hour at each DST
   * change and eventually repeats or skips a whole day — and a day menu wrong
   * by one looks exactly like a day menu that is right.
   */
  it("skips no day and repeats none across a DST change", () => {
    // Late March, so the window spans the spring-forward Sunday.
    const march = new Date(2026, 2, 20).setHours(0, 0, 0, 0);
    const week = [dayEntry(1), dayEntry(2), dayEntry(3), dayEntry(4), dayEntry(5)];
    const days = teachingDays(week, [], null, march, { backDays: 14, aheadDays: 14 });
    expect(new Set(days).size).toBe(days.length);
    for (const day of days) {
      expect(new Date(day).getHours()).toBe(0);
    }
  });
});

describe("hourOfDay", () => {
  it("floors a timestamp to its local hour, in minutes from midnight", () => {
    // 10:37 local on an arbitrary day.
    const at = new Date(2026, 8, 9, 10, 37, 12).getTime();
    expect(hourOfDay(at)).toBe(10 * 60);
  });

  it("keeps an exact hour where it is", () => {
    expect(hourOfDay(new Date(2026, 8, 9, 14, 0, 0).getTime())).toBe(14 * 60);
  });

  it("reads midnight as zero", () => {
    expect(hourOfDay(new Date(2026, 8, 9, 0, 12, 0).getTime())).toBe(0);
  });
});

describe("backfillSeanceTimes", () => {
  it("takes the hour a séance was created in when it has no start", () => {
    // A séance is created BY a mid-lesson act — a mark, a behaviour event —
    // so the hour it was created in is the hour it was taught in.
    const createdAt = new Date(2026, 8, 9, 10, 37, 0).getTime();
    expect(backfillSeanceTimes({ createdAt })).toEqual({
      startsAt: 600,
      endsAt: 600 + DEFAULT_SEANCE_MINUTES,
    });
  });

  it("keeps a start it already has, and gives it the default end", () => {
    const createdAt = new Date(2026, 8, 9, 21, 4, 0).getTime();
    expect(backfillSeanceTimes({ startsAt: 480, createdAt })).toEqual({
      startsAt: 480,
      endsAt: 480 + DEFAULT_SEANCE_MINUTES,
    });
  });

  it("returns a fully timed row unchanged", () => {
    const createdAt = new Date(2026, 8, 9, 10, 0, 0).getTime();
    expect(backfillSeanceTimes({ startsAt: 480, endsAt: 600, createdAt })).toEqual({
      startsAt: 480,
      endsAt: 600,
    });
  });

  it("never lets a repaired end run past midnight", () => {
    // 23:30 floors to 23:00; 23:00 + 55 is 23:55, still inside the day.
    const createdAt = new Date(2026, 8, 9, 23, 30, 0).getTime();
    const { startsAt, endsAt } = backfillSeanceTimes({ createdAt });
    expect(startsAt).toBe(23 * 60);
    expect(endsAt).toBeLessThanOrEqual(24 * 60);
  });
});

describe("repairSeanceCollisions", () => {
  // Two mid-lesson acts an hour apart in wall-clock reality, but both fall
  // inside 10h–11h, so both floor to the same derived start — the exact
  // hazard `startSeance`'s old untimed branch produced routinely.
  const tenOhFive = new Date(2026, 8, 9, 10, 5, 0).getTime();
  const tenOhForty = new Date(2026, 8, 9, 10, 40, 0).getTime();

  const row = (
    id: string,
    overrides: Partial<{
      classId: string;
      date: number;
      createdAt: number;
      startsAt: number;
      endsAt: number;
    }> = {},
  ) => ({
    id,
    classId: "c1",
    date: DAY,
    createdAt: tenOhFive,
    ...overrides,
  });

  it("gives two untimed séances of one class created in the same hour different starts", () => {
    const result = repairSeanceCollisions([
      row("first", { createdAt: tenOhFive }),
      row("second", { createdAt: tenOhForty }),
    ]);
    const first = result.find((r) => r.id === "first");
    const second = result.find((r) => r.id === "second");
    // Earliest created keeps the exact hour.
    expect(first).toEqual({ id: "first", startsAt: 10 * 60, endsAt: 10 * 60 + 55 });
    // The later one is nudged a minute forward rather than a whole hour.
    expect(second).toEqual({ id: "second", startsAt: 10 * 60 + 1, endsAt: 10 * 60 + 1 + 55 });
  });

  it("never moves a row that already has a stored start, even when a derived row wants that minute", () => {
    const result = repairSeanceCollisions([
      // Stored exactly on the hour a derived row would also floor to.
      row("stored", { startsAt: 10 * 60, endsAt: 10 * 60 + 55, createdAt: tenOhForty }),
      row("derived", { createdAt: tenOhFive }),
    ]);
    const stored = result.find((r) => r.id === "stored");
    const derived = result.find((r) => r.id === "derived");
    expect(stored).toEqual({ id: "stored", startsAt: 10 * 60, endsAt: 10 * 60 + 55 });
    // The derived row is the one that yields, since a repair may only move a
    // time it invented.
    expect(derived?.startsAt).not.toBe(10 * 60);
  });

  it("does not let two different classes at the same hour interfere", () => {
    const result = repairSeanceCollisions([
      row("c1-a", { classId: "c1", createdAt: tenOhFive }),
      row("c2-a", { classId: "c2", createdAt: tenOhFive }),
    ]);
    // Same day, same created hour, different classes: neither has to move.
    expect(result.find((r) => r.id === "c1-a")?.startsAt).toBe(10 * 60);
    expect(result.find((r) => r.id === "c2-a")?.startsAt).toBe(10 * 60);
  });

  it("does not let the same class on different days interfere", () => {
    const result = repairSeanceCollisions([
      row("day1", { date: DAY, createdAt: tenOhFive }),
      row("day2", { date: nextDay(DAY), createdAt: tenOhFive }),
    ]);
    expect(result.find((r) => r.id === "day1")?.startsAt).toBe(10 * 60);
    expect(result.find((r) => r.id === "day2")?.startsAt).toBe(10 * 60);
  });

  it("preserves a stored endsAt, and derives one for a derived start", () => {
    const result = repairSeanceCollisions([
      row("stored", { startsAt: 8 * 60, endsAt: 8 * 60 + 90, createdAt: tenOhFive }),
      row("derived", { createdAt: tenOhFive }),
    ]);
    expect(result.find((r) => r.id === "stored")).toEqual({
      id: "stored",
      startsAt: 8 * 60,
      endsAt: 8 * 60 + 90,
    });
    const derived = result.find((r) => r.id === "derived");
    expect(derived?.endsAt).toBe((derived?.startsAt ?? 0) + DEFAULT_SEANCE_MINUTES);
  });

  // The point of the whole fix: fed through the real pairing and resolution,
  // both séances must be reachable — not merely have different `startsAt`
  // values in isolation.
  it("makes both séances of a collision reachable through slotsForDay and resolveSlot", () => {
    // Repaired by INDEX, not by an id lookup that would need a non-null
    // assertion: `repairSeanceCollisions` returns one entry per input row, in
    // the same order.
    const repairedTimes = repairSeanceCollisions([
      row("s-first", { createdAt: tenOhFive }),
      row("s-second", { createdAt: tenOhForty }),
    ]);
    const sessions = [
      { classId: "c1", ...repairedTimes[0] },
      { classId: "c1", ...repairedTimes[1] },
    ];

    const slots = slotsForDay(sessions, [], DAY);
    expect(slots).toHaveLength(2);

    const first = slots.find((s) => s.sessionId === "s-first");
    const second = slots.find((s) => s.sessionId === "s-second");
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    expect(resolveSlot(slots, { startsAt: first?.startsAt ?? -1 })?.sessionId).toBe("s-first");
    expect(resolveSlot(slots, { startsAt: second?.startsAt ?? -1 })?.sessionId).toBe("s-second");
  });
});
