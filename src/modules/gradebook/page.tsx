import type { Grade, GradeColumn, Student } from "@db";
import { gradeKey } from "@db";
import { deleteColumn, deleteGradebook } from "@db/cascade";
import { setGradeNote } from "@db/grades";
import { useDb } from "@db/provider";
import type { AverageColumn, AverageGrade } from "@domain/gradebook/average";
import { classStats, studentAverage } from "@domain/gradebook/average";
import { isNumericColumn } from "@domain/gradebook/column";
import { formatDecimal } from "@domain/gradebook/decimal";
import type { GradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ColumnTypeIcon } from "../design-system/components/column-type-icon";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { EditableCell } from "../design-system/components/editable-cell";
import { ColumnForm } from "./components/column-form";
import { PeriodBar } from "./components/period-bar";

export function GradebookPage({ gradebookId }: { gradebookId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [editingColumn, setEditingColumn] = useState<GradeColumn | null>(null);
  const locale = i18n.language;

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

  // Fall back to the first period whenever the selected one is gone — a
  // deleted period must not leave the grid pointing at an id nothing matches.
  const selectedPeriod = data.periods.find((period) => period.id === periodId);
  const activePeriodId = selectedPeriod?.id ?? data.periods[0]?.id ?? "";
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
    // A note-only row (no mark yet) has nothing for the average to consume.
    if (grade.value === undefined) continue;
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
    // A note is independent of the mark: clearing the value must never take
    // an existing note down with it (put replaces the whole row, so the note
    // has to be carried forward explicitly), and if there is no note either,
    // the row is deleted outright rather than left as an empty husk.
    const existing = gradeMap.get(`${column.id}|${student.id}`);
    if (next === null) {
      if (existing?.note !== undefined) {
        const { value: _dropped, ...rest } = existing;
        await db.grades.put({ ...rest, updatedAt: Date.now() });
      } else {
        await db.grades.delete(gradeKey(gradebookId, column.id, student.id));
      }
      return;
    }
    await db.grades.put({
      ...existing,
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
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn" to={Router.Rubrics({ gradebookId })}>
            {t("rubric.title")}
          </Link>
          {/* A column belongs to a period, so there is nothing to add a column
              to until one exists. */}
          {data.periods.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditingColumn(null);
                setAddingColumn(true);
              }}
            >
              {t("gradebook.addColumn")}
            </button>
          )}
          <ConfirmButton
            danger
            label={t("gradebook.deleteGradebook")}
            confirmLabel={t("gradebook.confirmDeleteGradebook")}
            onConfirm={async () => {
              await deleteGradebook(db, gradebookId);
              // Nothing is left to render on this route once the gradebook is
              // gone, so leave it rather than show "Carnet introuvable".
              Router.push("Home");
            }}
          />
        </div>
      </div>

      <PeriodBar
        gradebookId={gradebookId}
        periods={data.periods}
        activePeriodId={activePeriodId}
        onSelect={setPeriodId}
      />

      {data.periods.length === 0 && <p className="text-text-muted">{t("gradebook.noPeriods")}</p>}

      {addingColumn && (
        <ColumnForm
          key="new"
          gradebookId={gradebookId}
          periodId={activePeriodId}
          onDone={() => setAddingColumn(false)}
        />
      )}

      {editingColumn && (
        // Keyed by column id so switching target remounts the form instead of
        // leaving the previous column's values in its state.
        <ColumnForm
          key={editingColumn.id}
          gradebookId={gradebookId}
          periodId={editingColumn.periodId}
          column={editingColumn}
          onDone={() => setEditingColumn(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="sticky left-0 z-10 bg-bg px-3 py-2">{t("student.lastName")}</th>
              {columns.map((column) => (
                <th key={column.id} className="min-w-24 px-3 py-2 text-center font-medium">
                  <div className="flex flex-col items-center gap-1">
                    {/* Only numeric columns have a fast-entry screen: the entry
                        page renders the card and keypad for numeric columns
                        alone, so linking any other type would lead to a header
                        and a roster with no way to enter anything. */}
                    {isNumericColumn(column.type) ? (
                      <Link
                        to={Router.Entry({ gradebookId, columnId: column.id })}
                        className="flex flex-col items-center hover:text-accent"
                      >
                        <span className="flex items-center gap-1">
                          <ColumnTypeIcon type={column.type} />
                          {column.label}
                        </span>
                        <span className="text-text-faint text-xs">
                          {t("gradebook.coef", { weight: column.weight })}
                        </span>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1">
                        <ColumnTypeIcon type={column.type} />
                        {column.label}
                      </span>
                    )}

                    <div className="flex items-center gap-2 font-normal text-xs">
                      <button
                        type="button"
                        className="text-text-muted hover:text-accent"
                        onClick={() => {
                          setAddingColumn(false);
                          setEditingColumn(column);
                        }}
                      >
                        {t("common.edit")}
                      </button>
                      <ConfirmButton
                        danger
                        variant="link"
                        label={t("common.delete")}
                        confirmLabel={t("gradebook.confirmDeleteColumn")}
                        onConfirm={async () => {
                          await deleteColumn(db, column.id);
                          setEditingColumn((current) =>
                            current?.id === column.id ? null : current,
                          );
                        }}
                      />
                    </div>
                  </div>
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
                      note={gradeMap.get(`${column.id}|${student.id}`)?.note}
                      onChange={(next) => writeGrade(column, student, next)}
                      onNoteChange={(next) =>
                        setGradeNote(db, gradebookId, column.id, student.id, next)
                      }
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-medium tabular-nums">
                  {averages.get(student.id) === null || averages.get(student.id) === undefined ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    `${formatDecimal(averages.get(student.id) as number, locale)}/20`
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
            <dd className="font-medium tabular-nums">{formatDecimal(stats.mean, locale)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.median")}</dt>
            <dd className="font-medium tabular-nums">{formatDecimal(stats.median, locale)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.min")}</dt>
            <dd className="font-medium tabular-nums">{formatDecimal(stats.min, locale)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.max")}</dt>
            <dd className="font-medium tabular-nums">{formatDecimal(stats.max, locale)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("gradebook.stats.count")}</dt>
            <dd className="font-medium tabular-nums">{stats.count}</dd>
          </div>
        </dl>
      )}

      {data.periods.length > 0 && columns.length === 0 && (
        <p className="text-text-muted">{t("gradebook.noColumns")}</p>
      )}
    </div>
  );
}
