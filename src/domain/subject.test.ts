import { DEFAULT_SUBJECT_COLOR, isSubjectColor, SUBJECT_COLORS } from "./subject";

describe("subject colour palette", () => {
  it("offers several colours", () => {
    expect(SUBJECT_COLORS.length).toBeGreaterThanOrEqual(6);
  });

  it("holds only lowercase six-digit hex values", () => {
    for (const color of SUBJECT_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has no duplicates", () => {
    expect(new Set(SUBJECT_COLORS).size).toBe(SUBJECT_COLORS.length);
  });

  it("defaults to a colour that is in the palette", () => {
    expect(SUBJECT_COLORS).toContain(DEFAULT_SUBJECT_COLOR);
  });

  it("keeps the colours the demo school was seeded with", () => {
    // Changing these would make the seeded subjects the odd ones out in the
    // palette, with no swatch matching their stored colour.
    expect(SUBJECT_COLORS).toContain("#2563eb");
    expect(SUBJECT_COLORS).toContain("#16a34a");
  });

  it("recognises a palette colour and rejects anything else", () => {
    expect(isSubjectColor(SUBJECT_COLORS[0])).toBe(true);
    expect(isSubjectColor("#123456")).toBe(false);
    expect(isSubjectColor("")).toBe(false);
  });
});
