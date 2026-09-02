import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { GradebookForm } from "./components/gradebook-form";

/**
 * Every gradebook in the workspace, flat.
 *
 * Its own destination because marking a pile of copies is the second most
 * common thing a teacher opens this app to do, and it used to mean going
 * through a class to reach a grid.
 */
export function GradebooksPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [addingGradebook, setAddingGradebook] = useState(false);

  const data = useLiveQuery(async () => {
    const [classes, subjects, gradebooks] = await Promise.all([
      db.classes.toArray(),
      db.subjects.toArray(),
      db.gradebooks.toArray(),
    ]);
    return { classes, subjects, gradebooks };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const subjectColor = (id: string) => data.subjects.find((s) => s.id === id)?.color;
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const canCreateGradebook = data.classes.length > 0 && data.subjects.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("dashboard.gradebooks")}</h2>
        {canCreateGradebook && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddingGradebook(true)}
          >
            {t("dashboard.addGradebook")}
          </button>
        )}
      </div>

      {addingGradebook && canCreateGradebook && (
        <GradebookForm
          key="new"
          classes={data.classes}
          subjects={data.subjects}
          onDone={() => setAddingGradebook(false)}
        />
      )}

      {/* A gradebook needs both a class and a subject to point at. Rather
          than offering two empty dropdowns, say which one is missing and
          where it is created. */}
      {data.classes.length === 0 && (
        <p className="text-text-muted">{t("dashboard.gradebooksNeedClass")}</p>
      )}
      {data.classes.length > 0 && data.subjects.length === 0 && (
        <>
          <p className="text-text-muted">{t("dashboard.gradebooksNeedSubject")}</p>
          <Link to={Router.Settings()} className="btn self-start">
            {t("dashboard.goToSubjects")}
          </Link>
        </>
      )}

      {data.gradebooks.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.gradebooks.map((gradebook) => (
            <li key={gradebook.id}>
              <Link
                to={Router.Gradebook({ gradebookId: gradebook.id })}
                className="block rounded border border-border p-3 hover:bg-bg-hover"
                style={{
                  borderLeft: `4px solid ${subjectColor(gradebook.subjectId) ?? "transparent"}`,
                }}
              >
                <span className="font-medium">{gradebook.name}</span>
                <span className="ml-2 text-sm text-text-muted">{className(gradebook.classId)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        canCreateGradebook && <p className="text-text-muted">{t("dashboard.noGradebooks")}</p>
      )}
    </div>
  );
}
