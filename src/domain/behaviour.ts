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

/**
 * The colour of each type, as a CSS custom property rather than a literal.
 *
 * The same meaning needs a different value on each ground — a red that reads
 * as serious on paper glares on a dark screen — so the domain owns which
 * token a type maps to and the stylesheet owns what that token is worth in
 * the active theme.
 */
export const BEHAVIOUR_COLORS: Record<BehaviourType, string> = {
  green: "var(--behaviour-green)",
  yellow: "var(--behaviour-yellow)",
  red: "var(--behaviour-red)",
  note: "var(--behaviour-note)",
};

/**
 * The text colour that goes on each fill.
 *
 * Paired with `BEHAVIOUR_COLORS` rather than assumed to be white: a mid-tone
 * amber needs dark ink, and the dark theme lifts every fill until they all
 * do. Keeping the pair explicit is what makes the contrast checkable.
 */
export const BEHAVIOUR_TEXT_COLORS: Record<BehaviourType, string> = {
  green: "var(--on-behaviour-green)",
  yellow: "var(--on-behaviour-yellow)",
  red: "var(--on-behaviour-red)",
  note: "var(--on-behaviour-note)",
};

export type BehaviourCounts = Record<BehaviourType, number>;

/** Every type is present in the result, at zero if unseen. */
export function countByType(events: { type: BehaviourType }[]): BehaviourCounts {
  const counts = Object.fromEntries(BEHAVIOUR_TYPES.map((t) => [t, 0])) as BehaviourCounts;
  for (const event of events) counts[event.type] += 1;
  return counts;
}
