import { gridWindow, layoutDay } from "./timetable";

/** A lesson, as the grid sees one: two times and nothing else. */
const at = (start: string, end: string) => {
  const m = (hm: string): number => {
    const [h, min] = hm.split(":").map(Number);
    return (h ?? 0) * 60 + (min ?? 0);
  };
  return { startMinute: m(start), endMinute: m(end) };
};

describe("gridWindow", () => {
  it("is 7h–19h for an ordinary week", () => {
    expect(gridWindow([at("08:00", "08:55"), at("13:00", "13:55")])).toEqual({
      start: 7 * 60,
      end: 19 * 60,
    });
  });

  it("is 7h–19h for an empty week", () => {
    expect(gridWindow([])).toEqual({ start: 7 * 60, end: 19 * 60 });
  });

  it("opens down to the whole hour below an early lesson", () => {
    expect(gridWindow([at("06:30", "07:25")])).toEqual({ start: 6 * 60, end: 19 * 60 });
  });

  it("opens up to the whole hour above a late lesson", () => {
    expect(gridWindow([at("18:00", "19:30")])).toEqual({ start: 7 * 60, end: 20 * 60 });
  });

  it("leaves a lesson ending exactly on the hour alone", () => {
    // 19:00 is the window's own edge. Widening to 20h would draw an empty
    // hour under it every time a teacher finishes at seven.
    expect(gridWindow([at("18:00", "19:00")])).toEqual({ start: 7 * 60, end: 19 * 60 });
  });
});

describe("layoutDay", () => {
  it("gives a lesson with no neighbour the full column", () => {
    const [only] = layoutDay([at("08:00", "08:55")]);
    expect([only?.column, only?.columns]).toEqual([0, 1]);
  });

  it("keeps consecutive lessons full width", () => {
    // 08:55 → 09:00 touch but do not overlap, the normal shape of a
    // timetable. Splitting the column here would halve every block in the app.
    const placed = layoutDay([at("08:00", "08:55"), at("09:00", "09:55")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("puts two lessons at the same hour side by side", () => {
    // A semaine-A lesson and a semaine-B one at 13h, or a genuine clash.
    const placed = layoutDay([at("13:00", "13:55"), at("13:00", "13:55")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("splits a partial overlap", () => {
    const placed = layoutDay([at("08:00", "09:00"), at("08:30", "09:30")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("reuses a column freed by an earlier lesson", () => {
    // 8–9 and 9–10 never meet, so the third lesson takes the first's column
    // and the cluster is two wide, not three.
    const placed = layoutDay([at("08:00", "09:00"), at("08:00", "10:00"), at("09:00", "10:00")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
    ]);
  });

  it("does not widen a lesson that only shares a cluster transitively", () => {
    // A meets B, B meets C, but A never meets C. All three are one cluster
    // and all three are two wide — a block whose width changed halfway down
    // the cluster would not line up with anything.
    const placed = layoutDay([at("08:00", "09:00"), at("08:30", "09:30"), at("09:00", "10:00")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
    ]);
  });

  it("keeps separate clusters independent", () => {
    const placed = layoutDay([at("08:00", "08:55"), at("08:00", "08:55"), at("10:00", "10:55")]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  it("returns the lessons in time order whatever order they arrive in", () => {
    const placed = layoutDay([at("10:00", "10:55"), at("08:00", "08:55")]);
    expect(placed.map((p) => p.entry.startMinute)).toEqual([8 * 60, 10 * 60]);
  });

  it("carries the whole entry through", () => {
    const entry = { ...at("08:00", "08:55"), id: "e1" };
    expect(layoutDay([entry])[0]?.entry).toBe(entry);
  });

  it("handles an empty day", () => {
    expect(layoutDay([])).toEqual([]);
  });
});
