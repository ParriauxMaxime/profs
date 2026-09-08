import type { Gradebook, SchoolClass, Subject } from "@db";
import { useDb } from "@db/provider";
import {
  type AverageColumn,
  type AverageGrade,
  classStats,
  studentAverage,
} from "@domain/gradebook/average";
import { formatDecimal } from "@domain/gradebook/decimal";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { GradebookForm } from "./gradebook-form";

/**
 * Access, not a grid.
 *
 * A gradebook grid is a wide scrolling table and stays a full-screen route of
 * its own — that is why the flat `/gradebooks` list was removed and marking
 * starts at the class. What belongs here is the way in, and enough of a
 * summary to choose between two carnets.
 *
 * It also keeps the only path that creates a carnet: this class, one subject.
 * The old Carnets tab held it, and losing it with the tab would have left the
 * app unable to start marking at all.
 */
export function CarnetsPanel({
  schoolClass,
  gradebooks,
  subjects,
}: {
  schoolClass: SchoolClass;
  gradebooks: Gradebook[];
  subjects: Subject[];
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [adding, setAdding] = useState(false);
  const classId = schoolClass.id;
  // A carnet joins a class to a subject, so with no subject there is nothing
  // to create. Réglages is where subjects are added.
  const canCreate = subjects.length > 0;

  // `studentAverage` takes the FULL column list plus a periodId and filters
  // internally — passing an already-filtered list changes results silently.
  // No periodId here on purpose: the panel summarises the whole carnet, not
  // one trimestre, and choosing a period is what the grid is for.
  // `classStats` then takes the pupils' averages as plain numbers.
  const averages = useLiveQuery(async () => {
    const students = await db.students.where("classId").equals(classId).toArray();
    const entries = await Promise.all(
      gradebooks.map(async (book) => {
        const columns = await db.columns.where("gradebookId").equals(book.id).toArray();
        const grades = await db.grades.where("gradebookId").equals(book.id).toArray();
        const averageColumns: AverageColumn[] = columns.map((c) => ({
          id: c.id,
          type: c.type,
          weight: c.weight,
          max: c.max,
          periodId: c.periodId,
        }));
        const byStudent = new Map<string, AverageGrade[]>();
        for (const grade of grades) {
          // A note-only row (no mark yet) has nothing for the average to
          // consume.
          if (grade.value === undefined) continue;
          const list = byStudent.get(grade.studentId) ?? [];
          list.push({ columnId: grade.columnId, value: grade.value });
          byStudent.set(grade.studentId, list);
        }
        const values = students
          .map((student) => studentAverage(byStudent.get(student.id) ?? [], averageColumns))
          .filter((value): value is number => value !== null);
        return [book.id, classStats(values)?.mean ?? null] as const;
      }),
    );
    return Object.fromEntries(entries);
  }, [db, classId, gradebooks]);

  const subjectName = (id: string): string => subjects.find((s) => s.id === id)?.name ?? "";
  const subjectColor = (id: string): string | undefined => subjects.find((s) => s.id === id)?.color;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
          {t("class.books")}
        </h3>
        {canCreate && (
          <button type="button" className="btn" onClick={() => setAdding(true)} disabled={adding}>
            {t("dashboard.addGradebook")}
          </button>
        )}
      </div>

      {adding && canCreate && (
        <GradebookForm
          key="new"
          schoolClass={schoolClass}
          subjects={subjects}
          onDone={() => setAdding(false)}
        />
      )}

      {!canCreate && <p className="text-sm text-text-muted">{t("settings.noSubjects")}</p>}

      {gradebooks.length === 0 ? (
        <p className="text-sm text-text-muted">{t("gradebook.none")}</p>
      ) : (
        gradebooks.map((book) => {
          const mean = averages?.[book.id] ?? null;
          return (
            <div
              key={book.id}
              className="flex flex-col gap-1 border-border border-t pt-2"
              style={{ borderLeft: `4px solid ${subjectColor(book.subjectId) ?? "transparent"}` }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="pl-2 font-semibold text-sm">{book.name}</span>
                {/* Through formatDecimal, never toFixed: French writes 13,4.
                    Never formatDecimalExact — that one is for seeding an
                    editor, and this is display. */}
                <span className="tabular-nums text-sm">
                  {mean === null ? "—" : formatDecimal(mean, i18n.language)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pl-2">
                <span className="text-sm text-text-muted">{subjectName(book.subjectId)}</span>
                <Link className="btn self-start" to={Router.Gradebook({ gradebookId: book.id })}>
                  {t("gradebook.open")}
                </Link>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
