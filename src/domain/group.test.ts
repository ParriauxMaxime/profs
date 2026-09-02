import {
  filterByGroup,
  groupsForStudent,
  MAX_GROUP_NAME,
  normaliseGroupName,
  resolveGroupSelection,
} from "./group";

describe("normaliseGroupName", () => {
  it("trims surrounding whitespace", () => {
    expect(normaliseGroupName("  Groupe A  ")).toBe("Groupe A");
  });

  it("truncates at 40 characters", () => {
    const long = "a".repeat(50);
    const result = normaliseGroupName(long);
    expect(result).toHaveLength(MAX_GROUP_NAME);
    expect(result).toBe("a".repeat(MAX_GROUP_NAME));
  });
});

describe("groupsForStudent", () => {
  const groups = [
    { id: "g1", name: "Groupe A" },
    { id: "g2", name: "Groupe B" },
    { id: "g3", name: "Groupe C" },
  ];

  it("returns only the given pupil's groups, in the given order", () => {
    const memberships = [
      { groupId: "g3", studentId: "s1" },
      { groupId: "g1", studentId: "s1" },
      { groupId: "g2", studentId: "s2" },
    ];
    expect(groupsForStudent(groups, memberships, "s1")).toEqual([groups[0], groups[2]]);
  });

  it("returns an empty array when the pupil belongs to no group", () => {
    const memberships = [{ groupId: "g1", studentId: "s2" }];
    expect(groupsForStudent(groups, memberships, "s1")).toEqual([]);
  });
});

describe("resolveGroupSelection", () => {
  const groups = [{ id: "g1" }, { id: "g2" }];

  it("keeps the selection when it names an existing group", () => {
    expect(resolveGroupSelection(groups, "g2")).toBe("g2");
  });

  it("falls back to null when the selected group is gone", () => {
    expect(resolveGroupSelection(groups, "gone")).toBeNull();
  });

  it("passes null through as-is", () => {
    expect(resolveGroupSelection(groups, null)).toBeNull();
  });
});

describe("filterByGroup", () => {
  const students = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const memberships = [
    { groupId: "g1", studentId: "s1" },
    { groupId: "g1", studentId: "s3" },
  ];

  it("returns only members of the given group", () => {
    expect(filterByGroup(students, memberships, "g1")).toEqual([students[0], students[2]]);
  });

  it("returns every student when the group id is null", () => {
    expect(filterByGroup(students, memberships, null)).toEqual(students);
  });

  it("returns an empty array for a group with no members", () => {
    expect(filterByGroup(students, memberships, "g2")).toEqual([]);
  });
});
