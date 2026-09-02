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
const SEEDED_KEY = "profs-seeded-workspaces";

/**
 * The name a workspace gets when nobody named it — on first run, and when the
 * teacher deletes the last one and the app has to stand a new one up. It is
 * not translated: it is stored data a teacher can rename, and a name that
 * changed with the interface language would be a different school in the list.
 */
export const DEFAULT_WORKSPACE_NAME = "Mon établissement";

/** "2026-2027" — the way a French school year is written. */
export function currentSchoolYear(): string {
  const year = new Date().getFullYear();
  return `${year}-${year + 1}`;
}

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

/**
 * Create a workspace a teacher asked for, as opposed to the first-run one.
 *
 * The seeded marker is set immediately, and that is the whole point of this
 * function existing beside `addWorkspace`: `initWorkspace` runs `seedIfEmpty`
 * on the active workspace at every boot, so a school created here would be
 * handed the demo school's classes and pupils on the next reload. Only
 * `ensureDefaultWorkspace` leaves the marker unset, because the demo data is
 * an introduction to an empty app, not something to pour into a real school.
 */
export function createWorkspace(name: string, year: string): Workspace {
  const workspace = addWorkspace(name, year);
  markSeeded(workspace.id);
  return workspace;
}

export function renameWorkspace(id: string, name: string, year: string): void {
  const workspaces = listWorkspaces();
  if (!workspaces.some((w) => w.id === id)) return;
  writeWorkspaces(workspaces.map((w) => (w.id === id ? { ...w, name, year } : w)));
}

/**
 * Drop a workspace from the registry. The database itself is deleted by
 * `deleteWorkspaceDb` in `src/db/workspace.ts` — this half owns the metadata
 * only, so that it stays a synchronous localStorage module.
 *
 * Removing the active workspace re-points the active id at whatever remains;
 * removing the last one leaves none, and the next boot's
 * `ensureDefaultWorkspace` creates a fresh "Mon établissement". The seeded
 * marker goes with it, so an id can never be resurrected already-seeded.
 */
export function removeWorkspace(id: string): void {
  const workspaces = listWorkspaces();
  if (!workspaces.some((w) => w.id === id)) return;

  const remaining = workspaces.filter((w) => w.id !== id);
  localStorage.setItem(SEEDED_KEY, JSON.stringify(seededIds().filter((seeded) => seeded !== id)));

  if (localStorage.getItem(ACTIVE_KEY) === id) {
    if (remaining.length > 0) {
      localStorage.setItem(ACTIVE_KEY, remaining[0].id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }

  writeWorkspaces(remaining);
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

  const workspace = addWorkspace(DEFAULT_WORKSPACE_NAME, currentSchoolYear());
  setActiveWorkspaceId(workspace.id);
  return workspace;
}

/**
 * Demo data is offered ONCE per workspace. The marker lives here, beside the
 * rest of the workspace metadata, and NOT in the workspace database — wiping
 * or importing an empty backup must leave an empty workspace empty, not
 * resurrect the demo school on the next reload.
 */
function seededIds(): string[] {
  const raw = localStorage.getItem(SEEDED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function hasBeenSeeded(workspaceId: string): boolean {
  return seededIds().includes(workspaceId);
}

export function markSeeded(workspaceId: string): void {
  const ids = seededIds();
  if (ids.includes(workspaceId)) return;
  localStorage.setItem(SEEDED_KEY, JSON.stringify([...ids, workspaceId]));
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

// `listWorkspaces` parses the JSON afresh on every call, so it returns a new
// array each time. `useSyncExternalStore` compares snapshots by identity and
// would re-render forever. The cache is keyed on the raw string, which only
// changes when the registry actually does.
let cachedRaw: string | null = null;
let cachedList: Workspace[] = [];

function getWorkspacesSnapshot(): Workspace[] {
  const raw = localStorage.getItem(LIST_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = listWorkspaces();
  }
  return cachedList;
}

export function useWorkspaces(): Workspace[] {
  return useSyncExternalStore(subscribe, getWorkspacesSnapshot);
}
