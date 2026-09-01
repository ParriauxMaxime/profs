import type { Student } from "@db";
import { deleteStudent } from "@db/cascade";
import { useDb } from "@db/provider";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTable } from "../design-system/components/data-table";
import { CsvImport } from "./components/csv-import";
import { StudentForm } from "./components/student-form";

const helper = createColumnHelper<Student>();

export function ClassPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // An explicit null distinguishes "no such class" from "still loading":
  // useLiveQuery gives undefined for both, and the page would otherwise sit on
  // "Chargement…" forever for a class that has been deleted.
  const schoolClass = useLiveQuery(
    async () => (await db.classes.get(classId)) ?? null,
    [db, classId],
  );
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );

  const columns = useMemo(
    () => [
      helper.accessor("lastName", { header: () => t("student.lastName") }),
      helper.accessor("firstName", { header: () => t("student.firstName") }),
      helper.display({
        id: "actions",
        header: () => "",
        cell: (info) => {
          const student = info.row.original;
          const isConfirming = confirmingDeleteId === student.id;
          return (
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setEditing(student)}>
                {t("common.edit")}
              </button>
              {isConfirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      await deleteStudent(db, student.id);
                      setConfirmingDeleteId(null);
                    }}
                  >
                    {t("class.confirmDelete")}
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmingDeleteId(null)}>
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmingDeleteId(student.id)}
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
          );
        },
      }),
    ],
    [t, db, confirmingDeleteId],
  );

  if (schoolClass === undefined || students === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            {t("class.importCsv")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            {t("class.addStudent")}
          </button>
        </div>
      </div>

      {editing === "new" && (
        <StudentForm key="new" classId={classId} onDone={() => setEditing(null)} />
      )}
      {editing && editing !== "new" && (
        <StudentForm
          key={editing.id}
          classId={classId}
          student={editing}
          onDone={() => setEditing(null)}
        />
      )}

      {importing && (
        <CsvImport
          classId={classId}
          existing={students.map((s) => ({ lastName: s.lastName, firstName: s.firstName }))}
          onDone={() => setImporting(false)}
        />
      )}

      <DataTable
        columns={columns as ColumnDef<Student, unknown>[]}
        data={students}
        globalSearchFields={["lastName", "firstName"]}
        emptyMessage={t("class.noStudents")}
      />
    </div>
  );
}
