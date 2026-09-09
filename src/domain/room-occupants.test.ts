import { NAMED_OCCUPANTS, summariseOccupants } from "./room-occupants";

describe("summariseOccupants", () => {
  it("names every class when there are few enough", () => {
    expect(summariseOccupants(["3°B", "5°A"])).toEqual({ named: ["3°B", "5°A"], rest: 0 });
  });

  it("names no class, and counts none, for an empty salle", () => {
    expect(summariseOccupants([])).toEqual({ named: [], rest: 0 });
  });

  it("names the cap exactly, without a remainder, at the boundary", () => {
    const names = ["6°A", "5°A", "4°A"];
    expect(summariseOccupants(names)).toEqual({ named: ["4°A", "5°A", "6°A"], rest: 0 });
  });

  it("counts everything past the cap", () => {
    // The music teacher's salle: sixteen classes, of which a card names three.
    const names = Array.from({ length: 16 }, (_, i) => `c${String(i).padStart(2, "0")}`);
    const summary = summariseOccupants(names);
    expect(summary.named).toHaveLength(NAMED_OCCUPANTS);
    expect(summary.rest).toBe(16 - NAMED_OCCUPANTS);
  });

  it("sorts, so which classes a card names does not depend on plan order", () => {
    // `plansForRoom` returns creation order, so an unsorted cap would name
    // three arbitrary classes and change them when a plan is added.
    const a = summariseOccupants(["5°C", "3°A", "6°B", "4°D"]);
    const b = summariseOccupants(["4°D", "6°B", "3°A", "5°C"]);
    expect(a).toEqual(b);
    expect(a.named).toEqual(["3°A", "4°D", "5°C"]);
  });

  it("does not mutate the caller's list", () => {
    const names = ["5°A", "3°B"];
    summariseOccupants(names);
    expect(names).toEqual(["5°A", "3°B"]);
  });

  it("ignores accents and case, the way the room list does", () => {
    expect(summariseOccupants(["école", "Ãtelier"]).named).toEqual(["Ãtelier", "école"]);
  });
});
