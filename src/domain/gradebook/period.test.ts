import { DEFAULT_PERIOD_NAMES, nextPeriodOrder } from "./period";

describe("DEFAULT_PERIOD_NAMES", () => {
  it("is the three trimesters, in order", () => {
    expect(DEFAULT_PERIOD_NAMES).toEqual(["Trimestre 1", "Trimestre 2", "Trimestre 3"]);
  });
});

describe("nextPeriodOrder", () => {
  it("starts at 0 when there is no period yet", () => {
    expect(nextPeriodOrder([])).toBe(0);
  });

  it("appends after the last period", () => {
    expect(nextPeriodOrder([{ order: 0 }, { order: 1 }, { order: 2 }])).toBe(3);
  });

  it("appends after the highest order, not after the count", () => {
    // Deleting a period in the middle leaves a gap; counting would hand out an
    // order that is already taken and make the switcher's ordering arbitrary.
    expect(nextPeriodOrder([{ order: 0 }, { order: 5 }])).toBe(6);
  });

  it("ignores the order the periods are given in", () => {
    expect(nextPeriodOrder([{ order: 2 }, { order: 0 }])).toBe(3);
  });
});
