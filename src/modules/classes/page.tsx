import type { SchoolClass } from "@db";
import { useDb } from "@db/provider";
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

const helper = createColumnHelper<ClassRow>();

export function ClassesPage({ q }: { q?: string }) {
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

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("dashboard.classes")}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAddingClass(true)}>
          {t("dashboard.addClass")}
        </button>
      </div>

      {addingClass && <ClassForm key="new" onDone={() => setAddingClass(false)} />}

      <DataTable
        columns={columns as ColumnDef<ClassRow, unknown>[]}
        data={rows}
        getRowId={(schoolClass) => schoolClass.id}
        globalSearchFields={["name"]}
        searchPlaceholder={t("classes.searchPlaceholder")}
        globalFilter={q ?? ""}
        // `replace`, never `push`: a push per keystroke makes Back walk the
        // typed name one character at a time. An empty value drops the param
        // rather than leaving `?q=` on the URL.
        onGlobalFilterChange={(value) => Router.replace("Classes", { q: value || undefined })}
        onRowClick={(schoolClass) => Router.push("Class", { classId: schoolClass.id })}
        emptyMessage={t("dashboard.noClasses")}
      />
    </div>
  );
}
