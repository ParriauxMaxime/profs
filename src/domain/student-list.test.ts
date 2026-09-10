import { compareStudents, neighbours, studentSequence } from "./student-list";

const pupil = (
  id: string,
  lastName: string,
  firstName: string,
  classId = "c1",
  classLabel = "3°B",
) => ({
  id,
  lastName,
  firstName,
  classId,
  classLabel,
});

const roster = [
  pupil("s1", "Bernard", "Adam"),
  pupil("s2", "Chevalier", "Éloïse"),
  pupil("s3", "Abadie", "Zoé"),
];

describe("compareStudents", () => {
  it("falls back to surname order when nothing is sorted", () => {
    const sorted = [...roster].sort((a, b) => compareStudents(a, b, []));
    expect(sorted.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
  });

  it("sorts by the named column, descending when asked", () => {
    const sorted = [...roster].sort((a, b) =>
      compareStudents(a, b, [{ id: "firstName", desc: true }]),
    );
    expect(sorted.map((s) => s.firstName)).toEqual(["Zoé", "Éloïse", "Adam"]);
  });

  // A surname sort that puts Éloïse after Z is a sort a French teacher reads
  // as broken. `Intl.Collator` is what the tables are given too, so the arrows
  // and the rows cannot disagree.
  it("orders accents where French expects them", () => {
    const names = [pupil("a", "Zaza", "z"), pupil("b", "Élan", "e"), pupil("c", "Eau", "e")];
    const sorted = [...names].sort((a, b) =>
      compareStudents(a, b, [{ id: "lastName", desc: false }]),
    );
    expect(sorted.map((s) => s.lastName)).toEqual(["Eau", "Élan", "Zaza"]);
  });

  it("breaks a tie on the sorted column with the surname", () => {
    const names = [pupil("a", "Zaza", "Léa"), pupil("b", "Abadie", "Léa")];
    const sorted = [...names].sort((a, b) =>
      compareStudents(a, b, [{ id: "firstName", desc: false }]),
    );
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("studentSequence", () => {
  it("is every pupil in surname order with no params", () => {
    expect(studentSequence(roster, [], [], {})).toEqual(["s3", "s1", "s2"]);
  });

  it("narrows to a class", () => {
    const mixed = [...roster, pupil("s4", "Durand", "Léo", "c2", "4°A")];
    expect(studentSequence(mixed, [], [], { classe: "c2" })).toEqual(["s4"]);
  });

  it("narrows to a group", () => {
    const groups = [{ id: "g1" }];
    const memberships = [
      { groupId: "g1", studentId: "s1" },
      { groupId: "g1", studentId: "s3" },
    ];
    expect(studentSequence(roster, groups, memberships, { groupe: "g1" })).toEqual(["s3", "s1"]);
  });

  // A group that EXISTS and is empty resolves to nobody. Inferring existence
  // from membership rows could not tell this apart from a deleted group, and
  // answered it with the whole roster.
  it("narrows to nobody for a group that exists and has no members", () => {
    expect(studentSequence(roster, [{ id: "g1" }], [], { groupe: "g1" })).toEqual([]);
  });

  it("ignores a group that does not exist rather than emptying the list", () => {
    expect(studentSequence(roster, [{ id: "g1" }], [], { groupe: "gone" })).toEqual([
      "s3",
      "s1",
      "s2",
    ]);
  });

  // Same accent-insensitive search the tables run, so a teacher who typed
  // "eloise" and stepped through the results steps through the rows they saw.
  it("narrows by an accent-insensitive query", () => {
    expect(studentSequence(roster, [], [], { q: "eloise" })).toEqual(["s2"]);
  });

  it("searches the class label too", () => {
    const mixed = [...roster, pupil("s4", "Durand", "Léo", "c2", "4°A")];
    expect(studentSequence(mixed, [], [], { q: "4°A" })).toEqual(["s4"]);
  });

  it("applies the sort named in the params", () => {
    expect(studentSequence(roster, [], [], { sort: "firstName", dir: "desc" })).toEqual([
      "s3",
      "s2",
      "s1",
    ]);
  });

  // Resolve or ignore — the rule `?classe` already follows for a deleted
  // class. A URL can name a column that no longer exists.
  it("ignores a sort naming a column that does not exist", () => {
    expect(studentSequence(roster, [], [], { sort: "ghost", dir: "desc" })).toEqual([
      "s3",
      "s1",
      "s2",
    ]);
  });

  it("ignores a class that does not exist rather than emptying the list", () => {
    expect(studentSequence(roster, [], [], { classe: "gone" })).toEqual(["s3", "s1", "s2"]);
  });

  it("ignores a group that does not exist", () => {
    expect(studentSequence(roster, [], [], { groupe: "gone" })).toEqual(["s3", "s1", "s2"]);
  });
});

describe("neighbours", () => {
  const ids = ["s3", "s1", "s2"];

  it("finds the pupil either side, one-based for display", () => {
    expect(neighbours(ids, "s1")).toEqual({
      previousId: "s3",
      nextId: "s2",
      index: 2,
      total: 3,
    });
  });

  it("has no previous at the start and no next at the end", () => {
    expect(neighbours(ids, "s3")).toMatchObject({ previousId: null, nextId: "s1", index: 1 });
    expect(neighbours(ids, "s2")).toMatchObject({ previousId: "s1", nextId: null, index: 3 });
  });

  // A pupil reached from a seat on the plan, or from a link with no params,
  // is walking no list. Drawing arrows there would invent one.
  it("has nothing to say about a pupil outside the list", () => {
    expect(neighbours(ids, "ghost")).toBeNull();
    expect(neighbours([], "s1")).toBeNull();
  });
});
