import { ATTENDANCE_VALUES, parseAttendanceValue } from "./attendance";

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
});
