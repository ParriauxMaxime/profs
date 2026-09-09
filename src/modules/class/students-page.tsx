import type { Student, StudentGroup } from "@db";
import { deleteGroup, deleteStudent } from "@db/cascade";
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
import { StudentCard } from "../plan/components/student-card";
import { CsvImport } from "./components/csv-import";
import { GroupFilter } from "./components/group-filter";
import { GroupForm } from "./components/group-form";
import { StudentForm } from "./components/student-form";

const helper = createColumnHelper<Student>();

/**
 * The roster: who is in this class, which groups they belong to, and the card
 * that opens on any of them.
 *
 * Moved here from the class hub's tab set: `/eleves` is a detour from the
 * lesson rather than a panel of it, so it loads exactly what it needs itself
 * — the class, its pupils, its groups and their memberships — the same
 * queries the hub used to run once and hand down as props. The group filter
 * lives here too, for the same reason: this page is the only thing on screen
 * that reads it now.
 *
 * The card opens with no session, unlike on the seating plan: attendance
 * belongs to a lesson, and this page is not one — a teacher marking today's
 * register does it from the plan, where a session is selected.
 */
export function ClassStudentsPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StudentGroup | "new" | null>(null);
  // The pupil whose card is open, held as an id: the table sorts and searches
  // underneath the card, and a row index would open a different pupil.
  const [cardStudentId, setCardStudentId] = useState<string | null>(null);
  // Held as a group id, never an index — see GroupFilter.
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

  const groupsList = groups ?? [];
  const membershipsList = memberships ?? [];

  const columns = useMemo(
    () => [
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        size: 26,
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
      helper.accessor("firstName", { header: () => t("student.firstName"), size: 20 }),
      helper.display({
        id: "groups",
        header: () => t("group.title"),
        size: 28,
        cell: (info) => {
          const mine = groupsForStudent(groupsList, membershipsList, info.row.original.id);
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
        size: 26,
        cell: (info) => {
          const student = info.row.original;
          return (
            // flex-wrap: two full-size (44px floor) text buttons don't fit
            // side by side in this column's ~88px at 375px — they stack
            // instead of forcing the page to scroll sideways. Still one line
            // wherever there's room, e.g. desktop widths.
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setEditing(student)}>
                {t("common.edit")}
              </button>
              <ConfirmButton
                danger
                label={t("common.delete")}
                confirmLabel={t("class.confirmDelete")}
                body={t("class.confirmDeleteBody")}
                onConfirm={() => deleteStudent(db, student.id)}
              />
            </div>
          );
        },
      }),
    ],
    [t, db, groupsList, membershipsList],
  );

  if (schoolClass === undefined || students === undefined || groups === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const visibleStudents = filterByGroup(students, membershipsList, selectedGroupId);
  const cardStudent =
    cardStudentId === null ? null : (students.find((s) => s.id === cardStudentId) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link to={Router.Class({ classId })} className="text-accent text-sm">
          ← {schoolClass.name}
        </Link>
        <h2 className="font-semibold text-lg">{t("class.tab.students")}</h2>
      </div>

      {groups.length > 0 && (
        <GroupFilter
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelect={setSelectedGroupId}
        />
      )}

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
              const count = membershipsList.filter((m) => m.groupId === group.id).length;
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
                      confirmLabel={t("group.confirmDelete")}
                      body={t("group.confirmDeleteBody", { count })}
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
            memberIds={membershipsList
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
          session={null}
          onClose={() => setCardStudentId(null)}
        />
      )}
    </div>
  );
}
