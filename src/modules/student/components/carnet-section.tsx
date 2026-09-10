import type { Gradebook, Student, Subject } from "@db";
import { setGradeNote, writeGrade } from "@db/grades";
import { useDb } from "@db/provider";
import {
  type AverageColumn,
  type AverageGrade,
  classStats,
  studentAverage,
} from "@domain/gradebook/average";
import { evaluateCalculation } from "@domain/gradebook/calculation";
import { formatDecimal } from "@domain/gradebook/decimal";
import { lastMarkedPeriod, positionOnScale } from "@domain/student-summary";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditableCell } from "../../design-system/components/editable-cell";
import { PositionBar } from "../../design-system/components/position-bar";
import { ToggleGroup, ToggleOption } from "../../design-system/components/primitives";

/**
 * One carnet, for one pupil.
 *
 * The period tabs are THIS carnet's own periods. Nothing on this page claims
 * that Maths Écrit's Trimestre 1 and Musique's Semestre 1 are the same span of
 * weeks, because nothing puts them under one control — a `Period` carries no
 * dates, so any such claim would be invented.
 *
 * Rows dispatch on `column.type` rather than assuming a numeric input, so a new
 * column type lands as one more case here instead of a new section on this
 * page. A `rubric` column is the one type that does not fit that shape and is
 * filtered out below: `EditableCell` renders nothing for it, and a grille needs
 * a per-critère surface rather than a cell. See `Known gaps` in `CLAUDE.md`.
 *
 * This component runs its OWN `useLiveQuery`, scoped to one gradebook, rather
 * than reading columns and grades handed down from `StudentPage`. That does
 * not reopen the "loads once and hands down" rule `StudentPage` states for the
 * pupil: `useLiveQuery` keeps rendering its previous result while a re-read is
 * in flight, so committing a mark in this section updates its own figures in
 * place rather than blanking the section the teacher is looking at. Threading
 * every carnet's columns, grades and classmates through the page instead would
 * make that orchestrator load data no other child needs, to satisfy a flash
 * that cannot happen.
 */
export function CarnetSection({
  gradebook,
  subject,
  student,
}: {
  gradebook: Gradebook;
  subject: Subject | undefined;
  student: Student;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  // Held as a period id, never an index: the tabs re-render whenever a mark is
  // committed, and an index would follow a period that moved.
  const [periodId, setPeriodId] = useState<string | null>(null);
  // The period to open when the teacher has chosen none, LATCHED rather than
  // recomputed. `lastMarkedPeriod` reads the marks, so clearing the last mark
  // in the open period changes its answer — and the section then switched to
  // T1 on its own, taking the row just edited off screen under the teacher's
  // finger. Re-resolved only when what it holds is no longer a period of this
  // carnet.
  const defaultPeriodId = useRef<string | null>(null);

  const data = useLiveQuery(async () => {
    const [periods, columns, grades, classmates] = await Promise.all([
      db.periods.where("gradebookId").equals(gradebook.id).sortBy("order"),
      db.columns.where("gradebookId").equals(gradebook.id).sortBy("order"),
      db.grades.where("gradebookId").equals(gradebook.id).toArray(),
      db.students.where("classId").equals(gradebook.classId).toArray(),
    ]);
    return { periods, columns, grades, classmates };
  }, [db, gradebook.id, gradebook.classId]);

  if (!data) return null;

  const { periods, columns, grades, classmates } = data;
  const gradedColumnIds = grades.filter((g) => g.value !== undefined).map((g) => g.columnId);
  if (!periods.some((p) => p.id === defaultPeriodId.current)) {
    defaultPeriodId.current = lastMarkedPeriod(periods, columns, gradedColumnIds);
  }
  const activePeriodId =
    periodId !== null && periods.some((p) => p.id === periodId)
      ? periodId
      : defaultPeriodId.current;

  const averageColumns: AverageColumn[] = columns.map((c) => ({
    id: c.id,
    type: c.type,
    weight: c.weight,
    max: c.max,
    periodId: c.periodId,
  }));

  // `studentAverage` takes the FULL column list plus a periodId and filters
  // internally: pre-filtering changes results silently, because the weights it
  // normalises against would come from a smaller set.
  const byStudent = new Map<string, AverageGrade[]>();
  for (const grade of grades) {
    if (grade.value === undefined) continue;
    const list = byStudent.get(grade.studentId) ?? [];
    list.push({ columnId: grade.columnId, value: grade.value });
    byStudent.set(grade.studentId, list);
  }

  // `activePeriodId ?? undefined` turns "no period selected" into "every
  // period" for `studentAverage`. The coalesce only fires for a carnet with no
  // periods at all — `lastMarkedPeriod` returns null only then — and a carnet
  // with no periods also has no columns (every column belongs to one), so the
  // average is null either way this resolves.
  const mine = studentAverage(
    byStudent.get(student.id) ?? [],
    averageColumns,
    activePeriodId ?? undefined,
  );
  const classValues = classmates
    .map((mate) =>
      studentAverage(byStudent.get(mate.id) ?? [], averageColumns, activePeriodId ?? undefined),
    )
    .filter((value): value is number => value !== null);
  const stats = classStats(classValues);
  const position = mine === null ? null : positionOnScale(mine, classValues);

  // A `rubric` column is skipped rather than drawn. The dispatch below exists
  // so a new column type lands as one more case, and this is the one type that
  // cannot: `EditableCell` returns null for it, so the row would carry a label,
  // a coefficient and nothing else. A dead row reads as a bug. What a grille
  // needs here is a per-critère surface of its own — see `Known gaps`.
  const periodColumns = columns.filter(
    (column) => column.periodId === activePeriodId && column.type !== "rubric",
  );
  const gradeFor = (columnId: string) =>
    grades.find((g) => g.columnId === columnId && g.studentId === student.id);

  const decimal = (value: number): string => formatDecimal(value, i18n.language);

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium">
          {subject && (
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: subject.color }}
            />
          )}
          {gradebook.name}
        </h3>
        <span className="font-semibold tabular-nums">
          {mine === null ? t("student.noMark") : decimal(mine)}
          {stats && (
            <span className="ml-2 font-normal text-sm text-text-muted">
              {t("student.classAverage", { value: decimal(stats.mean) })}
            </span>
          )}
        </span>
      </div>

      {periods.length > 1 && (
        <ToggleGroup label={t("gradebook.period")}>
          {periods.map((period) => (
            <ToggleOption
              key={period.id}
              selected={period.id === activePeriodId}
              onSelect={() => setPeriodId(period.id)}
            >
              {period.name}
            </ToggleOption>
          ))}
        </ToggleGroup>
      )}

      {position && mine !== null && stats && (
        <PositionBar
          fraction={position.fraction}
          meanFraction={position.meanFraction}
          minLabel={decimal(position.min)}
          maxLabel={decimal(position.max)}
          description={t("student.positionDescription", {
            value: decimal(mine),
            min: decimal(position.min),
            max: decimal(position.max),
            mean: decimal(position.mean),
          })}
        />
      )}

      <ul className="flex flex-col gap-1">
        {periodColumns.map((column) => {
          const grade = gradeFor(column.id);
          const isCalculation = column.type === "calculation";
          // `evaluateCalculation(spec, sources, grades)` — the spec off the
          // column, and every column of the carnet (unfiltered, unlike the
          // grid) as the candidate sources. No pre-filter to numeric-only is
          // needed: `normalisedValue`/`rawValue` in calculation.ts already
          // reject any grade whose value isn't numeric, so a non-numeric
          // column contributes nothing either way.
          const computed =
            isCalculation && column.calculation
              ? evaluateCalculation(
                  column.calculation,
                  columns.map((c) => ({ id: c.id, max: c.max, weight: c.weight })),
                  byStudent.get(student.id) ?? [],
                )
              : null;

          return (
            <li
              key={column.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className="break-words font-medium text-sm">{column.label}</span>
                <span className="text-text-faint text-xs">
                  {t("student.coefficient", { value: column.weight })}
                </span>
              </span>
              <EditableCell
                type={column.type}
                max={column.max}
                value={
                  isCalculation
                    ? computed === null
                      ? undefined
                      : { type: "numeric", value: computed }
                    : grade?.value
                }
                note={isCalculation ? undefined : grade?.note}
                // A calculation stores nothing: EditableCell renders the type
                // read-only, so neither callback can be reached.
                onChange={(next) =>
                  isCalculation
                    ? Promise.resolve()
                    : writeGrade(db, gradebook.id, column.id, student.id, next)
                }
                onNoteChange={(next) =>
                  isCalculation
                    ? Promise.resolve()
                    : setGradeNote(db, gradebook.id, column.id, student.id, next)
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
