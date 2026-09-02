import type { Student } from "@db";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * The pool of pupils holding no seat. Tap-only: arm a seat in the grid first,
 * then tap a chip here to assign it — there is no drag.
 */
export function UnseatedPool({
  students,
  armedSeat,
  onAssign,
}: {
  students: Student[];
  armedSeat: string | null;
  onAssign: (studentId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="font-medium text-sm text-text-muted">{t("plan.unseated")}</h3>
      {students.length === 0 ? (
        <p className="text-text-muted text-sm">{t("plan.allSeated")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {armedSeat === null && (
            <p className="w-full text-text-faint text-xs">{t("plan.tapSeatThenStudent")}</p>
          )}
          {students.map((student) => (
            <button
              key={student.id}
              type="button"
              disabled={armedSeat === null}
              className="btn flex min-h-11 items-center gap-1.5 text-sm disabled:cursor-not-allowed"
              onClick={() => onAssign(student.id)}
            >
              <PupilName student={student} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
