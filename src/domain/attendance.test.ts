import { ATTENDANCE_COLORS, ATTENDANCE_VALUES, parseAttendanceValue } from "./attendance";

describe("attendance", () => {
  it("lists the four values", () => {
    expect(ATTENDANCE_VALUES).toEqual(["present", "absent", "late", "excused"]);
  });

  it("parses a known value", () => {
    expect(parseAttendanceValue("absent")).toBe("absent");
  });

  it("refuses an unknown value", () => {
    expect(parseAttendanceValue("sick")).toBeNull();
    expect(parseAttendanceValue("")).toBeNull();
    expect(parseAttendanceValue(undefined)).toBeNull();
  });

  it("gives every value a colour, as a token rather than a literal", () => {
    for (const value of ATTENDANCE_VALUES) {
      expect(ATTENDANCE_COLORS[value]).toMatch(/^var\(--attendance-[a-z]+\)$/);
    }
  });
});
