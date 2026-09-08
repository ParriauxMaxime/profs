import {
  clearActiveLayout,
  readActiveLayout,
  resolveActiveLayout,
  writeActiveLayout,
} from "./active-layout";

beforeEach(() => {
  localStorage.clear();
});

describe("readActiveLayout / writeActiveLayout", () => {
  it("remembers one selection per class", () => {
    writeActiveLayout("class-a", "layout-1");
    writeActiveLayout("class-b", "layout-2");
    expect(readActiveLayout("class-a")).toBe("layout-1");
    expect(readActiveLayout("class-b")).toBe("layout-2");
  });

  it("returns null for a class nobody has chosen for", () => {
    expect(readActiveLayout("never-seen")).toBeNull();
  });

  it("overwrites a class's selection without touching the others", () => {
    writeActiveLayout("class-a", "layout-1");
    writeActiveLayout("class-b", "layout-2");
    writeActiveLayout("class-a", "layout-3");
    expect(readActiveLayout("class-a")).toBe("layout-3");
    expect(readActiveLayout("class-b")).toBe("layout-2");
  });

  it("survives a corrupt store rather than throwing", () => {
    localStorage.setItem("profs-active-layout", "not json at all");
    expect(readActiveLayout("class-a")).toBeNull();
    writeActiveLayout("class-a", "layout-1");
    expect(readActiveLayout("class-a")).toBe("layout-1");
  });

  it("survives a store holding something that is not an object", () => {
    localStorage.setItem("profs-active-layout", '"a string"');
    expect(readActiveLayout("class-a")).toBeNull();
  });
});

describe("clearActiveLayout", () => {
  it("forgets one class and leaves the rest", () => {
    writeActiveLayout("class-a", "layout-1");
    writeActiveLayout("class-b", "layout-2");
    clearActiveLayout("class-a");
    expect(readActiveLayout("class-a")).toBeNull();
    expect(readActiveLayout("class-b")).toBe("layout-2");
  });

  it("is a no-op for a class with no selection", () => {
    expect(() => clearActiveLayout("never-seen")).not.toThrow();
  });
});

describe("resolveActiveLayout", () => {
  const layouts = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps a stored id that still exists", () => {
    expect(resolveActiveLayout(layouts, "b")).toBe("b");
  });

  it("falls back to the first when nothing is stored", () => {
    expect(resolveActiveLayout(layouts, null)).toBe("a");
  });

  it("falls back rather than pointing at a layout that was deleted", () => {
    // The stored id is a record's identity, not a position. A deleted layout
    // must not retarget the selection onto whoever slid into its slot.
    expect(resolveActiveLayout(layouts, "gone")).toBe("a");
  });

  it("resolves to null when the class has no layouts at all", () => {
    expect(resolveActiveLayout([], "b")).toBeNull();
    expect(resolveActiveLayout([], null)).toBeNull();
  });

  it("does not shift when a layout before the stored one is removed", () => {
    // "b" stays "b" even though it is now first — the id is what is held.
    expect(resolveActiveLayout([{ id: "b" }, { id: "c" }], "b")).toBe("b");
  });
});
