import { useDb } from "@db/provider";
import { readEscalation } from "@db/settings";
import { DEFAULT_ESCALATION, type EscalationRule } from "@domain/escalation";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * The workspace's rule, live.
 *
 * `db` is in the dependency array, which is not optional anywhere in this app:
 * switching école re-opens the database, and a live query that forgets it goes
 * on answering with the previous school's row.
 *
 * The default stands in while the query is in flight, which is the same
 * answer an absent row gives. That window is a microtask wide — before the
 * live query resolves — but `StudentCard.addBehaviour` reads `rule.enabled`
 * from it to decide whether to evaluate and announce, so a tap that lands
 * inside it is judged against the default rather than the stored one; the
 * card has to already be on screen for a tap to reach it at all, which is
 * what keeps that window narrow rather than closed.
 */
export function useEscalationRule(): EscalationRule {
  const db = useDb();
  return useLiveQuery(() => readEscalation(db), [db]) ?? DEFAULT_ESCALATION;
}
