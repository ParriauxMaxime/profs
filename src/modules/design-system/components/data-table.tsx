import { fuzzyMatchAny } from "@domain/search";
import { columnWidths } from "@domain/table-layout";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

/**
 * First guess at a row's height, corrected per row by `measureElement`.
 * Rows are `py-3.5` on touch and `py-2.5` on desktop, and a long surname wraps
 * now that columns are proportional, so heights genuinely vary.
 */
const ROW_ESTIMATE_PX = 48;

/** Rows rendered beyond the viewport, so a fast scroll does not show a gap. */
const OVERSCAN = 8;

/**
 * Where the sticky header comes to rest.
 *
 * NOT `top: 0`. The drawer button is `fixed top-0 left-0 z-30`, 44px plus the
 * safe-area inset, sitting exactly where a flush header would land — on a
 * narrow screen it would cover the "Nom" label and its sort control. This
 * mirrors the same construction `AdminLayout` uses for its `main` padding —
 * safe-area inset plus the control height — with a smaller trailing gap
 * (`0.5rem` here against `AdminLayout`'s `1rem`): enough for the header to
 * clear the floating drawer button, without the full padding a page's first
 * heading needs. No new constant enters the app, and the header stays right
 * if `--control-min` ever changes.
 */
const STICKY_TOP = "calc(max(0.5rem, env(safe-area-inset-top)) + var(--control-min) + 0.5rem)";

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  emptyMessage?: string;
  globalSearchFields?: (keyof T & string)[];
  searchPlaceholder?: string;
  /**
   * The stable identity of a row, used as its React key.
   *
   * Without it TanStack falls back to the row INDEX, and the index is not the
   * record: sorting or filtering reorders the rows, React reuses the subtree
   * sitting at that index, and any state a cell holds — an armed delete, above
   * all — stays put while the record under it changes. Give it whenever a row
   * renders something stateful.
   */
  getRowId?: (row: T) => string;
  /**
   * A page's own filters, rendered beside the search input.
   *
   * The search input belongs to DataTable; a page-specific control like a
   * class picker does not. The slot puts them on one line without DataTable
   * knowing what the control is.
   */
  toolbar?: ReactNode;
  /**
   * The page's own heading, pinned with the search row and the column row.
   *
   * A list page's header is one block — what the list IS, how it is filtered,
   * and what the columns mean — and scrolling 360 pupils used to take the
   * first two away and leave the third. It lives here rather than in the page
   * because a sticky stack has to be ONE element: two separately-sticky
   * siblings each need to know the other's height, and the height of a
   * wrapping toolbar is not a constant anyone can write down.
   *
   * Optional, and the block only sticks when something is in it: the class
   * roster passes none, and keeps today's sticky-thead-only behaviour.
   */
  header?: ReactNode;
  /**
   * What sits between the pinned header and the table, still scrolling.
   *
   * `/classes` opens its creation form here. It cannot go in `header` — a
   * bordered two-field form is far too tall to pin over the table — and it
   * cannot stay in the page either, since the heading it belongs under has
   * moved in here, and rendering it above DataTable would put the form above
   * the title.
   */
  beforeTable?: ReactNode;
  /**
   * Navigation on a row click, as a MOUSE CONVENIENCE ONLY.
   *
   * A <tr> takes no focus and Enter does not fire on it, so this is never the
   * only way to reach a row's destination: the first cell must hold a real
   * <Link>. Events originating inside an <a> or a <button> are ignored, so the
   * link does not fire twice and a row's controls keep working.
   */
  onRowClick?: (row: T) => void;
  /**
   * The search value, when the page owns it — a list page mirrors it into the
   * URL so Back restores what the teacher typed. Omit BOTH this and
   * `onGlobalFilterChange` to let DataTable hold the value itself.
   */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /**
   * The sort, when the page owns it — a list page mirrors it into the URL for
   * the same reason it mirrors the search: re-sorting 360 rows and then
   * opening one of them should not land you back at the default order on the
   * way back. Omit BOTH this and `onSortingChange` to let DataTable hold it.
   */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Replaces the generic "Aucun résultat" when a filter empties the list. */
  noResultsMessage?: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  globalSearchFields,
  searchPlaceholder,
  getRowId,
  toolbar,
  header,
  beforeTable,
  onRowClick,
  globalFilter,
  onGlobalFilterChange,
  sorting,
  onSortingChange,
  noResultsMessage,
}: DataTableProps<T>) {
  const { t } = useTranslation();

  // Controlled exactly when the caller passes a value — the same split as the
  // filter below, and the same visible failure if only half of it is passed.
  const [uncontrolledSorting, setUncontrolledSorting] = useState<SortingState>([]);
  const isSortingControlled = sorting !== undefined;
  const sortingValue = isSortingControlled ? sorting : uncontrolledSorting;

  const setSortingValue = (next: SortingState) => {
    if (!isSortingControlled) setUncontrolledSorting(next);
    onSortingChange?.(next);
  };

  // Controlled when the caller passes a value, uncontrolled otherwise. This
  // fails visibly rather than silently: pass the value without the handler and
  // the input freezes on the first keystroke, which is noticed immediately.
  const [uncontrolledFilter, setUncontrolledFilter] = useState("");
  const isFilterControlled = globalFilter !== undefined;
  const filterValue = isFilterControlled ? globalFilter : uncontrolledFilter;

  const setFilterValue = (value: string) => {
    if (!isFilterControlled) setUncontrolledFilter(value);
    onGlobalFilterChange?.(value);
  };

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId && ((row) => getRowId(row)),
    state: { sorting: sortingValue, globalFilter: filterValue },
    // TanStack hands this an updater that may be a function or a value; both
    // branches are needed, or a functional update is silently dropped.
    onSortingChange: (updater) => {
      setSortingValue(typeof updater === "function" ? updater(sortingValue) : updater);
    },
    onGlobalFilterChange: (updater) => {
      setFilterValue(typeof updater === "function" ? updater(filterValue) : (updater as string));
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!globalSearchFields || !filterValue) return true;
      const values = globalSearchFields.flatMap((f) => {
        const v = row.getValue(f as string);
        if (Array.isArray(v)) return v as string[];
        return [v as string | undefined];
      });
      return fuzzyMatchAny(values, filterValue as string);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  // A window virtualizer measures against the DOCUMENT, so it has to be told
  // how far down the page the table begins. Without this it computes its
  // window off by the height of the heading, the search box and the toolbar
  // above it, which presents as a table that stays blank until you have
  // scrolled well past its top.
  //
  // A callback ref rather than `useRef` + a `[]`-dep effect: the <table>
  // element sits inside a ternary and does not render in either empty state
  // (no data, or a filter matching nothing), so a `[]`-dep effect can run
  // once against a null ref and never fire again once the table actually
  // mounts, leaving scrollMargin stuck at 0. A callback ref fires on every
  // mount and unmount, so it stays correct across that toggle.
  const [tableEl, setTableEl] = useState<HTMLTableElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // How tall the pinned block currently is, so the column row can come to rest
  // directly under it rather than at STICKY_TOP, where the two would overlap.
  //
  // Measured, never assumed: the block holds a heading, a search input and
  // whatever control the page passed, in a `flex-wrap` row — so its height is
  // one line on a desktop and three on a phone, and it changes again when the
  // class filter appears or a long heading wraps. A written-down constant
  // would be wrong at exactly the width this app is used at.
  //
  // A callback ref for the same reason `tableEl` is one: the block does not
  // render at all when a page passes no header, no search and no toolbar.
  // Pinning is opt-in: a page pins its header by handing it over.
  const pinned = header !== undefined;
  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    if (!headerEl) {
      setHeaderHeight(0);
      return;
    }

    const measure = () => setHeaderHeight(headerEl.getBoundingClientRect().height);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(headerEl);

    return () => observer.disconnect();
  }, [headerEl]);

  useLayoutEffect(() => {
    if (!tableEl) return;

    const measure = () => {
      setScrollMargin(tableEl.getBoundingClientRect().top + window.scrollY);
    };
    measure();

    // Anything above the table can change height — the class filter appearing,
    // a ClassForm opening — and each of those moves the table's top.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [tableEl]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: OVERSCAN,
    scrollMargin,
    // Keyed by the row's own id so a sort or a filter cannot hand a measured
    // height — or any row state — to a different record.
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  // `.end` on a virtual item is measured from the same origin as `.start` —
  // i.e. it INCLUDES scrollMargin — but `getTotalSize()` does not, so a raw
  // `getTotalSize() - end` comes up short by exactly scrollMargin. Subtracting
  // it back out here is what keeps the last rows reachable; without it the
  // bottom spacer undershoots and the tail of a long list scrolls past the
  // end of the page before the last row is visible.
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin)
      : 0;

  const visibleColumns = table.getVisibleLeafColumns();
  const widths = columnWidths(visibleColumns.map((column) => column.getSize()));

  const rowCount = rows.length;

  // A click that started on a link, a button or a form control belongs to that
  // control. Without this the first cell's <Link> and the row would both fire,
  // and a row carrying a delete button could not be used at all.
  const rowClickHandler = (row: T) => (event: ReactMouseEvent<HTMLTableRowElement>) => {
    if (!onRowClick) return;
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
    onRowClick(row);
  };

  return (
    <div className="flex flex-col gap-3">
      {(header || globalSearchFields || toolbar) && (
        // Pinned only when the page handed over its heading. A page that did
        // not — the class roster — keeps its own header in its own layout,
        // above a group filter, two buttons and a form, and pinning just the
        // search there would tear a lone box out of that stack. It also could
        // not paint the band below: the block is not at the top of the page,
        // so the strip above it is the page's own content, not empty margin.
        //
        // No `relative`: `sticky` already positions the block, and setting
        // both leaves which one wins to stylesheet order rather than to the
        // order the classes are written in.
        <div
          ref={pinned ? setHeaderEl : undefined}
          className={pinned ? "sticky z-20 flex flex-col gap-3 bg-bg pb-2" : "flex flex-col gap-3"}
          style={pinned ? { top: STICKY_TOP } : undefined}
        >
          {pinned && (
            // The band ABOVE the block, painted the same colour. STICKY_TOP
            // deliberately leaves that strip clear so the block never lands
            // under the floating drawer button — but the strip is still page,
            // and rows scrolled through it: a pupil slid across the screen
            // above the heading naming the list. Absolutely positioned, so it
            // paints without joining the layout the measurement depends on,
            // and overlapping by a pixel, since a cover that stops exactly at
            // the block's edge leaves a one-pixel seam for a row to show in.
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-px bg-bg"
              style={{ height: STICKY_TOP, transform: "translateY(-100%)" }}
            />
          )}
          {header}
          {(globalSearchFields || toolbar) && (
            <div className="flex flex-wrap items-center gap-2">
              {globalSearchFields && (
                <input
                  type="search"
                  placeholder={searchPlaceholder ?? t("common.search")}
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  aria-label={searchPlaceholder ?? t("common.search")}
                  className="field max-w-sm flex-1"
                />
              )}
              {toolbar}
            </div>
          )}
        </div>
      )}

      {beforeTable}

      {data.length === 0 && !filterValue ? (
        <p className="text-text-muted">{emptyMessage ?? t("common.noData")}</p>
      ) : rowCount === 0 ? (
        <p className="text-text-muted">{noResultsMessage ?? t("common.noResults")}</p>
      ) : (
        <table
          ref={setTableEl}
          className="w-full table-fixed text-base md:text-sm"
          // The DOM holds about twenty rows out of however many there are, so
          // a screen reader would otherwise announce "row 4 of 12" for the
          // two-hundredth pupil. The count is the FILTERED total plus the
          // header, since that is the list the teacher is actually in.
          aria-rowcount={rowCount + 1}
        >
          <colgroup>
            {visibleColumns.map((column, index) => (
              <col key={column.id} style={{ width: widths[index] }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} aria-rowindex={1} className="border-b border-border text-left">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={[
                      "sticky z-10 break-words bg-bg px-3 py-2 font-medium text-text-muted",
                      header.column.columnDef.meta?.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top: `calc(${STICKY_TOP} + ${headerHeight}px)` }}
                    aria-sort={
                      header.column.getCanSort()
                        ? header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={[
                          "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-text",
                          header.column.getIsSorted() ? "text-accent" : "",
                        ].join(" ")}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIndicator direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {/* Spacers rather than `transform: translateY` on each row: a
                positioned <tr> leaves the table's layout, stops participating
                in column sizing, and the header then aligns with nothing.
                aria-hidden sits on the <tr> itself — hiding only the <td>
                leaves the row in the accessibility tree as a phantom entry
                with no aria-rowindex, which breaks the aria-rowcount contract
                the virtualized rows carry. */}
            {paddingTop > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a spacer <tr> has no tabindex and no interactive role, so it is not focusable; hiding the ROW is what keeps it out of the aria-rowindex sequence, and hiding only its <td> leaves a phantom row in the count.
              <tr aria-hidden="true">
                <td colSpan={visibleColumns.length} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  aria-rowindex={virtualRow.index + 2}
                  onClick={rowClickHandler(row.original)}
                  className={[
                    "border-b border-border/50 transition-colors hover:bg-bg-hover",
                    onRowClick ? "cursor-pointer" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      // break-words: a surname is one unbroken token, and a
                      // percentage-width column is narrow enough on a phone
                      // that `overflow-wrap: normal` (the default) lets it run
                      // into the next cell instead of wrapping — this is what
                      // keeps e.g. CHEVALIER inside its own column at 375px.
                      className={[
                        "break-words px-3 py-3.5 md:py-2.5",
                        cell.column.columnDef.meta?.className,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a spacer <tr> has no tabindex and no interactive role, so it is not focusable; hiding the ROW is what keeps it out of the aria-rowindex sequence, and hiding only its <td> leaves a phantom row in the count.
              <tr aria-hidden="true">
                <td colSpan={visibleColumns.length} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) return <span className="text-text-faint">↕</span>;
  return <span>{direction === "asc" ? "↑" : "↓"}</span>;
}
