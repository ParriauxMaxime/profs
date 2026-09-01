import { useSyncExternalStore } from "react";

/**
 * A workspace is one school/year. Its data lives in its own IndexedDB database.
 * The registry itself is in localStorage so it can be read synchronously,
 * before any database is opened.
 */
export interface Workspace {
  id: string;
  name: string;
  year: string;
}

const LIST_KEY = "profs-workspaces";
const ACTIVE_KEY = "profs-active-workspace";

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function listWorkspaces(): Workspace[] {
  const raw = localStorage.getItem(LIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Workspace[]) : [];
  } catch {
    return [];
  }
}

function writeWorkspaces(workspaces: Workspace[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(workspaces));
  emit();
}

export function addWorkspace(name: string, year: string): Workspace {
  const workspace: Workspace = { id: crypto.randomUUID(), name, year };
  writeWorkspaces([...listWorkspaces(), workspace]);
  return workspace;
}

export function activeWorkspaceId(): string | null {
  const id = localStorage.getItem(ACTIVE_KEY);
  return id && listWorkspaces().some((w) => w.id === id) ? id : null;
}

export function setActiveWorkspaceId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
  emit();
}

/** Create "Mon établissement" on first run. Idempotent. */
export function ensureDefaultWorkspace(): Workspace {
  const existing = listWorkspaces();
  const active = activeWorkspaceId();
  if (active) {
    const found = existing.find((w) => w.id === active);
    if (found) return found;
  }
  if (existing.length > 0) {
    setActiveWorkspaceId(existing[0].id);
    return existing[0];
  }

  const year = new Date().getFullYear();
  const workspace = addWorkspace("Mon établissement", `${year}-${year + 1}`);
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  const id = activeWorkspaceId();
  if (id === null) {
    throw new Error(
      "No active workspace: initWorkspace() must run and create/select a workspace before DbProvider renders.",
    );
  }
  return id;
}

export function useActiveWorkspaceId(): string {
  return useSyncExternalStore(subscribe, getSnapshot);
}
