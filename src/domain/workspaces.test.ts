class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

if (!("localStorage" in globalThis)) {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage() });
}

import {
  activeWorkspaceId,
  addWorkspace,
  createWorkspace,
  ensureDefaultWorkspace,
  hasBeenSeeded,
  listWorkspaces,
  markSeeded,
  removeWorkspace,
  renameWorkspace,
  setActiveWorkspaceId,
} from "./workspaces";

describe("workspaces registry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ensureDefaultWorkspace is idempotent", () => {
    const first = ensureDefaultWorkspace();
    const second = ensureDefaultWorkspace();

    expect(second.id).toBe(first.id);
    expect(listWorkspaces()).toHaveLength(1);
  });

  it("ensureDefaultWorkspace creates 'Mon établissement' with a YYYY-YYYY+1 year and marks it active", () => {
    const workspace = ensureDefaultWorkspace();
    const year = new Date().getFullYear();

    expect(workspace.name).toBe("Mon établissement");
    expect(workspace.year).toBe(`${year}-${year + 1}`);
    expect(activeWorkspaceId()).toBe(workspace.id);
  });

  it("activeWorkspaceId returns null when the stored active id is not in the list", () => {
    localStorage.setItem("profs-active-workspace", "ghost-id");

    expect(activeWorkspaceId()).toBeNull();
  });

  it("listWorkspaces returns [] for malformed JSON rather than throwing", () => {
    localStorage.setItem("profs-workspaces", "{not json");

    expect(() => listWorkspaces()).not.toThrow();
    expect(listWorkspaces()).toEqual([]);
  });

  it("hasBeenSeeded is false until markSeeded, then true and per-workspace", () => {
    expect(hasBeenSeeded("a")).toBe(false);

    markSeeded("a");

    expect(hasBeenSeeded("a")).toBe(true);
    expect(hasBeenSeeded("b")).toBe(false);
  });

  it("markSeeded is idempotent and keeps earlier markers", () => {
    markSeeded("a");
    markSeeded("a");
    markSeeded("b");

    expect(hasBeenSeeded("a")).toBe(true);
    expect(hasBeenSeeded("b")).toBe(true);
  });

  it("addWorkspace appends without disturbing existing entries", () => {
    const first = addWorkspace("Collège A", "2025-2026");
    const second = addWorkspace("Lycée B", "2026-2027");

    const all = listWorkspaces();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(first);
    expect(all[1]).toEqual(second);
  });
});

describe("workspace management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("createWorkspace marks the workspace seeded, so a new school never gets the demo data", () => {
    const workspace = createWorkspace("Collège A", "2025-2026");

    expect(listWorkspaces()).toHaveLength(1);
    expect(hasBeenSeeded(workspace.id)).toBe(true);
  });

  it("ensureDefaultWorkspace leaves the first-run workspace unseeded, so the demo school still appears", () => {
    const workspace = ensureDefaultWorkspace();

    expect(hasBeenSeeded(workspace.id)).toBe(false);
  });

  it("renameWorkspace rewrites name and year in place", () => {
    const first = createWorkspace("Collège A", "2025-2026");
    const second = createWorkspace("Lycée B", "2025-2026");

    renameWorkspace(first.id, "Collège Voltaire", "2026-2027");

    const all = listWorkspaces();
    expect(all[0]).toEqual({ id: first.id, name: "Collège Voltaire", year: "2026-2027" });
    expect(all[1]).toEqual(second);
  });

  it("renameWorkspace ignores an unknown id", () => {
    const first = createWorkspace("Collège A", "2025-2026");

    renameWorkspace("ghost-id", "Nope", "1900-1901");

    expect(listWorkspaces()).toEqual([first]);
  });

  it("removeWorkspace drops the entry and its seeded marker", () => {
    const first = createWorkspace("Collège A", "2025-2026");
    const second = createWorkspace("Lycée B", "2025-2026");
    setActiveWorkspaceId(second.id);

    removeWorkspace(first.id);

    expect(listWorkspaces()).toEqual([second]);
    expect(hasBeenSeeded(first.id)).toBe(false);
  });

  it("removeWorkspace re-points the active workspace when the active one goes", () => {
    const first = createWorkspace("Collège A", "2025-2026");
    const second = createWorkspace("Lycée B", "2025-2026");
    setActiveWorkspaceId(first.id);

    removeWorkspace(first.id);

    expect(activeWorkspaceId()).toBe(second.id);
  });

  it("removeWorkspace leaves no active workspace when the last one goes", () => {
    const only = createWorkspace("Collège A", "2025-2026");
    setActiveWorkspaceId(only.id);

    removeWorkspace(only.id);

    expect(listWorkspaces()).toEqual([]);
    expect(activeWorkspaceId()).toBeNull();
  });

  it("ensureDefaultWorkspace creates a fresh workspace after the last one is removed", () => {
    const only = createWorkspace("Collège A", "2025-2026");
    setActiveWorkspaceId(only.id);
    removeWorkspace(only.id);

    const recreated = ensureDefaultWorkspace();

    expect(recreated.id).not.toBe(only.id);
    expect(recreated.name).toBe("Mon établissement");
    expect(activeWorkspaceId()).toBe(recreated.id);
  });

  it("removeWorkspace ignores an unknown id", () => {
    const first = createWorkspace("Collège A", "2025-2026");
    setActiveWorkspaceId(first.id);

    removeWorkspace("ghost-id");

    expect(listWorkspaces()).toEqual([first]);
    expect(activeWorkspaceId()).toBe(first.id);
  });
});
