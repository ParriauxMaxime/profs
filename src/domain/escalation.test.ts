import {
  clampRule,
  DEFAULT_ESCALATION,
  escalationWindow,
  isEscalated,
  yellowsInWindow,
} from "./escalation";

/** Three séances of one class, one per day, in the order they were taught. */
const SEANCES = [
  { id: "s1", date: 100, startsAt: 480 },
  { id: "s2", date: 200, startsAt: 480 },
  { id: "s3", date: 300, startsAt: 480 },
];

const RULE = DEFAULT_ESCALATION;

describe("escalationWindow", () => {
  it("ends at the séance on screen and counts it", () => {
    expect(escalationWindow(SEANCES, "s3", RULE)).toEqual(["s2", "s3"]);
  });

  it("orders by date then startsAt, not by input order", () => {
    const shuffled = [
      { id: "late", date: 100, startsAt: 600 },
      { id: "early", date: 100, startsAt: 480 },
    ];
    expect(escalationWindow(shuffled, "late", RULE)).toEqual(["early", "late"]);
  });

  it("stops at the start of history rather than padding", () => {
    expect(escalationWindow(SEANCES, "s1", { ...RULE, seances: 4 })).toEqual(["s1"]);
  });

  it("is empty when no séance exists yet", () => {
    expect(escalationWindow(SEANCES, null, RULE)).toEqual([]);
  });

  it("is empty for a séance that is not in the list", () => {
    expect(escalationWindow(SEANCES, "ghost", RULE)).toEqual([]);
  });
});

describe("yellowsInWindow", () => {
  const events = [
    { sessionId: "s1", type: "yellow" as const },
    { sessionId: "s1", type: "green" as const },
    { sessionId: "s2", type: "yellow" as const },
    { sessionId: "s2", type: "yellow" as const },
    { sessionId: "s3", type: "red" as const },
  ];

  it("keeps only yellows inside the window", () => {
    expect(yellowsInWindow(events, ["s2", "s3"])).toEqual([
      { sessionId: "s2", type: "yellow" },
      { sessionId: "s2", type: "yellow" },
    ]);
  });

  it("counts several yellows from one séance separately", () => {
    expect(yellowsInWindow(events, ["s2"])).toHaveLength(2);
  });

  it("drops a yellow from the séance just outside the window", () => {
    expect(yellowsInWindow(events, ["s2", "s3"]).some((e) => e.sessionId === "s1")).toBe(false);
  });
});

describe("isEscalated", () => {
  it("fires at exactly Y", () => {
    expect(isEscalated(2, RULE)).toBe(true);
  });

  it("does not fire below Y", () => {
    expect(isEscalated(1, RULE)).toBe(false);
  });

  it("stays true above Y — the window slides, it does not reset", () => {
    expect(isEscalated(5, RULE)).toBe(true);
  });

  it("never fires while the rule is off", () => {
    expect(isEscalated(9, { ...RULE, enabled: false })).toBe(false);
  });
});

describe("clampRule", () => {
  it("refuses a one-yellow rule, which would rename the button", () => {
    expect(clampRule({ enabled: true, seances: 2, yellows: 1 }).yellows).toBe(2);
  });

  it("refuses a window of zero séances", () => {
    expect(clampRule({ enabled: true, seances: 0, yellows: 2 }).seances).toBe(1);
  });

  it("caps both ends and truncates a fractional value", () => {
    expect(clampRule({ enabled: true, seances: 99, yellows: 3.7 })).toEqual({
      enabled: true,
      seances: 10,
      yellows: 3,
    });
  });

  it("falls back to the floor for a value that is not a number", () => {
    expect(clampRule({ enabled: true, seances: Number.NaN, yellows: 2 }).seances).toBe(1);
  });
});
