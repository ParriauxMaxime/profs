import { groupsForStudent, MAX_GROUP_NAME, normaliseGroupName } from "./group";

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
