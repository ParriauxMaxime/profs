import { extractRoster, findDuplicates, parseCsv, sniffDelimiter } from "./csv";

describe("sniffDelimiter", () => {
  it("detects semicolons, as French Excel exports them", () => {
    expect(sniffDelimiter("Nom;Prénom\nDupont;Marie")).toBe(";");
  });

  it("detects commas", () => {
    expect(sniffDelimiter("Nom,Prénom\nDupont,Marie")).toBe(",");
  });

  it("detects tabs, as a spreadsheet paste produces them", () => {
    expect(sniffDelimiter("Nom\tPrénom\nDupont\tMarie")).toBe("\t");
  });

  it("picks the delimiter that yields the most consistent column count", () => {
    // Commas appear inside a field, semicolons are the real separator.
    expect(sniffDelimiter("Nom;Remarque\nDupont;bon, sérieux\nMartin;lent, appliqué")).toBe(";");
  });

  it("falls back to a comma for a single-column file", () => {
    expect(sniffDelimiter("Dupont\nMartin")).toBe(",");
  });
});

describe("parseCsv", () => {
  it("splits rows and fields", () => {
    expect(parseCsv("a;b\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a delimiter inside a quoted field", () => {
    expect(parseCsv('a;"b;c"', ";")).toEqual([["a", "b;c"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('a;"say ""hi"""', ";")).toEqual([["a", 'say "hi"']]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a;b\r\nc;d", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a;b\n\nc;d\n", ";")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("trims surrounding whitespace on unquoted fields", () => {
    expect(parseCsv(" a ; b ", ";")).toEqual([["a", "b"]]);
  });

  it("preserves surrounding whitespace inside quoted fields", () => {
    expect(parseCsv('a;" b "', ";")).toEqual([["a", " b "]]);
  });

  it("trims unquoted fields while preserving whitespace in quoted fields on the same row", () => {
    expect(parseCsv(' a ;" b "; c ', ";")).toEqual([["a", " b ", "c"]]);
  });
});

describe("extractRoster", () => {
  const rows = [
    ["Nom", "Prénom", "Classe"],
    ["Dupont", "Marie", "3B"],
    ["Nguyen", "Léa", "3B"],
  ];

  it("maps the named columns and skips the header", () => {
    expect(extractRoster(rows, { lastName: 0, firstName: 1, skipFirstRow: true })).toEqual([
      { lastName: "Dupont", firstName: "Marie" },
      { lastName: "Nguyen", firstName: "Léa" },
    ]);
  });

  it("keeps the first row when it is data, not a header", () => {
    const result = extractRoster(rows, { lastName: 0, firstName: 1, skipFirstRow: false });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lastName: "Nom", firstName: "Prénom" });
  });

  it("drops rows where both names are empty", () => {
    const withBlank = [
      ["Dupont", "Marie"],
      ["", ""],
      ["Nguyen", "Léa"],
    ];
    expect(
      extractRoster(withBlank, { lastName: 0, firstName: 1, skipFirstRow: false }),
    ).toHaveLength(2);
  });

  it("keeps a row with only a last name", () => {
    const partial = [["Dupont", ""]];
    expect(extractRoster(partial, { lastName: 0, firstName: 1, skipFirstRow: false })).toEqual([
      { lastName: "Dupont", firstName: "" },
    ]);
  });

  it("tolerates a row shorter than the mapping", () => {
    const short = [["Dupont"]];
    expect(extractRoster(short, { lastName: 0, firstName: 1, skipFirstRow: false })).toEqual([
      { lastName: "Dupont", firstName: "" },
    ]);
  });
});

describe("findDuplicates", () => {
  const existing = [{ lastName: "Dupont", firstName: "Marie" }];

  it("flags an incoming row already present, ignoring case and accents", () => {
    const incoming = [
      { lastName: "DUPONT", firstName: "marie" },
      { lastName: "Nguyen", firstName: "Léa" },
    ];
    expect(findDuplicates(incoming, existing)).toEqual([0]);
  });

  it("flags a duplicate inside the incoming batch itself", () => {
    const incoming = [
      { lastName: "Nguyen", firstName: "Léa" },
      { lastName: "Nguyen", firstName: "Léa" },
    ];
    expect(findDuplicates(incoming, [])).toEqual([1]);
  });

  it("returns an empty list when everything is new", () => {
    expect(findDuplicates([{ lastName: "Nguyen", firstName: "Léa" }], existing)).toEqual([]);
  });
});
