import type { Student } from "@db";

/**
 * A pupil's name, rendered the way a French school renders it.
 *
 * Surname first, in capitals, then the given name: "BERNARD Adam". The
 * capitals are what disambiguate the two halves — a pupil called Marie Claire
 * is otherwise indistinguishable from one called Claire Marie, and compound
 * surnames make it worse. The roster also sorts by surname, so leading with it
 * makes a list scannable.
 *
 * The capitals are CSS, never a transformed string. `toUpperCase()` would put
 * a name in the DOM that nobody is called, so it would ride along into the
 * accessible name — some screen readers spell out all-caps text letter by
 * letter — and any copy-paste out of the app. The stored value is what the
 * teacher typed, and it stays that way in export, CSV and search.
 *
 * French capitals keep their accents (NGUYÊN, ÉLOÏSE), which is what CSS
 * `uppercase` does; `toUpperCase()` in a Turkish locale would not, another
 * reason the transform stays in the stylesheet.
 *
 * This exists as one component because the app previously rendered names at
 * eleven separate call sites and three of them drifted out of convention.
 */
export function PupilName({
  student,
  /** `surname` for a cell with room for one line; `stacked` for two. */
  format = "full",
}: {
  student: Pick<Student, "firstName" | "lastName">;
  format?: "full" | "surname" | "stacked";
}) {
  // No extra tracking on the narrow forms. They are used in the seat tile at
  // 10px, where letter-spacing buys no legibility and costs width that
  // capitals have already eaten — ROUSSEAU and CHEVALIER clipped with it.
  if (format === "surname") {
    return <span className="uppercase">{student.lastName}</span>;
  }

  // The same two halves as `full`, on two lines instead of one. A seat is 88px
  // wide, where "BERNARD Adam" wraps wherever it happens to run out — which
  // put a given name alone on line two for some pupils and split a compound
  // surname for others. Breaking it here means every tile in the room breaks
  // in the same place, which is what makes a plan scannable.
  if (format === "stacked") {
    return (
      <>
        <span className="block truncate uppercase">{student.lastName}</span>
        <span className="block truncate">{student.firstName}</span>
      </>
    );
  }
  return (
    <>
      <span className="uppercase tracking-wide">{student.lastName}</span> {student.firstName}
    </>
  );
}
