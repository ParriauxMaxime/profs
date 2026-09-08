import type { AttendanceRecord, Student } from "@db";
import type { AttendanceValue } from "@domain/attendance";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * The register, when the class has no salle.
 *
 * Attendance is a property of a séance, not of a chair. A salle is an upgrade
 * to the register, never a prerequisite for it — a teacher who never makes a
 * seating plan still takes the register every lesson.
 *
 * A row behaves exactly like a seat: tapping it opens the pupil card, which
 * stays the ONLY place attendance is set. Marks set inline here and through a
 * card on the plan would be two ways to record one fact.
 */
export function RosterRegister({
  students,
  attendance,
  onOpen,
}: {
  students: Student[];
  attendance: AttendanceRecord[];
  onOpen: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const byStudent = new Map(attendance.map((row) => [row.studentId, row.value as AttendanceValue]));

  return (
    <ul className="flex flex-col gap-0 rounded-md border border-border">
      {students.map((student) => {
        const mark = byStudent.get(student.id);
        return (
          // Keyed by the pupil's id, never by position: the list re-sorts as
          // pupils are added and an index would retarget the row.
          <li key={student.id} className="border-border border-b last:border-b-0">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-hover"
              onClick={() => onOpen(student.id)}
            >
              <PupilName student={student} />
              <span
                className={mark === undefined ? "text-text-faint text-sm" : "text-danger text-sm"}
              >
                {mark === undefined ? "" : t(`attendance.${mark}`)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
