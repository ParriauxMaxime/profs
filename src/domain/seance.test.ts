import { nextDay, previousDay } from "./calendar";
import { entriesForDay } from "./schedule";
import { resolveSlot, type Slot, slotsForDay, teachingDays } from "./seance";

const DAY = 1_757_289_600_000; // an arbitrary startOfDay

const session = (id: string, startsAt?: number, classId = "c1") => ({
  id,
  classId,
  date: DAY,
  createdAt: 1,
  ...(startsAt === undefined ? {} : { startsAt }),
});
const entry = (id: string, startMinute: number, classId = "c1") => ({
  id,
  classId,
  weekday: 1,
  startMinute,
  endMinute: startMinute + 55,
  weekCycle: "all" as const,
});

describe("slotsForDay", () => {
  it("pairs a séance with the lesson it was taught at", () => {
    const slots = slotsForDay([session("s1", 600)], [entry("e1", 600)], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" }]);
  });

  /**
   * The timetable predicts. A lesson with no séance is still a slot — that is
   * what lets a teacher open it and write next week's plan.
   */
  it("keeps a scheduled lesson that has no séance", () => {
    const slots = slotsForDay([], [entry("e1", 600)], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: 600, sessionId: null, entryId: "e1" }]);
  });

  it("keeps a séance no lesson predicted", () => {
    const slots = slotsForDay([session("s1")], [], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: null, sessionId: "s1", entryId: null }]);
  });

  it("orders by time, untimed last", () => {
    const slots = slotsForDay([session("s1"), session("s2", 840)], [entry("e1", 600)], DAY);
    expect(slots.map((s) => s.startsAt)).toEqual([600, 840, null]);
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
    expect(slots).toContainEqual({ date: DAY, startsAt: 600, sessionId: null, entryId: "e2" });
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

  /**
   * A séance recorded before séances carried a time. It belongs to the lesson
   * the timetable predicted; a second row would render one lesson twice.
   */
  it("pairs an untimed séance with its own class's lesson", () => {
    const slots = slotsForDay([session("s1")], [entry("e1", 600)], DAY);
    expect(slots).toEqual([{ date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" }]);
  });

  it("does not pair an untimed séance with another class's lesson", () => {
    const slots = slotsForDay([session("s1", undefined, "c1")], [entry("e1", 600, "c2")], DAY);
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, sessionId: null, entryId: "e1" },
      { date: DAY, startsAt: null, sessionId: "s1", entryId: null },
    ]);
  });

  /**
   * The unscheduled séance the strip's "Commencer une séance" makes is created
   * BESIDE another one. Absorbing it into a lesson nobody started would leave
   * the strip with no unscheduled slot to open.
   */
  it("leaves a deliberate unscheduled séance unpaired when the class already has one", () => {
    const slots = slotsForDay([session("s1", 600), session("s2")], [entry("e1", 600)], DAY);
    expect(slots).toEqual([
      { date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" },
      { date: DAY, startsAt: null, sessionId: "s2", entryId: null },
    ]);
  });

  it("does not pair two séances with one lesson", () => {
    const slots = slotsForDay([session("s1", 600), session("s2", 600)], [entry("e1", 600)], DAY);
    expect(slots).toHaveLength(2);
    expect(slots.filter((s) => s.entryId === "e1")).toHaveLength(1);
  });
});

describe("resolveSlot", () => {
  const slots: Slot[] = [
    { date: DAY, startsAt: 600, sessionId: "s1", entryId: "e1" },
    { date: DAY, startsAt: 840, sessionId: null, entryId: "e2" },
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

  it("finds an untimed slot when one is asked for", () => {
    const withUntimed = [...slots, { date: DAY, startsAt: null, sessionId: "s3", entryId: null }];
    expect(resolveSlot(withUntimed, { startsAt: null })?.sessionId).toBe("s3");
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
