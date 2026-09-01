import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "./behaviour";

describe("behaviour", () => {
  it("lists the four types, positive first", () => {
    expect(BEHAVIOUR_TYPES).toEqual(["green", "yellow", "red", "note"]);
  });

  it("gives every type a colour", () => {
    for (const type of BEHAVIOUR_TYPES) {
      expect(BEHAVIOUR_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("counts events by type", () => {
    expect(countByType([{ type: "yellow" }, { type: "yellow" }, { type: "red" }])).toEqual({
      green: 0,
      yellow: 2,
      red: 1,
      note: 0,
    });
  });

  it("counts an empty list as all zero", () => {
    expect(countByType([])).toEqual({ green: 0, yellow: 0, red: 0, note: 0 });
  });
});
