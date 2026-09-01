import { formatGradeValue, gradeValueSchema, isBlankInput, parseGradeValue } from "./grade";

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

  it("accepts a numeric grade equal to max", () => {
    expect(parseGradeValue("numeric", "20", 20)).toEqual({
      type: "numeric",
      value: 20,
    });
  });

  it("rejects a numeric grade above max", () => {
    expect(parseGradeValue("numeric", "314", 20)).toBeNull();
  });

  it("accepts a numeric grade above 20 when no max is given", () => {
    expect(parseGradeValue("numeric", "25")).toEqual({
      type: "numeric",
      value: 25,
    });
  });
});

describe("isBlankInput", () => {
  it("treats an empty string as blank", () => {
    expect(isBlankInput("")).toBe(true);
  });

  it("treats whitespace-only input as blank", () => {
    expect(isBlankInput("   ")).toBe(true);
  });

  it("treats undefined as blank", () => {
    expect(isBlankInput(undefined)).toBe(true);
  });

  it("treats null as blank", () => {
    expect(isBlankInput(null)).toBe(true);
  });

  it('does not treat "0" as blank', () => {
    expect(isBlankInput("0")).toBe(false);
  });
});

describe("parseGradeValue and isBlankInput agree on what is blank", () => {
  it.each(["", "   ", "\t\n"])("treats %j as blank for every non-checkbox type", (raw) => {
    expect(isBlankInput(raw)).toBe(true);
    expect(parseGradeValue("numeric", raw)).toBeNull();
    expect(parseGradeValue("text", raw)).toBeNull();
    expect(parseGradeValue("letter", raw)).toBeNull();
    expect(parseGradeValue("attendance", raw)).toBeNull();
  });

  it.each(["0", " 12 ", "A"])("treats %j as non-blank", (raw) => {
    expect(isBlankInput(raw)).toBe(false);
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

  it("uses the given locale's decimal separator", () => {
    expect(formatGradeValue({ type: "numeric", value: 13.4 }, 20, "fr")).toBe("13,4/20");
    expect(formatGradeValue({ type: "numeric", value: 13.4 }, 20, "en")).toBe("13.4/20");
  });

  it("defaults to French when no locale is given", () => {
    expect(formatGradeValue({ type: "numeric", value: 13.4 })).toBe("13,4");
  });

  it("renders a checkbox as a mark", () => {
    expect(formatGradeValue({ type: "checkbox", value: true })).toBe("✓");
    expect(formatGradeValue({ type: "checkbox", value: false })).toBe("✗");
  });
});
