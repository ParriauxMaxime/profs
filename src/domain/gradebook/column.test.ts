import { COLUMN_TYPES, isNumericColumn } from "./column";

describe("isNumericColumn", () => {
  it("is true only for numeric columns", () => {
    for (const type of COLUMN_TYPES) {
      expect(isNumericColumn(type)).toBe(type === "numeric");
    }
  });

  it("is false for a calculation column, which never enters an average", () => {
    expect(isNumericColumn("calculation")).toBe(false);
  });

  it("keeps a rubric column out of every average", () => {
    // A level is not a mark. This is the invariant the whole design rests on:
    // studentAverage only ever sees numeric columns.
    expect(isNumericColumn("rubric")).toBe(false);
  });
});
