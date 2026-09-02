import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { GradebookForm } from "../components/gradebook-form";
import type { ClassTabProps } from "./types";

/**
 * This class's carnets.
 *
 * This is the only way into a grid, and that is a deliberate reversal of phase
 * 4a's flat list: the hop it removed was expensive because the class page was
 * a dead end. A class that carries the register, the journal and the carnets
 * is not a detour on the way to marking — a teacher marking Maths 3°B is very
 * often about to look at who was absent.
 */
export function ClassBooksTab({ classId }: ClassTabProps) {
  const { t } = useTranslation();
  const db = useDb();
  const [adding, setAdding] = useState(false);

  const data = useLiveQuery(async () => {
    const [schoolClass, gradebooks, subjects] = await Promise.all([
      db.classes.get(classId),
      db.gradebooks.where("classId").equals(classId).toArray(),
      db.subjects.toArray(),
    ]);
    return { schoolClass: schoolClass ?? null, gradebooks, subjects };
  }, [db, classId]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data.schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? "";
  const subjectColor = (id: string) => data.subjects.find((s) => s.id === id)?.color;
  // A carnet joins a class to a subject, so with no subject there is nothing
  // to create. Réglages is where subjects are added.
  const canCreate = data.subjects.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-sm text-text-muted">{t("class.tab.books")}</h3>
        {canCreate && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            {t("dashboard.addGradebook")}
          </button>
        )}
      </div>

      {adding && canCreate && (
        <GradebookForm
          key="new"
          schoolClass={data.schoolClass}
          subjects={data.subjects}
          onDone={() => setAdding(false)}
        />
      )}

      {!canCreate && <p className="text-text-muted">{t("settings.noSubjects")}</p>}

      {data.gradebooks.length === 0 ? (
        canCreate && <p className="text-text-muted">{t("dashboard.noGradebooks")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.gradebooks.map((gradebook) => (
            <li key={gradebook.id}>
              <Link
                to={Router.Gradebook({ gradebookId: gradebook.id })}
                className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-3 hover:bg-bg-hover"
                style={{ borderLeft: `4px solid ${subjectColor(gradebook.subjectId)}` }}
              >
                <span className="grow font-medium">{gradebook.name}</span>
                <span className="text-sm text-text-muted">{subjectName(gradebook.subjectId)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
