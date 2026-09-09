/**
 * Column widths for a `table-layout: fixed` table, as percentages.
 *
 * `DataTable` virtualizes every table it draws, so at any moment the browser
 * can see about twenty rows out of however many there are. Automatic table
 * layout sizes a column from the rows it can see, which means the columns
 * visibly resize as the teacher scrolls — the worst kind of bug to ship,
 * because it reads as the app being broken rather than as a mistake anyone
 * could name.
 *
 * The fix is widths that do not depend on content. They are PERCENTAGES rather
 * than pixels because this app is used on a phone as well as a tablet: pixel
 * widths guarantee a horizontal scrollbar under a thumb that is already
 * scrolling vertically, while percentages fit any container at any width and
 * jitter no more than pixels do. The cost is that a long surname wraps, which
 * the virtualizer's `measureElement` already absorbs.
 *
 * TanStack's `size` is therefore read as a unitless RATIO, not as pixels. Its
 * default of 150 is meaningful under that reading: columns that all leave it
 * alone simply share the width equally.
 */
export function columnWidths(sizes: number[]): string[] {
  if (sizes.length === 0) return [];

  const total = sizes.reduce((sum, size) => sum + size, 0);
  // A zero or negative total would divide into NaN, and CSS drops a NaN width
  // silently — handing the table straight back to automatic layout and the
  // jitter this function exists to prevent. Equal shares are a poor layout;
  // they are not a broken one.
  if (total <= 0) return sizes.map(() => `${(100 / sizes.length).toFixed(4)}%`);

  return sizes.map((size) => `${((size / total) * 100).toFixed(4)}%`);
}
