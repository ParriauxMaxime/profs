import { setColumnCriteria } from "@db/criterion-levels";
import { useDb } from "@db/provider";
import type { RubricCriterion } from "@domain/rubric";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { CriteriaEditor } from "./components/criteria-editor";
import { RubricGrid } from "./grid";

/**
 * The class matrix for one rubric column — the header's door, mirroring
 * `EntryPage` for a numeric column. A pupil's own cell opens their critères
 * one at a time; this page is every pupil against every critère at once.
 *
 * An explicit `null` distinguishes "no such column" (or one belonging to
 * another gradebook, or not a rubric column at all) from "still loading" —
 * `useLiveQuery` returns `undefined` for both, same as `EntryPage`.
 */
export function RubricColumnPage({
  gradebookId,
  columnId,
}: {
  gradebookId: string;
  columnId: string;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [draftCriteria, setDraftCriteria] = useState<RubricCriterion[]>([]);

  const data = useLiveQuery(async () => {
    const column = await db.columns.get(columnId);
    // The column must belong to the gradebook in the URL and be a rubric
    // column. Without both checks this route renders one carnet's roster
    // against another's column, or a matrix over a numeric column with no
    // critère to draw.
    if (!column || column.gradebookId !== gradebookId || column.type !== "rubric") return null;
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [students, levels] = await Promise.all([
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.criterionLevels.where("columnId").equals(columnId).toArray(),
    ]);
    return { column, students, levels };
  }, [db, gradebookId, columnId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("rubric.notFound")}</p>;

  const { column, students, levels } = data;
  const criteria = column.criteria ?? [];

  async function saveCriteria(): Promise<void> {
    await setColumnCriteria(db, columnId, draftCriteria);
    setEditingCriteria(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={Router.Gradebook({ gradebookId })} className="text-accent">
          ← {t("entry.backToGrid")}
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-semibold text-lg">{column.label}</h2>
          {column.date !== undefined && (
            <span className="text-sm text-text-muted">
              {new Date(column.date).toLocaleDateString(i18n.language)}
            </span>
          )}
        </div>
        {!editingCriteria && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraftCriteria(criteria);
              setEditingCriteria(true);
            }}
          >
            {t("rubric.editCriteria")}
          </button>
        )}
      </div>

      {editingCriteria ? (
        <div className="flex flex-col gap-3 rounded border border-border p-3">
          <CriteriaEditor value={draftCriteria} onChange={setDraftCriteria} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void saveCriteria()}>
              {t("common.save")}
            </button>
            <button type="button" className="btn" onClick={() => setEditingCriteria(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : criteria.length === 0 ? (
        <p className="text-text-muted">{t("rubric.noCriteria")}</p>
      ) : (
        <RubricGrid
          db={db}
          columnId={columnId}
          criteria={criteria}
          students={students}
          levels={levels}
        />
      )}
    </div>
  );
}
