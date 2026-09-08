import { ensureDefaultWorkspace } from "@domain/workspaces";
import { openWorkspaceDb } from ".";
import { seedIfEmpty } from "./seed";

/**
 * Run once on startup, before the first render. Returns the active workspace id.
 *
 * Rejects when the database will not open. `src/main.tsx` catches that and
 * renders the recovery shell — see `src/domain/recovery.ts` for why a
 * rejection nobody catches is a bricked workspace rather than a wiped one.
 */
export async function initWorkspace(): Promise<string> {
  const workspace = ensureDefaultWorkspace();
  const db = openWorkspaceDb(workspace.id);
  try {
    // Opened explicitly, rather than left to whichever query happens first.
    // `seedIfEmpty` returns immediately for an already-seeded workspace without
    // touching the database, so on every boot after the very first one nothing
    // here would open it — and an open failure would surface later, inside a
    // `useLiveQuery`, well past the one place that knows how to handle it.
    // Opening here puts every open failure at that place.
    await db.open();
    await seedIfEmpty(db, workspace.id);
  } finally {
    db.close();
  }
  return workspace.id;
}
