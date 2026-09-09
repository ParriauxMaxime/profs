import { paramsFromSorting, sortingFromParams } from "./table-sort";

const COLUMNS = ["lastName", "firstName", "classLabel"];

describe("sortingFromParams", () => {
  it("reads a column and an ascending direction", () => {
    expect(sortingFromParams("lastName", "asc", COLUMNS)).toEqual([
      { id: "lastName", desc: false },
    ]);
  });

  it("reads a descending direction", () => {
    expect(sortingFromParams("lastName", "desc", COLUMNS)).toEqual([
      { id: "lastName", desc: true },
    ]);
  });

  it("defaults to ascending when no direction is given", () => {
    expect(sortingFromParams("firstName", undefined, COLUMNS)).toEqual([
      { id: "firstName", desc: false },
    ]);
  });

  it("treats an unrecognised direction as ascending", () => {
    expect(sortingFromParams("firstName", "sideways", COLUMNS)).toEqual([
      { id: "firstName", desc: false },
    ]);
  });

  it("sorts by nothing when no column is named", () => {
    expect(sortingFromParams(undefined, "desc", COLUMNS)).toEqual([]);
  });

  // The load-bearing case. A URL can name a column that does not exist — hand
  // -edited, or bookmarked before a column was renamed or removed. Trusting it
  // would hand TanStack a sort on a phantom column; falling back to the
  // default order is the same rule `?classe` follows for a deleted class.
  it("falls back to the default order when the column is unknown", () => {
    expect(sortingFromParams("shoeSize", "desc", COLUMNS)).toEqual([]);
  });

  it("falls back to the default order when the column list is empty", () => {
    expect(sortingFromParams("lastName", "asc", [])).toEqual([]);
  });

  it("does not match a column by a prefix of its name", () => {
    expect(sortingFromParams("last", "asc", COLUMNS)).toEqual([]);
  });
});

describe("paramsFromSorting", () => {
  it("names the column and the direction", () => {
    expect(paramsFromSorting([{ id: "lastName", desc: true }])).toEqual({
      sort: "lastName",
      dir: "desc",
    });
  });

  it("spells an ascending sort out rather than omitting it", () => {
    expect(paramsFromSorting([{ id: "lastName", desc: false }])).toEqual({
      sort: "lastName",
      dir: "asc",
    });
  });

  // Both params must go, not just one. A leftover `dir` on a URL with no
  // `sort` is a param that reads as state and controls nothing.
  it("drops both params when nothing is sorted", () => {
    expect(paramsFromSorting([])).toEqual({ sort: undefined, dir: undefined });
  });

  // Every table here sorts by one column; the URL describes the sort a
  // teacher can actually produce, and the first entry is the active one.
  it("names only the first column when several are sorted", () => {
    expect(
      paramsFromSorting([
        { id: "lastName", desc: false },
        { id: "firstName", desc: true },
      ]),
    ).toEqual({ sort: "lastName", dir: "asc" });
  });
});

describe("sortingFromParams and paramsFromSorting", () => {
  it("round-trips a sort through the URL and back", () => {
    const sorting = [{ id: "classLabel", desc: true }];
    const { sort, dir } = paramsFromSorting(sorting);
    expect(sortingFromParams(sort, dir, COLUMNS)).toEqual(sorting);
  });

  it("round-trips the unsorted state", () => {
    const { sort, dir } = paramsFromSorting([]);
    expect(sortingFromParams(sort, dir, COLUMNS)).toEqual([]);
  });
});
