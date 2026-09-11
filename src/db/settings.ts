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

export async function writeEscalation(db: AppDatabase, rule: EscalationRule): Promise<void> {
  await db.settings.put({ id: WORKSPACE_SETTINGS_ID, escalation: clampRule(rule) });
}
