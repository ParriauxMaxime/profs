/**
 * The sort of a list page, carried in its URL.
 *
 * A list page's filter already lives in its URL so that going into a pupil and
 * coming back does not throw away what the teacher typed. The sort is the same
 * kind of state and earns the same treatment: re-sorting a 360-row table and
 * then opening one of its rows should not land you back at the default order.
 *
 * Spelled as two params — `?sort=lastName&dir=desc` — to match how this app
 * already names state in a URL (`?date=` and `?at=` on the class page, `?q=`
 * and `?classe=` on the list pages) rather than packing two facts into one
 * string.
 *
 * These are the only two places the mapping is expressed, so a URL written by
 * one page is always readable by the other.
 */

/** One column's sort, in the shape TanStack Table's `sorting` state takes. */
export interface ColumnSort {
  id: string;
  desc: boolean;
}

/**
 * The sorting state a URL describes, or `[]` for the page's default order.
 *
 * `validIds` is what makes this safe, and it is not a formality: a URL can
 * name a column that does not exist — hand-edited, or bookmarked before a
 * column was renamed or removed. Handing that straight to TanStack sorts by a
 * phantom column. Falling back to the default order is the rule `?classe`
 * already follows for a class that has been deleted: resolve it, or ignore it.
 */
export function sortingFromParams(
  sort: string | undefined,
  dir: string | undefined,
  validIds: string[],
): ColumnSort[] {
  if (!sort || !validIds.includes(sort)) return [];
  return [{ id: sort, desc: dir === "desc" }];
}

/**
 * The params describing a sorting state, with `undefined` meaning "drop it".
 *
 * Both params are dropped together when nothing is sorted. A leftover `dir` on
 * a URL carrying no `sort` reads as state and controls nothing.
 *
 * Only the first column is named. Every table in this app sorts by one column
 * at a time, and the URL describes a sort a teacher can actually produce.
 */
export function paramsFromSorting(sorting: ColumnSort[]): {
  sort: string | undefined;
  dir: string | undefined;
} {
  const first = sorting[0];
  if (!first) return { sort: undefined, dir: undefined };
  return { sort: first.id, dir: first.desc ? "desc" : "asc" };
}
