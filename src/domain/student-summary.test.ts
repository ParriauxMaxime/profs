import type { AttendanceValue } from "./attendance";
import {
  attendanceSummary,
  defaultOpenMonth,
  groupSeancesByMonth,
  lastMarkedPeriod,
  positionOnScale,
} from "./student-summary";

const marks = (...values: AttendanceValue[]) => values.map((value) => ({ value }));

describe("attendanceSummary", () => {
  it("counts each value", () => {
    const summary = attendanceSummary(
      marks("present", "present", "absent", "late", "excused", "excused"),
    );

    expect(summary.counts).toEqual({ present: 2, absent: 1, late: 1, excused: 2 });
    expect(summary.marked).toBe(6);
  });

  // The numerator is présent + en retard + excusé: a late pupil was in the
  // room, and an excused one had a reason. Only an unjustified absence pulls
  // the figure down, which is why the label is "assiduité" and never
  // "présence".
  it("counts only an unjustified absence against the rate", () => {
    const summary = attendanceSummary(marks("present", "late", "excused", "absent"));

    expect(summary.unjustified).toBe(1);
    expect(summary.rate).toBeCloseTo(3 / 4);
  });

  it("reads a fully excused record as complete assiduité", () => {
    expect(attendanceSummary(marks("excused", "excused")).rate).toBe(1);
  });

  // Not 0 %, not 100 %. A séance is created lazily, so nothing marked means
  // nothing is known — printing a percentage would be a claim about lessons
  // the app never saw.
  it("has no rate at all when nothing was marked", () => {
    const summary = attendanceSummary([]);

    expect(summary.rate).toBeNull();
    expect(summary.marked).toBe(0);
    expect(summary.counts).toEqual({ present: 0, absent: 0, late: 0, excused: 0 });
  });

  it("reads a wholly unjustified record as zero", () => {
    expect(attendanceSummary(marks("absent", "absent")).rate).toBe(0);
  });
});

describe("positionOnScale", () => {
  it("places a value between the lowest and the highest", () => {
    const position = positionOnScale(12, [4, 12, 20]);

    expect(position).not.toBeNull();
    expect(position?.min).toBe(4);
    expect(position?.max).toBe(20);
    expect(position?.fraction).toBeCloseTo(0.5);
  });

  it("puts the lowest at 0 and the highest at 1", () => {
    expect(positionOnScale(4, [4, 20])?.fraction).toBe(0);
    expect(positionOnScale(20, [4, 20])?.fraction).toBe(1);
  });

  it("places the class mean on the same scale", () => {
    const position = positionOnScale(8, [4, 8, 20, 20]);

    expect(position?.mean).toBeCloseTo(13);
    expect(position?.meanFraction).toBeCloseTo((13 - 4) / 16);
  });

  // A spread of one is a point, and a point drawn as a scale is a lie about
  // a class.
  it("refuses to draw a scale from fewer than two values", () => {
    expect(positionOnScale(12, [12])).toBeNull();
    expect(positionOnScale(12, [])).toBeNull();
  });

  it("refuses a scale with no width", () => {
    expect(positionOnScale(12, [12, 12, 12])).toBeNull();
  });

  it("clamps a value outside the class spread", () => {
    expect(positionOnScale(2, [4, 20])?.fraction).toBe(0);
    expect(positionOnScale(25, [4, 20])?.fraction).toBe(1);
  });
});

const periods = [
  { id: "t1", order: 0 },
  { id: "t2", order: 1 },
  { id: "t3", order: 2 },
];
const columns = [
  { id: "c1", periodId: "t1" },
  { id: "c2", periodId: "t2" },
  { id: "c3", periodId: "t3" },
];

describe("lastMarkedPeriod", () => {
  // "Where the marking has got to" — in December that is T2, which is the
  // trimestre a conseil is about. It needs no dates, which Period does not
  // carry.
  it("picks the last period by order that holds a marked column", () => {
    expect(lastMarkedPeriod(periods, columns, ["c1", "c2"])).toBe("t2");
  });

  it("ignores order in the input and reads `order`", () => {
    const shuffled = [periods[2], periods[0], periods[1]];
    expect(lastMarkedPeriod(shuffled, columns, ["c1", "c3"])).toBe("t3");
  });

  it("falls back to the first period when nothing is marked at all", () => {
    expect(lastMarkedPeriod(periods, columns, [])).toBe("t1");
  });

  it("ignores a graded column that belongs to no period here", () => {
    expect(lastMarkedPeriod(periods, columns, ["ghost"])).toBe("t1");
  });

  it("has no answer for a carnet with no periods", () => {
    expect(lastMarkedPeriod([], columns, ["c1"])).toBeNull();
  });
});

describe("groupSeancesByMonth", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

  it("groups by calendar month, newest month first", () => {
    const months = groupSeancesByMonth([
      { date: at(2026, 11, 4) },
      { date: at(2026, 10, 18) },
      { date: at(2026, 11, 2) },
    ]);

    expect(months.map((m) => m.key)).toEqual(["2026-11", "2026-10"]);
    expect(months[0].sessions).toHaveLength(2);
    expect(months[1].sessions).toHaveLength(1);
  });

  it("keeps the newest séance first inside a month", () => {
    const months = groupSeancesByMonth([{ date: at(2026, 11, 2) }, { date: at(2026, 11, 4) }]);

    expect(months[0].sessions.map((s) => s.date)).toEqual([at(2026, 11, 4), at(2026, 11, 2)]);
  });

  it("carries the year and the month for the heading", () => {
    const months = groupSeancesByMonth([{ date: at(2027, 0, 9) }]);

    expect(months[0]).toMatchObject({ key: "2027-0", year: 2027, month: 0 });
  });

  it("separates the same month of two years", () => {
    const months = groupSeancesByMonth([{ date: at(2027, 0, 9) }, { date: at(2026, 0, 9) }]);

    expect(months.map((m) => m.key)).toEqual(["2027-0", "2026-0"]);
  });

  it("has nothing to group for a class with no séance", () => {
    expect(groupSeancesByMonth([])).toEqual([]);
  });
});

describe("defaultOpenMonth", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

  it("opens the month we are in", () => {
    const months = groupSeancesByMonth([{ date: at(2026, 11, 4) }, { date: at(2026, 10, 18) }]);

    expect(defaultOpenMonth(months, at(2026, 11, 20))).toBe("2026-11");
  });

  // A page whose only open section is empty reads as a bug. When this month
  // holds no séance — a holiday, or a class not taught since — the most
  // recent month that does is opened instead.
  it("opens the most recent month with a séance when this month has none", () => {
    const months = groupSeancesByMonth([{ date: at(2026, 10, 18) }]);

    expect(defaultOpenMonth(months, at(2026, 11, 20))).toBe("2026-10");
  });

  it("has nothing to open when there is no séance at all", () => {
    expect(defaultOpenMonth([], at(2026, 11, 20))).toBeNull();
  });
});
