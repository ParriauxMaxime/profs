import type { Grade } from "@db";
import { gradeKey } from "@db";
import { useDb } from "@db/provider";
import { formatGradeValue, parseGradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { NumberPad } from "../design-system/components/number-pad";

export function EntryPage({ gradebookId, columnId }: { gradebookId: string; columnId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  // True for the duration of an in-flight commit's IndexedDB write. While
  // true, Suivant, the roster rows and the keypad are all disabled so a
  // second tap cannot advance `index` again before the first commit's
  // `setDraft(null)` has landed — that race silently skipped a student and
  // dropped keystrokes (see the entry-mode fix report).
  const [isCommitting, setIsCommitting] = useState(false);

  const data = useLiveQuery(async () => {
    const column = await db.columns.get(columnId);
    if (!column) return null;
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [students, grades] = await Promise.all([
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.grades.where("columnId").equals(columnId).toArray(),
    ]);
    return { column, students, grades };
  }, [db, gradebookId, columnId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const { column, students } = data;
  const byStudent = new Map<string, Grade>(data.grades.map((g) => [g.studentId, g]));
  const current = students[index];
  const isNumeric = column.type === "numeric";

  // Commits the draft for the student CURRENTLY on screen, then clears it.
  // Callers must await this before changing `index`, so a draft typed for
  // student A can never be applied against student B — see the awaited
  // call sites below. `isCommitting` is set for the duration so re-entrant
  // taps (Suivant, roster rows, keypad) are inert until this settles.
  async function commit(): Promise<void> {
    if (!current || draft === null) return;
    setIsCommitting(true);
    try {
      const parsed = parseGradeValue(column.type, draft, isNumeric ? column.max : undefined);
      if (parsed === null) {
        await db.grades.delete(gradeKey(gradebookId, columnId, current.id));
      } else {
        await db.grades.put({
          gradebookId,
          columnId,
          studentId: current.id,
          value: parsed,
          updatedAt: Date.now(),
        });
      }
      setDraft(null);
    } finally {
      setIsCommitting(false);
    }
  }

  async function next(): Promise<void> {
    if (isCommitting) return;
    await commit();
    setIndex((i) => Math.min(i + 1, students.length - 1));
  }

  async function jumpTo(i: number): Promise<void> {
    if (isCommitting) return;
    await commit();
    setIndex(i);
  }

  const stored = current ? byStudent.get(current.id)?.value : undefined;
  const shown =
    draft !== null
      ? draft
      : stored === undefined
        ? ""
        : formatGradeValue(stored, isNumeric ? column.max : undefined);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={Router.Gradebook({ gradebookId })} className="text-accent">
          ← {t("entry.backToGrid")}
        </Link>
        <span className="text-sm text-text-muted">
          {index + 1}/{students.length}
        </span>
      </div>

      <div className="rounded border border-border p-3 text-center">
        <p className="font-medium">{column.label}</p>
        <p className="text-sm text-text-muted">
          {t("gradebook.coef", { weight: column.weight })} — /{column.max}
        </p>
      </div>

      {current ? (
        <>
          {isNumeric ? (
            <>
              <div className="rounded border border-border p-4 text-center">
                <p className="font-semibold text-lg">
                  {current.lastName} {current.firstName}
                </p>
                <p className="mt-2 font-bold text-3xl tabular-nums">
                  {shown === "" ? <span className="text-text-faint">—</span> : shown}
                </p>
              </div>

              <NumberPad
                disabled={isCommitting}
                onDigit={(digit) => {
                  if (isCommitting) return;
                  setDraft((d) => (d ?? "") + digit);
                }}
                onDecimal={() => {
                  if (isCommitting) return;
                  setDraft((d) => ((d ?? "").includes(",") ? d : `${d ?? ""},`));
                }}
                onBackspace={() => {
                  if (isCommitting) return;
                  setDraft((d) => (d ?? "").slice(0, -1));
                }}
                onNext={() => void next()}
              />
            </>
          ) : null}

          <ul className="flex flex-col gap-1 text-sm">
            {students.map((student, i) => (
              <li key={student.id}>
                <button
                  type="button"
                  disabled={isCommitting}
                  className={[
                    "flex w-full justify-between rounded px-2 py-1 text-left",
                    i === index ? "bg-bg-hover font-medium" : "",
                  ].join(" ")}
                  onClick={() => void jumpTo(i)}
                >
                  <span>
                    {student.lastName} {student.firstName}
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {(() => {
                      const value = byStudent.get(student.id)?.value;
                      if (value === undefined) return "—";
                      // The stored value stays the raw domain string; only the
                      // displayed label is translated.
                      if (value.type === "attendance") {
                        return t(`gradebook.attendance.${value.value}`);
                      }
                      return formatGradeValue(value);
                    })()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-text-muted">{t("class.noStudents")}</p>
      )}
    </div>
  );
}
