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
  ensureDefaultWorkspace,
  listWorkspaces,
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

  it("addWorkspace appends without disturbing existing entries", () => {
    const first = addWorkspace("Collège A", "2025-2026");
    const second = addWorkspace("Lycée B", "2026-2027");

    const all = listWorkspaces();
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(first);
    expect(all[1]).toEqual(second);
  });
});
