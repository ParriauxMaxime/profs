import type { SchoolClass } from "@db";
import { useDb } from "@db/provider";
import { paramsFromSorting, sortingFromParams } from "@domain/table-sort";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
// Crosses a module boundary: creating a class belongs to the class module,
// and both this screen and that one create classes. CLAUDE.md records the
// exception rather than pretending the boundary is clean.
import { ClassForm } from "../class/components/class-form";
import { DataTable } from "../design-system/components/data-table";

/** The headcount is a real column so that it sorts as a number. */
type ClassRow = SchoolClass & { headcount: number };

/**
 * The columns a URL may name in `?sort=`. Listed explicitly rather than derived
 * from `columns`, because TanStack fills an accessor column's `id` in itself
 * and a definition here carries `undefined` until it does.
 */
const SORTABLE_COLUMNS = ["name", "headcount"];

const helper = createColumnHelper<ClassRow>();

export function ClassesPage({ q, sort, dir }: { q?: string; sort?: string; dir?: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [addingClass, setAddingClass] = useState(false);

  const data = useLiveQuery(async () => {
    const [classes, students] = await Promise.all([
      db.classes.orderBy("name").toArray(),
      db.students.toArray(),
    ]);
    return { classes, students };
  }, [db]);

  const rows = useMemo<ClassRow[]>(() => {
    if (!data) return [];
    const headcounts = new Map<string, number>();
    for (const student of data.students) {
      headcounts.set(student.classId, (headcounts.get(student.classId) ?? 0) + 1);
    }
    return data.classes.map((schoolClass) => ({
      ...schoolClass,
      headcount: headcounts.get(schoolClass.id) ?? 0,
    }));
  }, [data]);

  const columns = useMemo(
    () => [
      helper.accessor("name", {
        header: () => t("classes.columnName"),
        size: 60,
        // The row's <tr> also navigates, but this link is what makes the
        // destination reachable: a <tr> takes no focus and Enter does not fire
        // on it, and only an anchor gives a hover URL and a ⌘-click.
        cell: (info) => (
          <Link
            to={Router.Class({ classId: info.row.original.id })}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      helper.accessor("headcount", {
        header: () => t("classes.columnHeadcount"),
        size: 40,
        cell: (info) => (
          <span className="text-text-muted">
            {t("dashboard.studentCount", { count: info.getValue() })}
          </span>
        ),
      }),
    ],
    [t],
  );

  // A `?sort=` naming a column that does not exist falls back to the default
  // order rather than sorting by a phantom column — the same rule `?classe`
  // follows on /students for a class that has been deleted.
  const sorting = sortingFromParams(sort, dir, SORTABLE_COLUMNS);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-lg">{t("dashboard.classes")}</h2>
            <button type="button" className="btn btn-primary" onClick={() => setAddingClass(true)}>
              {t("dashboard.addClass")}
            </button>
          </div>
        }
        // Not in `header`: the form is a bordered two-field card, and pinning
        // it would cover the table it is adding to. It stays directly under
        // the heading whose button opened it, and scrolls away like any form.
        beforeTable={addingClass && <ClassForm key="new" onDone={() => setAddingClass(false)} />}
        columns={columns as ColumnDef<ClassRow, unknown>[]}
        data={rows}
        getRowId={(schoolClass) => schoolClass.id}
        globalSearchFields={["name"]}
        searchPlaceholder={t("classes.searchPlaceholder")}
        globalFilter={q ?? ""}
        // `replace`, never `push`: a push per keystroke makes Back walk the
        // typed name one character at a time, and a sort click is a change of
        // view rather than a navigation. Every handler carries the params it
        // does not own — omitting one silently clears state the teacher set.
        onGlobalFilterChange={(value) =>
          Router.replace("Classes", { q: value || undefined, ...paramsFromSorting(sorting) })
        }
        sorting={sorting}
        onSortingChange={(next) =>
          Router.replace("Classes", { q: q || undefined, ...paramsFromSorting(next) })
        }
        onRowClick={(schoolClass) => Router.push("Class", { classId: schoolClass.id })}
        emptyMessage={t("dashboard.noClasses")}
      />
    </div>
  );
}
