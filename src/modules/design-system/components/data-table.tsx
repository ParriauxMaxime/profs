import { fuzzyMatchAny } from "@domain/search";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { useTranslation } from "react-i18next";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

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

  const rowCount = table.getRowModel().rows.length;

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
        <table className="w-full text-base md:text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border text-left">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={[
                      "px-3 py-2 font-medium text-text-muted",
                      header.column.columnDef.meta?.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
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
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
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
            ))}
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
