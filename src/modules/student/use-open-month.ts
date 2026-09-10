import { defaultOpenMonth } from "@domain/student-summary";
import { useState } from "react";

/**
 * Which month of a pupil's history is expanded, and the three rules that took
 * a bug each to find.
 *
 * It is held as a month KEY, never an index: the list regroups whenever a
 * séance or an event is added elsewhere, and an index would open a different
 * month.
 *
 * `""` is not a stale key — it is the teacher having closed the open month,
 * and it keeps meaning closed rather than silently reopening the default.
 *
 * A retained key that names no month in THIS list falls back to the default.
 * Stepping to the next pupil is a `Router.push` on the same route, so nothing
 * here is remounted and the key survives across classes onto a list that may
 * hold no such month — every month then drew collapsed, which is the empty
 * screen `defaultOpenMonth` exists to prevent.
 *
 * A hook rather than a copy in each block: Présence and Comportement both group
 * by month now, and a rule this subtle kept in two places eventually disagrees
 * with itself.
 */
export function useOpenMonth(months: { key: string }[]): {
  openKey: string | null;
  toggle: (key: string) => void;
} {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const retained =
    openKey !== null && (openKey === "" || months.some((month) => month.key === openKey));
  const open = retained ? openKey : defaultOpenMonth(months, Date.now());

  return {
    openKey: open,
    toggle: (key) => setOpenKey(key === open ? "" : key),
  };
}
