import type { Student, StudentGroup } from "@db";
import { deleteGroup, deleteStudent } from "@db/cascade";
import { useDb } from "@db/provider";
import { filterByGroup, groupsForStudent } from "@domain/group";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { DataTable } from "../../design-system/components/data-table";
import { Chip } from "../../design-system/components/primitives";
import { PupilName } from "../../design-system/components/pupil-name";
import { StudentCard } from "../../plan/components/student-card";
import { CsvImport } from "../components/csv-import";
import { GroupForm } from "../components/group-form";
import { StudentForm } from "../components/student-form";
import type { ClassTabProps } from "./types";

const helper = createColumnHelper<Student>();

/**
 * The roster: who is in this class, which groups they belong to, and the card
 * that opens on any of them.
 *
 * The card is the same component the seating plan opens, so a pupil looks the
 * same wherever they are tapped. It records attendance only when a session is
 * selected — attendance belongs to a lesson, and the roster is not one.
 */
export function ClassStudentsTab({
  classId,
  students,
  groups,
  memberships,
  selectedGroupId,
  onSelectGroup,
  selectedSessionId,
}: ClassTabProps) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | "new" | null>(null);
  // The pupil whose card is open, held as an id: the table sorts and searches
  // underneath the card, and a row index would open a different pupil.
  const [cardStudentId, setCardStudentId] = useState<string | null>(null);

  const session = useLiveQuery(
    async () => (selectedSessionId ? ((await db.sessions.get(selectedSessionId)) ?? null) : null),
    [db, selectedSessionId],
  );

  const columns = useMemo(
    () => [
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        // Through PupilName like every other surname in the app, rather than
        // repeating the styling here. The accessor keeps returning the raw
        // value, so sorting and the global search still work on what the
        // teacher typed.
        cell: (info) => (
          <button
            type="button"
            className="text-left hover:underline"
            aria-label={t("class.openCard")}
            onClick={() => setCardStudentId(info.row.original.id)}
          >
            <PupilName student={info.row.original} format="surname" />
          </button>
        ),
      }),
      helper.accessor("firstName", { header: () => t("student.firstName") }),
      helper.display({
        id: "groups",
        header: () => t("group.title"),
        cell: (info) => {
          const mine = groupsForStudent(groups, memberships, info.row.original.id);
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

  const visibleStudents = filterByGroup(students, memberships, selectedGroupId);
  const cardStudent =
    cardStudentId === null ? null : (students.find((s) => s.id === cardStudentId) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => setImporting(true)}>
          {t("class.importCsv")}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          {t("class.addStudent")}
        </button>
      </div>

      {editing === "new" && (
        <StudentForm
          key="new"
          classId={classId}
          studentCount={students.length}
          onDone={() => setEditing(null)}
        />
      )}
      {editing && editing !== "new" && (
        <StudentForm
          key={editing.id}
          classId={classId}
          student={editing}
          studentCount={students.length}
          onDone={() => setEditing(null)}
        />
      )}

      {importing && (
        <CsvImport
          classId={classId}
          existing={students.map((s) => ({ lastName: s.lastName, firstName: s.firstName }))}
          studentCount={students.length}
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
          <ul className="flex flex-col gap-1">
            {groups.map((group) => {
              const count = memberships.filter((m) => m.groupId === group.id).length;
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
                        if (selectedGroupId === group.id) onSelectGroup(null);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
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
            memberIds={memberships
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

      {cardStudent && (
        <StudentCard
          key={cardStudent.id}
          student={cardStudent}
          session={session ?? null}
          onClose={() => setCardStudentId(null)}
        />
      )}
    </div>
  );
}
