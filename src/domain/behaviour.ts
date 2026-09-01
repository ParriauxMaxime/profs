/**
 * Behaviour observations, with football-card semantics.
 *
 * `green` exists deliberately: a log that can only record punishment is a bad
 * instrument, and a history shown to a parent that contains nothing but
 * sanctions misrepresents the pupil. Values are stored raw; labels are
 * translated for display only.
 */

export const BEHAVIOUR_TYPES = ["green", "yellow", "red", "note"] as const;

export type BehaviourType = (typeof BEHAVIOUR_TYPES)[number];

/** Read at arm's length across a classroom, so saturated rather than subtle. */
export const BEHAVIOUR_COLORS: Record<BehaviourType, string> = {
  green: "#16a34a",
  yellow: "#eab308",
  red: "#dc2626",
  note: "#64748b",
};

export type BehaviourCounts = Record<BehaviourType, number>;

/** Every type is present in the result, at zero if unseen. */
export function countByType(events: { type: BehaviourType }[]): BehaviourCounts {
  const counts = Object.fromEntries(BEHAVIOUR_TYPES.map((t) => [t, 0])) as BehaviourCounts;
  for (const event of events) counts[event.type] += 1;
  return counts;
}
