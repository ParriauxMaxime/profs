import type { AttendanceValue } from "./attendance";
import { attendanceSummary, positionOnScale } from "./student-summary";

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
