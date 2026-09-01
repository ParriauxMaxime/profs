import { formatGradeValue, gradeValueSchema, parseGradeValue } from "./grade";

describe("parseGradeValue", () => {
  it("parses a numeric grade from a string", () => {
    expect(parseGradeValue("numeric", "14.5")).toEqual({
      type: "numeric",
      value: 14.5,
    });
  });

  it("accepts a comma decimal separator", () => {
    expect(parseGradeValue("numeric", "11,5")).toEqual({
      type: "numeric",
      value: 11.5,
    });
  });

  it("rejects a non-numeric string for a numeric column", () => {
    expect(parseGradeValue("numeric", "abs")).toBeNull();
  });

  it("rejects a negative numeric grade", () => {
    expect(parseGradeValue("numeric", "-3")).toBeNull();
  });

  it("treats an empty string as no value", () => {
    expect(parseGradeValue("numeric", "")).toBeNull();
    expect(parseGradeValue("text", "   ")).toBeNull();
  });

  it("parses a checkbox value", () => {
    expect(parseGradeValue("checkbox", true)).toEqual({
      type: "checkbox",
      value: true,
    });
  });

  it("parses a known attendance value", () => {
    expect(parseGradeValue("attendance", "absent")).toEqual({
      type: "attendance",
      value: "absent",
    });
  });

  it("rejects an unknown attendance value", () => {
    expect(parseGradeValue("attendance", "sick")).toBeNull();
  });

  it("uppercases a letter grade and trims it", () => {
    expect(parseGradeValue("letter", " a+ ")).toEqual({
      type: "letter",
      value: "A+",
    });
  });
});

describe("gradeValueSchema", () => {
  it("accepts a well-formed value", () => {
    expect(gradeValueSchema.safeParse({ type: "numeric", value: 12 }).success).toBe(true);
  });

  it("rejects a mismatched payload", () => {
    expect(gradeValueSchema.safeParse({ type: "numeric", value: "12" }).success).toBe(false);
  });
});

describe("formatGradeValue", () => {
  it("shows a numeric grade against its max", () => {
    expect(formatGradeValue({ type: "numeric", value: 14.5 }, 20)).toBe("14,5/20");
  });

  it("drops a trailing zero decimal", () => {
    expect(formatGradeValue({ type: "numeric", value: 14 }, 20)).toBe("14/20");
  });

  it("renders a checkbox as a mark", () => {
    expect(formatGradeValue({ type: "checkbox", value: true })).toBe("✓");
    expect(formatGradeValue({ type: "checkbox", value: false })).toBe("✗");
  });
});
