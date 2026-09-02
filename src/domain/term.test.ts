import {
  fromDateInputValue,
  readTermStart,
  startOfDay,
  TERM_START_STORAGE_KEY,
  toDateInputValue,
  writeTermStart,
} from "./term";

beforeEach(() => {
  localStorage.clear();
});

describe("readTermStart", () => {
  it("is null until a term start is set", () => {
    expect(readTermStart()).toBeNull();
  });

  it("round-trips a written date", () => {
    const day = new Date(2026, 8, 1, 14, 30).getTime();
    writeTermStart(day);

    expect(readTermStart()).toBe(startOfDay(day));
  });

  it("normalises to local midnight, so the hour it was set does not matter", () => {
    writeTermStart(new Date(2026, 8, 1, 23, 59).getTime());
    const late = readTermStart();
    localStorage.clear();
    writeTermStart(new Date(2026, 8, 1, 0, 1).getTime());

    expect(readTermStart()).toBe(late);
  });

  it("returns null rather than NaN for a corrupted value", () => {
    localStorage.setItem(TERM_START_STORAGE_KEY, "not a date");

    expect(readTermStart()).toBeNull();
  });
});

describe("writeTermStart", () => {
  it("clears the anchor when passed null", () => {
    writeTermStart(new Date(2026, 8, 1).getTime());
    writeTermStart(null);

    expect(readTermStart()).toBeNull();
  });
});

describe("date input conversion", () => {
  it("round-trips through a date input's value", () => {
    const day = new Date(2026, 8, 1).getTime();

    expect(toDateInputValue(day)).toBe("2026-09-01");
    expect(fromDateInputValue("2026-09-01")).toBe(day);
  });

  it("reads the input as a LOCAL day, not as UTC", () => {
    // `new Date("2026-09-01")` is UTC midnight — the previous day west of
    // Greenwich. That would move the anchor into the week before and invert
    // every A and B for the year.
    const parsed = fromDateInputValue("2026-09-01");
    expect(parsed).not.toBeNull();
    const d = new Date(parsed as number);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 1]);
  });

  it("pads single-digit months and days", () => {
    expect(toDateInputValue(new Date(2027, 0, 5).getTime())).toBe("2027-01-05");
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(fromDateInputValue("")).toBeNull();
    expect(fromDateInputValue("01/09/2026")).toBeNull();
  });
});
