import { clampRule, DEFAULT_ESCALATION, type EscalationRule } from "@domain/escalation";
import type { AppDatabase } from ".";

/**
 * One row, one id. A key-value store keyed by preference name was considered
 * and cut: every preference here belongs to the workspace as a whole, and a
 * single typed row is a shape `typecheck` can defend.
 */
export const WORKSPACE_SETTINGS_ID = "workspace";

/**
 * The active rule, or the default when nothing has been written.
 *
 * Clamped on the way OUT as well as on the way in, because a row can arrive
 * from an imported backup that never went through `writeEscalation`.
 */
export async function readEscalation(db: AppDatabase): Promise<EscalationRule> {
  const row = await db.settings.get(WORKSPACE_SETTINGS_ID);
  if (!row?.escalation) return DEFAULT_ESCALATION;
  return clampRule(row.escalation);
}

/**
 * A PATCH, not a full rule — merged against the stored row inside its own
 * transaction. Réglages has four writers of this one row (two toggles, two
 * number fields), and a `put` built from a render-time snapshot is the same
 * bug `writeGrade` and `toggleAttendance` were written to avoid: toggling
 * the switch right after typing a number blurs the field first, so two
 * `put`s land from the same stale `escalation` and whichever resolves second
 * silently drops what the other one just wrote.
 */
export async function writeEscalation(
  db: AppDatabase,
  patch: Partial<EscalationRule>,
): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const current = await readEscalation(db);
    await db.settings.put({
      id: WORKSPACE_SETTINGS_ID,
      escalation: clampRule({ ...current, ...patch }),
    });
  });
}
