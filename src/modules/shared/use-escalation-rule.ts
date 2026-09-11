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
 * The default stands in while the query is in flight. That is the same answer
 * an absent row gives, and it is only ever read by a surface that draws
 * nothing until it has counts to draw.
 */
export function useEscalationRule(): EscalationRule {
  const db = useDb();
  return useLiveQuery(() => readEscalation(db), [db]) ?? DEFAULT_ESCALATION;
}
