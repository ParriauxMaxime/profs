import type { SchoolClass, Student } from "@db";
import { deleteStudent } from "@db/cascade";
import { useDb } from "@db/provider";
import { setStudentNotes, setStudentPhoto } from "@db/students";
import type { StudentListParams, StudentNeighbours } from "@domain/student-list";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { StudentForm } from "../../class/components/student-form";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { PhotoInput } from "../../design-system/components/photo-input";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * Who this child is, and everything about the person rather than the record.
 *
 * The notes field sits open rather than behind a disclosure. It holds
 * accommodations — PAP, PPRE, tiers-temps — and an accommodation is the thing
 * that should change how every figure below it is read; a note consulted often
 * behind a triangle is a note nobody opens. The cost, that a conseil de classe
 * is a room with colleagues in it, is accepted in the design.
 *
 * The arrows are drawn only when this pupil is actually in a list. Reached from
 * a seat on the plan there is none, and drawing them would invent one.
 */
export function StudentHeader({
  student,
  schoolClass,
  studentCount,
  listParams,
  position,
}: {
  student: Student;
  schoolClass: SchoolClass | null;
  studentCount: number;
  listParams: StudentListParams;
  position: StudentNeighbours | null;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(student.notes ?? "");
  // Another surface can write these notes while this page is open — the card,
  // from a seat — and dexie-react-hooks keeps both live. Re-sync from the row
  // unless the teacher is typing here, or an incoming update stomps the draft.
  const notesFocused = useRef(false);
  useEffect(() => {
    if (!notesFocused.current) setNotes(student.notes ?? "");
  }, [student.notes]);

  const go = (studentId: string | null): void => {
    if (studentId === null) return;
    Router.push("Student", { studentId, ...listParams });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PhotoInput
            value={student.photo}
            onChange={(photo) => void setStudentPhoto(db, student.id, photo ?? null)}
          />
          <div className="flex min-w-0 flex-col">
            <span className="break-words font-semibold text-lg">
              <PupilName student={student} />
            </span>
            {schoolClass && (
              <Link to={Router.Class({ classId: schoolClass.id })} className="text-accent text-sm">
                {schoolClass.name}
              </Link>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {position && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn"
                aria-label={t("student.previous")}
                disabled={position.previousId === null}
                onClick={() => go(position.previousId)}
              >
                ‹
              </button>
              <span className="text-sm text-text-muted tabular-nums">
                {t("student.position", { index: position.index, total: position.total })}
              </span>
              <button
                type="button"
                className="btn"
                aria-label={t("student.next")}
                disabled={position.nextId === null}
                onClick={() => go(position.nextId)}
              >
                ›
              </button>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
          <ConfirmButton
            danger
            label={t("common.delete")}
            confirmLabel={t("student.confirmDelete")}
            body={t("student.confirmDeleteBody")}
            onConfirm={async () => {
              const classId = student.classId;
              await deleteStudent(db, student.id);
              // A page cannot stay on a pupil who no longer exists, and this
              // is not a destination to come back to — `replace`, so Back does
              // not return to a dead URL.
              Router.replace("ClassStudents", { classId });
            }}
          />
        </div>
      </div>

      {editing && (
        // Keyed by the pupil: react-hook-form captures defaultValues at mount,
        // so without it stepping to the next pupil with the form open would
        // write one child's name onto another.
        <StudentForm
          key={student.id}
          classId={student.classId}
          student={student}
          studentCount={studentCount}
          onDone={() => setEditing(false)}
        />
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea
          className="field"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onFocus={() => {
            notesFocused.current = true;
          }}
          onBlur={() => {
            notesFocused.current = false;
            if (notes !== (student.notes ?? "")) void setStudentNotes(db, student.id, notes);
          }}
        />
        <span className="text-text-faint text-xs">{t("student.notesHint")}</span>
      </label>
    </div>
  );
}
