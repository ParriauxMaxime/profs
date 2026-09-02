import { useDb } from "@db/provider";
import { fuzzyMatchAny } from "@domain/search";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";

/**
 * Every pupil in the workspace, searchable.
 *
 * Its own destination because looking a child up — before a parents' evening,
 * or when a colleague asks — used to mean remembering which class they are in
 * and drilling through it. The search is accent-insensitive, so "eloise"
 * finds Éloïse.
 */
export function StudentsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [query, setQuery] = useState("");

  const data = useLiveQuery(async () => {
    const [students, classes] = await Promise.all([
      db.students.orderBy("lastName").toArray(),
      db.classes.toArray(),
    ]);
    return { students, classes };
  }, [db]);

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  const className = (id: string) => data.classes.find((c) => c.id === id)?.name ?? "";
  const matches = data.students.filter((student) =>
    fuzzyMatchAny([student.firstName, student.lastName, className(student.classId)], query),
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold text-lg">{t("nav.students")}</h2>

      <input
        type="search"
        className="field max-w-sm"
        placeholder={t("students.searchPlaceholder")}
        aria-label={t("students.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {data.students.length === 0 ? (
        <p className="text-text-muted">{t("students.none")}</p>
      ) : matches.length === 0 ? (
        <p className="text-text-muted">{t("students.noMatch", { query })}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((student) => (
            <li key={student.id}>
              <Link
                to={Router.Student({ studentId: student.id })}
                className="block rounded border border-border p-3 hover:bg-bg-hover"
              >
                <span className="font-medium">
                  {student.lastName} {student.firstName}
                </span>
                <span className="ml-2 text-sm text-text-muted">{className(student.classId)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
