import { ensureDefaultWorkspace } from "@domain/workspaces";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

/** Run once on startup, before the first render. Returns the active workspace id. */
export async function initWorkspace(): Promise<string> {
  const workspace = ensureDefaultWorkspace();
  const db = openWorkspaceDb(workspace.id);
  await seedIfEmpty(db, workspace.id);
  db.close();
  return workspace.id;
}
