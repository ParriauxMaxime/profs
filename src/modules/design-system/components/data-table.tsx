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
 * narrow screen it would cover the "Nom" label and its sort control. This is
 * the same expression `AdminLayout` uses for its `main` padding, so no new
 * constant enters the app and the header stays right if `--control-min` ever
 * changes.
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
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage,
  globalSearchFields,
  searchPlaceholder,
  getRowId,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    getRowId: getRowId && ((row) => getRowId(row)),
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const visibleColumns = table.getVisibleLeafColumns();
  const widths = columnWidths(visibleColumns.map((column) => column.getSize()));

  const rowCount = rows.length;

  return (
    <div className="flex flex-col gap-3">
      {globalSearchFields && (
        <input
          type="search"
          placeholder={searchPlaceholder ?? t("common.search")}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          aria-label={searchPlaceholder ?? t("common.search")}
          className="field"
        />
      )}

      {data.length === 0 && !globalFilter ? (
        <p className="text-text-muted">{emptyMessage ?? t("common.noData")}</p>
      ) : rowCount === 0 ? (
        <p className="text-text-muted">{t("common.noResults")}</p>
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
                      "sticky z-10 bg-bg px-3 py-2 font-medium text-text-muted",
                      header.column.columnDef.meta?.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top: STICKY_TOP }}
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
                  className="border-b border-border/50 transition-colors hover:bg-bg-hover"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={["px-3 py-3.5 md:py-2.5", cell.column.columnDef.meta?.className]
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
