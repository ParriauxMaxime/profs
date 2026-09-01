import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ClassForm } from "../class/components/class-form";

export function DashboardPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [addingClass, setAddingClass] = useState(false);

  const data = useLiveQuery(async () => {
    const [classes, subjects, gradebooks, students] = await Promise.all([
      db.classes.toArray(),
      db.subjects.toArray(),
      db.gradebooks.toArray(),
      db.students.toArray(),
    ]);
    return { classes, subjects, gradebooks, students };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? "";
  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const headcount = (classId: string) => data.students.filter((s) => s.classId === classId).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">{t("dashboard.classes")}</h2>
          <button type="button" className="btn btn-primary" onClick={() => setAddingClass(true)}>
            {t("dashboard.addClass")}
          </button>
        </div>

        {addingClass && <ClassForm key="new" onDone={() => setAddingClass(false)} />}

        {data.classes.length === 0 ? (
          <p className="text-text-muted">{t("dashboard.noClasses")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.classes.map((schoolClass) => (
              <li key={schoolClass.id}>
                <Link
                  to={Router.Class({ classId: schoolClass.id })}
                  className="block rounded border border-border p-3 hover:bg-bg-hover"
                >
                  <span className="font-medium">{schoolClass.name}</span>
                  <span className="ml-2 text-sm text-text-muted">
                    {t("dashboard.studentCount", { count: headcount(schoolClass.id) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-lg">{t("dashboard.gradebooks")}</h2>
        {data.gradebooks.length === 0 ? (
          <p className="text-text-muted">{t("dashboard.noGradebooks")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.gradebooks.map((gradebook) => (
              <li key={gradebook.id}>
                <Link
                  to={Router.Gradebook({ gradebookId: gradebook.id })}
                  className="block rounded border border-border p-3 hover:bg-bg-hover"
                >
                  <span className="font-medium">{subjectName(gradebook.subjectId)}</span>
                  <span className="ml-2 text-sm text-text-muted">
                    {className(gradebook.classId)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
