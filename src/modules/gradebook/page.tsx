import type { Grade, GradeColumn, Student } from "@db";
import { gradeKey } from "@db";
import { useDb } from "@db/provider";
import type { AverageColumn, AverageGrade } from "@domain/gradebook/average";
import { classStats, studentAverage } from "@domain/gradebook/average";
import { isNumericColumn } from "@domain/gradebook/column";
import type { GradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ColumnTypeIcon } from "../design-system/components/column-type-icon";
import { EditableCell } from "../design-system/components/editable-cell";
import { ColumnForm } from "./components/column-form";

export function GradebookPage({ gradebookId }: { gradebookId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

  const data = useLiveQuery(async () => {
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [periods, columns, students, grades] = await Promise.all([
      db.periods.where("gradebookId").equals(gradebookId).sortBy("order"),
      db.columns.where("gradebookId").equals(gradebookId).sortBy("order"),
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.grades.where("gradebookId").equals(gradebookId).toArray(),
    ]);
    return { gradebook, periods, columns, students, grades };
  }, [db, gradebookId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const activePeriodId = periodId ?? data.periods[0]?.id ?? "";
  const columns = data.columns.filter((c) => c.periodId === activePeriodId);
  const gradeMap = new Map<string, Grade>(
    data.grades.map((g) => [`${g.columnId}|${g.studentId}`, g]),
  );

  const averageColumns: AverageColumn[] = data.columns.map((c) => ({
    id: c.id,
    type: c.type,
    weight: c.weight,
    max: c.max,
    periodId: c.periodId,
  }));

  const gradesByStudent = new Map<string, AverageGrade[]>();
  for (const grade of data.grades) {
    const list = gradesByStudent.get(grade.studentId) ?? [];
    list.push({ columnId: grade.columnId, value: grade.value });
    gradesByStudent.set(grade.studentId, list);
  }

  const averages = new Map<string, number | null>(
    data.students.map((student) => [
      student.id,
      studentAverage(gradesByStudent.get(student.id) ?? [], averageColumns, activePeriodId),
    ]),
  );

  const stats = classStats(
    [...averages.values()].filter((value): value is number => value !== null),
  );

  async function writeGrade(
    column: GradeColumn,
    student: Student,
    next: GradeValue | null,
  ): Promise<void> {
    if (next === null) {
      await db.grades.delete(gradeKey(gradebookId, column.id, student.id));
      return;
    }
    await db.grades.put({
      gradebookId,
      columnId: column.id,
      studentId: student.id,
      value: next,
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{data.gradebook.name}</h2>
        <div className="flex items-center gap-2">
          <select
            className="field"
            value={activePeriodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {data.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => setAddingColumn(true)}>
            {t("gradebook.addColumn")}
          </button>
        </div>
      </div>

      {addingColumn && (
        <ColumnForm
          gradebookId={gradebookId}
          periodId={activePeriodId}
          onDone={() => setAddingColumn(false)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="sticky left-0 z-10 bg-bg px-3 py-2">{t("student.lastName")}</th>
              {columns.map((column) => (
                <th key={column.id} className="min-w-24 px-3 py-2 text-center font-medium">
                  <Link
                    to={Router.Entry({ gradebookId, columnId: column.id })}
                    className="flex flex-col items-center hover:text-accent"
                  >
                    <span className="flex items-center gap-1">
                      <ColumnTypeIcon type={column.type} />
                      {column.label}
                    </span>
                    {isNumericColumn(column.type) && (
                      <span className="text-text-faint text-xs">
                        {t("gradebook.coef", { weight: column.weight })}
                      </span>
                    )}
                  </Link>
                </th>
              ))}
              <th className="min-w-20 px-3 py-2 text-center font-medium">
                {t("gradebook.average")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => (
              <tr key={student.id} className="border-border/50 border-b">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-bg px-3 py-2">
                  {student.lastName} {student.firstName}
                </td>
                {columns.map((column) => (
                  <td key={column.id} className="px-3 py-2 text-center">
                    <EditableCell
                      type={column.type}
                      max={column.max}
                      value={gradeMap.get(`${column.id}|${student.id}`)?.value}
                      onChange={(next) => void writeGrade(column, student, next)}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-medium tabular-nums">
                  {averages.get(student.id) === null || averages.get(student.id) === undefined ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    `${String(averages.get(student.id)).replace(".", ",")}/20`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stats && (
        <dl className="flex flex-wrap gap-6 rounded border border-border p-3 text-sm">
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.mean")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.mean).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.median")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.median).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.min")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.min).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.max")}</dt>
            <dd className="font-medium tabular-nums">{String(stats.max).replace(".", ",")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.count")}</dt>
            <dd className="font-medium tabular-nums">{stats.count}</dd>
          </div>
        </dl>
      )}

      {columns.length === 0 && <p className="text-text-muted">{t("gradebook.noColumns")}</p>}
    </div>
  );
}
