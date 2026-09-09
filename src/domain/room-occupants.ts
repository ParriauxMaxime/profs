/**
 * How many classes a salle card names before it counts the rest.
 *
 * Three because the demo teacher's *Salle de musique* is the shape this app
 * has to survive: éducation musicale is an hour a week for every pupil in the
 * building, so one salle holds sixteen classes and the card listed all of
 * them — four wrapped lines of "3°A, 4°D, 6°D, 5°A…" under a name and a
 * capacity, on a card whose job is to be recognised by its shape. A count
 * answers "is this the busy one?" in a glance; the list answered nothing and
 * cost the card its proportions.
 */
export const NAMED_OCCUPANTS = 3;

/** The classes a salle card names, and how many it leaves to a count. */
export interface OccupantSummary {
  named: string[];
  rest: number;
}

/**
 * Which classes a salle card names, and how many it does not.
 *
 * Sorted, and that is not cosmetic: `plansForRoom` returns plans in creation
 * order, so capping an unsorted list would name three arbitrary classes and
 * silently swap them for three others the next time a class was seated. A
 * card is recognised by being the same card each time it is looked at.
 *
 * `sensitivity: "base"` is `listRooms`'s comparator, so a name sorts the same
 * way wherever it appears; `numeric` keeps 10°A after 9°A rather than before.
 */
export function summariseOccupants(names: string[], max = NAMED_OCCUPANTS): OccupantSummary {
  const sorted = [...names].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
  return { named: sorted.slice(0, max), rest: Math.max(0, sorted.length - max) };
}
