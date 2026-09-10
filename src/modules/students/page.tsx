import type { Student } from "@db";
import { useDb } from "@db/provider";
import { compareStudents, STUDENT_SORT_COLUMNS } from "@domain/student-list";
import { type ColumnSort, paramsFromSorting, sortingFromParams } from "@domain/table-sort";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";
import { PupilName } from "../design-system/components/pupil-name";

/**
 * The class name is carried ON the row rather than looked up in a cell, so
 * that Classe sorts and so that the accent-insensitive search still reaches
 * it — "eloise" finds Éloïse, "3°B" finds everyone in 3°B.
 *
 * `classLabel` and not `className`: a data field called `className` inside a
 * React component is a reader's trap, and this codebase has renamed for less
 * (`SchoolClass` over `class`, `Desk` over `Table`).
 */
type StudentRow = Student & { classLabel: string };

const helper = createColumnHelper<StudentRow>();

/**
 * Every pupil in the workspace, searchable and filterable by class.
 *
 * Its own destination because looking a child up — before a parents' evening,
 * or when a colleague asks — used to mean remembering which class they are in
 * and drilling through it. Both filters live in the URL so that going into a
 * pupil and coming back does not throw away what the teacher typed.
 */
export function StudentsPage({
  q,
  classe,
  sort,
  dir,
}: {
  q?: string;
  classe?: string;
  sort?: string;
  dir?: string;
}) {
  const { t } = useTranslation();
  const db = useDb();

  const data = useLiveQuery(async () => {
    const [students, classes] = await Promise.all([
      db.students.orderBy("lastName").toArray(),
      db.classes.orderBy("name").toArray(),
    ]);
    return { students, classes };
  }, [db]);

  const rows = useMemo<StudentRow[]>(() => {
    if (!data) return [];
    const names = new Map(data.classes.map((c) => [c.id, c.name]));
    return data.students.map((student) => ({
      ...student,
      classLabel: names.get(student.classId) ?? "",
    }));
  }, [data]);

  // Held as a class ID, never an index, and a class that no longer exists
  // reads as "Toutes" rather than as an empty list — the same rule
  // `resolveGroupSelection` applies to the group filter. Tolerant of `data`
  // still loading (`?.`) because this, `sorting` and `listParams` below must
  // all be computed before `columns`, and `columns` is a hook that has to run
  // on every render — including the one where `data` isn't back yet — or React
  // sees a different number of hooks between renders.
  const selectedClassId = classe && data?.classes.some((c) => c.id === classe) ? classe : null;

  // A `?sort=` naming a column that does not exist falls back to the default
  // order rather than sorting by a phantom column — the same resolve-or-ignore
  // rule `?classe` follows just above. Memoized because `sortingFromParams`
  // returns a fresh array every call, and both `listParams` below and
  // DataTable's own `sorting` prop need a stable reference to avoid
  // recomputing or re-rendering on every pass.
  const sorting = useMemo(() => sortingFromParams(sort, dir, STUDENT_SORT_COLUMNS), [sort, dir]);

  // What the pupil page needs to rebuild this exact list for its arrows.
  // Memoized so the `columns` memo below — which depends on it — does not
  // recompute on every render, only when the list actually changes shape.
  const listParams = useMemo(
    () => ({
      q: q || undefined,
      classe: selectedClassId ?? undefined,
      ...paramsFromSorting(sorting),
    }),
    [q, selectedClassId, sorting],
  );

  const columns = useMemo(
    () => [
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        size: 40,
        // Through PupilName like every other surname in the app. The accessor
        // still returns the raw stored value, so sorting and the search read
        // what the teacher typed rather than the capitals CSS renders.
        cell: (info) => (
          <Link
            to={Router.Student({ studentId: info.row.original.id, ...listParams })}
            className="font-medium hover:underline"
          >
            <PupilName student={info.row.original} format="surname" />
          </Link>
        ),
        // The shared comparator, so the rows and the pupil page's `‹ ›`
        // arrows can never disagree about this list's order.
        sortingFn: (a, b, columnId) =>
          compareStudents(a.original, b.original, [{ id: columnId, desc: false }]),
      }),
      helper.accessor("firstName", {
        header: () => t("student.firstName"),
        size: 35,
        sortingFn: (a, b, columnId) =>
          compareStudents(a.original, b.original, [{ id: columnId, desc: false }]),
      }),
      helper.accessor("classLabel", {
        header: () => t("students.columnClass"),
        size: 25,
        cell: (info) => <span className="text-text-muted">{info.getValue()}</span>,
        sortingFn: (a, b, columnId) =>
          compareStudents(a.original, b.original, [{ id: columnId, desc: false }]),
      }),
    ],
    // `listParams` is a dependency, not an omission: a memo that skipped it
    // would capture whatever `listParams` was on the render that first built
    // the surname's `Link`, handing every later pupil the wrong `‹ ›` list.
    [t, listParams],
  );

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const visibleRows = selectedClassId
    ? rows.filter((row) => row.classId === selectedClassId)
    : rows;

  // ONE place that knows every param this page owns. There are four now, and a
  // handler naming only the one it changes silently clears the others — a bug
  // that costs the teacher a filter they set and reports nothing. Callers pass
  // only what they are changing; "" clears a param, absent leaves it alone.
  const replaceParams = (next: { q?: string; classe?: string; sorting?: ColumnSort[] }) =>
    Router.replace("Students", {
      q: (next.q ?? q) || undefined,
      classe: (next.classe ?? selectedClassId ?? "") || undefined,
      ...paramsFromSorting(next.sorting ?? sorting),
    });

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        // The heading is pinned WITH the search and the columns rather than
        // above them: 360 pupils is the one list long enough that scrolling
        // loses which list you are in.
        header={<h2 className="font-semibold text-lg">{t("nav.students")}</h2>}
        columns={columns as ColumnDef<StudentRow, unknown>[]}
        data={visibleRows}
        getRowId={(student) => student.id}
        globalSearchFields={["lastName", "firstName", "classLabel"]}
        searchPlaceholder={t("students.searchPlaceholder")}
        globalFilter={q ?? ""}
        onGlobalFilterChange={(value) => replaceParams({ q: value })}
        sorting={sorting}
        onSortingChange={(next) => replaceParams({ sorting: next })}
        onRowClick={(student) => Router.push("Student", { studentId: student.id, ...listParams })}
        // The class filter runs before DataTable ever sees the rows, so an
        // empty result for a chosen class is not "no pupils at all" — pick
        // the message that matches which one actually happened.
        emptyMessage={selectedClassId ? t("students.noneInClass") : t("students.none")}
        // Keeps today's echo of the query. It is how a teacher notices they
        // typed "brenard" rather than "bernard"; the generic "Aucun résultat"
        // would not. The class filter needs no mention — the select visibly
        // shows what it is set to.
        noResultsMessage={t("students.noMatch", { query: q ?? "" })}
        toolbar={
          // A control with one option does nothing.
          data.classes.length > 1 ? (
            <select
              className="field"
              aria-label={t("students.classFilterLabel")}
              value={selectedClassId ?? ""}
              onChange={(e) => replaceParams({ classe: e.target.value })}
            >
              <option value="">{t("students.allClasses")}</option>
              {data.classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
    </div>
  );
}
