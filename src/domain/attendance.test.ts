import { ATTENDANCE_VALUES, DEFAULT_ATTENDANCE, parseAttendanceValue } from "./attendance";

describe("attendance", () => {
  it("lists the four values", () => {
    expect(ATTENDANCE_VALUES).toEqual(["present", "absent", "late", "excused"]);
  });

  it("defaults to present", () => {
    expect(DEFAULT_ATTENDANCE).toBe("present");
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
