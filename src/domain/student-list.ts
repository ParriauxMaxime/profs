/**
 * The ordered set of pupils a list page is showing, reconstructed from its URL.
 *
 * The pupil page's `‹ ›` arrows walk the list the teacher arrived from, and a
 * page navigation cannot carry an array — so the params describe the list and
 * this module rebuilds it. `compareStudents` is handed to the tables as their
 * `sortingFn` as well, which is what stops the arrows walking a different
 * order from the rows on screen.
 */

import { filterByGroup } from "./group";
import { fuzzyMatchAny } from "./search";
import { type ColumnSort, sortingFromParams } from "./table-sort";

/** The columns a `?sort=` may name. Both list pages offer exactly these. */
export const STUDENT_SORT_COLUMNS = ["lastName", "firstName", "classLabel"];

export interface StudentListParams {
  q?: string;
  classe?: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}

/**
 * `classLabel` is carried ON the row rather than looked up, so that Classe
 * sorts and the search reaches it — the same reason `/students` does it.
 */
export interface ListStudent {
  id: string;
  lastName: string;
  firstName: string;
  classId: string;
  classLabel: string;
}

/**
 * Fixed to `fr` rather than the interface language, and deliberately.
 *
 * A roster's order must not change when a teacher switches the app to English:
 * the order is a property of the list, not of the labels around it. `base`
 * sensitivity makes "Élan" sort where a French reader looks for it, which the
 * default code-point comparison does not.
 */
const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function field(student: ListStudent, id: string): string {
  if (id === "firstName") return student.firstName;
  if (id === "classLabel") return student.classLabel;
  return student.lastName;
}

/**
 * The comparator both the arrows and the tables use.
 *
 * Ties break on the surname, so two pupils with one first name have a stable
 * order — without it, the sequence the arrows walk could differ from the rows
 * rendered, on nothing more than the input order.
 */
export function compareStudents(a: ListStudent, b: ListStudent, sorting: ColumnSort[]): number {
  const first = sorting[0];
  if (first) {
    const result = collator.compare(field(a, first.id), field(b, first.id));
    if (result !== 0) return first.desc ? -result : result;
  }
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
}

/**
 * The pupil ids a list page shows, in the order it shows them.
 *
 * Every param resolves or is ignored: an unknown class and a sort naming a
 * column that no longer exists each fall back rather than emptying the list
 * or sorting by a phantom. That is the rule `?classe` already follows for a
 * deleted class. A group is resolved against `groups` itself, not against
 * `memberships` — a group that exists and currently has no members must
 * still narrow the list to nobody, which membership rows alone cannot tell
 * apart from a group that no longer exists.
 */
export function studentSequence(
  students: ListStudent[],
  groups: { id: string }[],
  memberships: { groupId: string; studentId: string }[],
  params: StudentListParams,
): string[] {
  let visible = students;

  if (params.classe !== undefined && students.some((s) => s.classId === params.classe)) {
    visible = visible.filter((student) => student.classId === params.classe);
  }

  if (params.groupe !== undefined && groups.some((group) => group.id === params.groupe)) {
    visible = filterByGroup(visible, memberships, params.groupe);
  }

  const query = params.q?.trim();
  if (query) {
    visible = visible.filter((student) =>
      fuzzyMatchAny([student.lastName, student.firstName, student.classLabel], query),
    );
  }

  const sorting = sortingFromParams(params.sort, params.dir, STUDENT_SORT_COLUMNS);
  return [...visible].sort((a, b) => compareStudents(a, b, sorting)).map((student) => student.id);
}

export interface StudentNeighbours {
  previousId: string | null;
  nextId: string | null;
  /** One-based, for "8 / 28". */
  index: number;
  total: number;
}

/**
 * Null for a pupil the list does not contain — reached from a seat on the
 * plan, or from a bare link. Drawing arrows there would invent a list.
 */
export function neighbours(ids: string[], studentId: string): StudentNeighbours | null {
  const at = ids.indexOf(studentId);
  if (at === -1) return null;

  return {
    previousId: at === 0 ? null : ids[at - 1],
    nextId: at === ids.length - 1 ? null : ids[at + 1],
    index: at + 1,
    total: ids.length,
  };
}
