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
export async function wipeWorkspace(db: AppDatabase): Promise<void> {
  const tables = db.tables;
  await db.transaction("rw", tables, async () => {
    for (const table of tables) {
      await table.clear();
    }
  });
}
