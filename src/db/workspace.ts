import Dexie from "dexie";
import type { AppDatabase } from ".";

/**
 * Erase every table in the workspace.
 *
 * `db.tables` is asked for the list rather than naming the tables here. The
 * inline version this replaced named seven tables by hand — the seven that
 * existed in v1 — so every table added since (sessions, attendance, behaviour
 * events, the seating plan, the three rubric tables, groups and their
 * memberships) survived "Supprimer toutes les données" untouched. `PRIVACY.md`
 * promises the erase takes the whole workspace, so that was a broken written
 * claim, not a rough edge: a behaviour comment about a named child outlived
 * the deletion that was supposed to remove it.
 *
 * Reading the list off the database means the next `db.version(...)` is
 * covered the day it is declared, with nothing to remember.
 */
/**
 * Delete a workspace's database outright.
 *
 * `wipeWorkspace` empties the tables of the workspace a teacher is standing
 * in; this destroys one they are removing from the list, so the database name
 * is the argument rather than an open handle — the workspace being deleted is
 * usually not the open one, and opening it just to erase it would be absurd.
 *
 * `PRIVACY.md` promises deletion is real and permanent, so the registry entry
 * going away is not enough on its own: the pupils' names would still be in
 * IndexedDB under `profs-<id>`, invisible and unreachable.
 */
export async function deleteWorkspaceDb(workspaceId: string): Promise<void> {
  await Dexie.delete(`profs-${workspaceId}`);
}

export async function wipeWorkspace(db: AppDatabase): Promise<void> {
  const tables = db.tables;
  await db.transaction("rw", tables, async () => {
    for (const table of tables) {
      await table.clear();
    }
  });
}
