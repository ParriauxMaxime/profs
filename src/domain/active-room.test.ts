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
});
