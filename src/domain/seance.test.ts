import { resolveSlot, type Slot, slotsForDay } from "./seance";

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
