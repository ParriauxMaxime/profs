import { columnWidths } from "./table-layout";

describe("columnWidths", () => {
  it("splits equal sizes into equal percentages", () => {
    expect(columnWidths([150, 150, 150])).toEqual(["33.3333%", "33.3333%", "33.3333%"]);
  });

  it("weights columns by their share of the total", () => {
    expect(columnWidths([50, 25, 25])).toEqual(["50.0000%", "25.0000%", "25.0000%"]);
  });

  it("gives a single column the full width", () => {
    expect(columnWidths([150])).toEqual(["100.0000%"]);
  });

  it("returns nothing for no columns", () => {
    expect(columnWidths([])).toEqual([]);
  });

  // A column that declares 0, or a caller that hands us all zeroes, must not
  // produce NaN% — which CSS drops silently, handing the table back to
  // automatic layout and the scroll jitter this whole mechanism exists to
  // prevent.
  it("falls back to equal shares when the sizes sum to zero", () => {
    expect(columnWidths([0, 0])).toEqual(["50.0000%", "50.0000%"]);
  });

  it("never emits NaN for a negative total", () => {
    expect(columnWidths([-10, -10])).toEqual(["50.0000%", "50.0000%"]);
  });
});
