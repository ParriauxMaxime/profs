import { clearActiveRoom, readActiveRoom, resolveActiveRoom, writeActiveRoom } from "./active-room";

beforeEach(() => {
  localStorage.clear();
});

describe("readActiveRoom / writeActiveRoom", () => {
  it("remembers one selection per class", () => {
    writeActiveRoom("class-a", "room-1");
    writeActiveRoom("class-b", "room-2");
    expect(readActiveRoom("class-a")).toBe("room-1");
    expect(readActiveRoom("class-b")).toBe("room-2");
  });

  it("returns null for a class nobody has chosen for", () => {
    expect(readActiveRoom("never-seen")).toBeNull();
  });

  it("overwrites a class's selection without touching the others", () => {
    writeActiveRoom("class-a", "room-1");
    writeActiveRoom("class-b", "room-2");
    writeActiveRoom("class-a", "room-3");
    expect(readActiveRoom("class-a")).toBe("room-3");
    expect(readActiveRoom("class-b")).toBe("room-2");
  });

  it("survives a corrupt store rather than throwing", () => {
    localStorage.setItem("profs-active-room", "not json at all");
    expect(readActiveRoom("class-a")).toBeNull();
    writeActiveRoom("class-a", "room-1");
    expect(readActiveRoom("class-a")).toBe("room-1");
  });

  it("survives a store holding something that is not an object", () => {
    localStorage.setItem("profs-active-room", '"a string"');
    expect(readActiveRoom("class-a")).toBeNull();
  });
});

describe("clearActiveRoom", () => {
  it("forgets one class and leaves the rest", () => {
    writeActiveRoom("class-a", "room-1");
    writeActiveRoom("class-b", "room-2");
    clearActiveRoom("class-a");
    expect(readActiveRoom("class-a")).toBeNull();
    expect(readActiveRoom("class-b")).toBe("room-2");
  });

  it("is a no-op for a class with no selection", () => {
    expect(() => clearActiveRoom("never-seen")).not.toThrow();
  });
});

describe("resolveActiveRoom", () => {
  const rooms = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps a stored id that still exists", () => {
    expect(resolveActiveRoom(rooms, "b")).toBe("b");
  });

  it("falls back to the first when nothing is stored", () => {
    expect(resolveActiveRoom(rooms, null)).toBe("a");
  });

  it("falls back rather than pointing at a room that was deleted", () => {
    // The stored id is a record's identity, not a position. A deleted room
    // must not retarget the selection onto whoever slid into its slot.
    expect(resolveActiveRoom(rooms, "gone")).toBe("a");
  });

  it("resolves to null when the class has no rooms at all", () => {
    expect(resolveActiveRoom([], "b")).toBeNull();
    expect(resolveActiveRoom([], null)).toBeNull();
  });

  it("does not shift when a room before the stored one is removed", () => {
    // "b" stays "b" even though it is now first — the id is what is held.
    expect(resolveActiveRoom([{ id: "b" }, { id: "c" }], "b")).toBe("b");
  });

  it("prefers a salle the class is already seated in over the first one", () => {
    // The bug this exists to prevent: with one salle in the workspace,
    // "the first salle" and "this class's salle" were the same answer, so
    // falling back to rooms[0] was right by accident. With two, a class
    // taught in the second one opened onto the first — and the effect behind
    // the plan then WROTE an empty plan there, making the wrong guess
    // permanent and visible on /salles as a salle used by everybody.
    expect(resolveActiveRoom(rooms, null, ["c"])).toBe("c");
  });

  it("takes the occupied salles in the order given", () => {
    // The caller orders them by how many pupils are actually seated, so a
    // plan created by a mis-resolve — empty, because nobody was ever placed
    // in it — loses to the one the teacher really uses. That is what lets a
    // workspace already holding a spurious plan heal itself rather than
    // needing a re-seed.
    expect(resolveActiveRoom(rooms, null, ["c", "a"])).toBe("c");
  });

  it("ignores an occupied salle that no longer exists", () => {
    expect(resolveActiveRoom(rooms, null, ["gone"])).toBe("a");
  });

  it("still lets a stored choice beat the occupied salles", () => {
    // Picking a salle by hand is the strongest statement there is: a teacher
    // moving 3°B into 102 for one lesson must not be dragged back to the
    // salle their plan happens to be fullest in.
    expect(resolveActiveRoom(rooms, "b", ["c"])).toBe("b");
  });

  it("falls back to the first when the class is seated nowhere", () => {
    expect(resolveActiveRoom(rooms, null, [])).toBe("a");
  });
});
