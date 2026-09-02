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
  /** `surname` is for narrow cells — a seat tile has no room for both. */
  format = "full",
}: {
  student: Pick<Student, "firstName" | "lastName">;
  format?: "full" | "surname";
}) {
  // No extra tracking on the surname-only form. It is used in the seat tile at
  // 10px, where letter-spacing buys no legibility and costs width that
  // capitals have already eaten — ROUSSEAU and CHEVALIER clipped with it.
  if (format === "surname") {
    return <span className="uppercase">{student.lastName}</span>;
  }
  return (
    <>
      <span className="uppercase tracking-wide">{student.lastName}</span> {student.firstName}
    </>
  );
}
