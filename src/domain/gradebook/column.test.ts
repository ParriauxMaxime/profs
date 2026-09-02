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
});
