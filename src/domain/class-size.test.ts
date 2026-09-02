import { classesOverCapacity, MAX_STUDENTS_PER_CLASS, remainingCapacity } from "./class-size";

describe("remainingCapacity", () => {
  it("is the whole ceiling for an empty class", () => {
    expect(remainingCapacity(0)).toBe(MAX_STUDENTS_PER_CLASS);
  });

  it("is one place at the last free seat", () => {
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS - 1)).toBe(1);
  });

  it("is zero exactly at the ceiling, not negative", () => {
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS)).toBe(0);
  });

  it("never reports a negative number for a class already over the ceiling", () => {
    // A workspace can hold an over-capacity class only if it predates this
    // rule. The UI must read "0 places left", never "-5 places left".
    expect(remainingCapacity(MAX_STUDENTS_PER_CLASS + 5)).toBe(0);
  });
});

describe("classesOverCapacity", () => {
  function roster(classId: string, count: number): { classId: string }[] {
    return Array.from({ length: count }, () => ({ classId }));
  }

  it("finds nothing in an empty roster", () => {
    expect(classesOverCapacity([])).toEqual([]);
  });

  it("accepts a class sitting exactly on the ceiling", () => {
    expect(classesOverCapacity(roster("c1", MAX_STUDENTS_PER_CLASS))).toEqual([]);
  });

  it("reports a class one pupil over the ceiling", () => {
    expect(classesOverCapacity(roster("c1", MAX_STUDENTS_PER_CLASS + 1))).toEqual(["c1"]);
  });

  it("counts each class separately and reports only the offenders", () => {
    const students = [
      ...roster("small", 30),
      ...roster("big", MAX_STUDENTS_PER_CLASS + 1),
      ...roster("huge", MAX_STUDENTS_PER_CLASS + 40),
    ];
    expect(classesOverCapacity(students).sort()).toEqual(["big", "huge"]);
  });
});
