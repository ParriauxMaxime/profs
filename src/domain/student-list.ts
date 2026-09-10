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

/**
 * The order a list page shows when its URL names no sort.
 *
 * It exists because `[]` is not the same thing to a table as it is to this
 * module. `sortingFromParams` answers `[]` for a URL with no `?sort`, TanStack
 * leaves the row model untouched for `[]`, and the rows then come out in the
 * order Dexie handed them over — `orderBy("lastName")`, which is UTF-16
 * code-unit order. `studentSequence` always runs the collator. Beal sits
 * before Beaufils for one and after Bernier for the other, so "8 / 360" named
 * a position the pupil was not at and the next arrow went to a pupil who was
 * not the next row.
 *
 * Both pages hand this to their table instead, so the visible order is the
 * one the arrows walk by construction. It stays OUT of the URL:
 * `paramsFromSorting` drops both params when nothing is sorted, and a default
 * spelled into every link would be state that controls nothing.
 */
export const LIST_DEFAULT_SORT: ColumnSort[] = [{ id: "lastName", desc: false }];

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
 * A pupil in the shape `compareStudents` takes, for a surface that has no
 * class label to give it.
 *
 * `classLabel` is carried on a row so a list page can sort and search by
 * Classe. The class page's register neither sorts nor searches — it draws one
 * class in one order — so the empty string satisfies the shape without
 * inventing a value. A surface whose SEARCH reaches the sequence must supply
 * the real label instead, as the roster does; the two would otherwise match
 * different sets of pupils for one query.
 */
export function asListStudent<T extends Omit<ListStudent, "classLabel">>(
  student: T,
): T & { classLabel: string } {
  return { ...student, classLabel: "" };
}

/**
 * The comparator both the arrows and the tables use.
 *
 * Ties break on the surname, so two pupils with one first name have a stable
 * order — without it, the sequence the arrows walk could differ from the rows
 * rendered, on nothing more than the input order.
 *
 * `desc` negates the WHOLE comparison, tie-break included, because that is
 * what happens to this function on the other side: the tables hand it to
 * TanStack with `desc: false` and let TanStack negate the number it returns.
 * Negating only the primary comparison left the two disagreeing exactly where
 * the primary decides nothing — sort /students by Classe descending and every
 * pupil of a class ties, so the table reversed each class's internal surname
 * order while the arrows kept it ascending.
 */
export function compareStudents(a: ListStudent, b: ListStudent, sorting: ColumnSort[]): number {
  const first = sorting[0];
  const primary = first ? collator.compare(field(a, first.id), field(b, first.id)) : 0;
  const tie =
    collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName);
  const result = primary || tie;
  return first?.desc ? -result : result;
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
