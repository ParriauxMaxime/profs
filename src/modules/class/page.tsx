import type { Student, StudentGroup } from "@db";
import { deleteClass, deleteGroup, deleteStudent } from "@db/cascade";
import { useDb } from "@db/provider";
import { filterByGroup, groupsForStudent } from "@domain/group";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { DataTable } from "../design-system/components/data-table";
import { Chip } from "../design-system/components/primitives";
import { PupilName } from "../design-system/components/pupil-name";
import { ClassForm } from "./components/class-form";
import { CsvImport } from "./components/csv-import";
import { GroupFilter } from "./components/group-filter";
import { GroupForm } from "./components/group-form";
import { StudentForm } from "./components/student-form";

const helper = createColumnHelper<Student>();

export function ClassPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | "new" | null>(null);
  // Held as a group id, never an index: a deleted group must fall back to
  // "Tous" (handled by GroupFilter/filterByGroup), not to whatever now sits
  // at that position.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

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
  const groups = useLiveQuery(
    () => db.studentGroups.where("classId").equals(classId).sortBy("name"),
    [db, classId],
  );
  const memberships = useLiveQuery(async () => {
    if (!groups || groups.length === 0) return [];
    const groupIds = groups.map((g) => g.id);
    return await db.groupMembers.where("groupId").anyOf(groupIds).toArray();
  }, [db, groups]);

  const columns = useMemo(
    () => [
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        // Through PupilName like every other surname in the app, rather than
        // repeating the styling here. The accessor keeps returning the raw
        // value, so sorting and the global search still work on what the
        // teacher typed.
        cell: (info) => <PupilName student={info.row.original} format="surname" />,
      }),
      helper.accessor("firstName", { header: () => t("student.firstName") }),
      helper.display({
        id: "groups",
        header: () => t("group.title"),
        cell: (info) => {
          const mine = groupsForStudent(groups ?? [], memberships ?? [], info.row.original.id);
          if (mine.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1">
              {mine.map((group) => (
                <Chip key={group.id} color={group.color}>
                  {group.name}
                </Chip>
              ))}
            </div>
          );
        },
      }),
      helper.display({
        id: "actions",
        header: () => "",
        cell: (info) => {
          const student = info.row.original;
          return (
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setEditing(student)}>
                {t("common.edit")}
              </button>
              <ConfirmButton
                danger
                label={t("common.delete")}
                confirmLabel={t("class.confirmDelete")}
                onConfirm={() => deleteStudent(db, student.id)}
              />
            </div>
          );
        },
      }),
    ],
    [t, db, groups, memberships],
  );

  if (schoolClass === undefined || students === undefined || groups === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const visibleStudents = filterByGroup(students, memberships ?? [], selectedGroupId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
          {schoolClass.level && (
            <span className="text-sm text-text-muted">{schoolClass.level}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setRenaming(true)}>
            {t("class.rename")}
          </button>
          <ConfirmButton
            danger
            label={t("class.deleteClass")}
            confirmLabel={t("class.confirmDeleteClass")}
            onConfirm={async () => {
              await deleteClass(db, classId);
              // The class page cannot survive its own class: without this the
              // route would render "Classe introuvable" instead of going back
              // to a list the teacher can act on.
              Router.push("Home");
            }}
          />
          <Link className="btn" to={Router.Plan({ classId })}>
            {t("plan.title")}
          </Link>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            {t("class.importCsv")}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            {t("class.addStudent")}
          </button>
        </div>
      </div>

      {renaming && (
        // Keyed by class id: the form captures its defaults at mount.
        <ClassForm
          key={schoolClass.id}
          schoolClass={schoolClass}
          onDone={() => setRenaming(false)}
        />
      )}

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

      <section className="flex flex-col gap-2 rounded border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-sm text-text-muted">{t("group.title")}</h3>
          <button
            type="button"
            className="btn"
            onClick={() => setEditingGroup("new")}
            disabled={editingGroup === "new"}
          >
            {t("group.add")}
          </button>
        </div>

        {groups.length > 0 && (
          <>
            <GroupFilter
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={setSelectedGroupId}
            />
            <ul className="flex flex-col gap-1">
              {groups.map((group) => {
                const count = (memberships ?? []).filter((m) => m.groupId === group.id).length;
                return (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded p-1"
                  >
                    <Chip color={group.color}>
                      {group.name} · {t("group.memberCount", { count })}
                    </Chip>
                    <div className="flex gap-2">
                      <button type="button" className="btn" onClick={() => setEditingGroup(group)}>
                        {t("common.edit")}
                      </button>
                      <ConfirmButton
                        // Keyed by group id: an armed delete must not survive
                        // onto a different group if the list reorders.
                        key={group.id}
                        danger
                        label={t("common.delete")}
                        confirmLabel={t("group.confirmDelete", { count })}
                        onConfirm={async () => {
                          await deleteGroup(db, group.id);
                          if (selectedGroupId === group.id) setSelectedGroupId(null);
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {editingGroup === "new" && (
          <GroupForm
            key="new"
            classId={classId}
            students={students}
            onDone={() => setEditingGroup(null)}
          />
        )}
        {editingGroup && editingGroup !== "new" && (
          // Keyed by group id: the form captures its name, colour and
          // membership at mount.
          <GroupForm
            key={editingGroup.id}
            classId={classId}
            students={students}
            group={editingGroup}
            memberIds={(memberships ?? [])
              .filter((m) => m.groupId === editingGroup.id)
              .map((m) => m.studentId)}
            onDone={() => setEditingGroup(null)}
          />
        )}
      </section>

      <DataTable
        columns={columns as ColumnDef<Student, unknown>[]}
        data={visibleStudents}
        // The row keys must be student ids: the actions cell holds an armed
        // delete, and an index key would let a sort or a search hand that
        // armed button to a different student.
        getRowId={(student) => student.id}
        globalSearchFields={["lastName", "firstName"]}
        emptyMessage={t("class.noStudents")}
      />
    </div>
  );
}
