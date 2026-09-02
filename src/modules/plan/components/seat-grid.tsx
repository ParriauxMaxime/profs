import type { Seat, SeatingLayout, Student } from "@db";
import { useDb } from "@db/provider";
import { clearSeat, makeGap, makeSeat } from "@db/seating";
import type { Held } from "@domain/seating";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/** A stable colour for a pupil with no photo, picked from the id — not random. */
function colorFor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i += 1) {
    hash = (hash * 31 + studentId.charCodeAt(i)) | 0;
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

function initials(student: Student): string {
  const a = student.firstName.trim().charAt(0);
  const b = student.lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase();
}

/** One occupied seat's disc: the pupil's photo, or their initials on a colour. */
function PupilDisc({ student }: { student: Student }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!student.photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(student.photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [student.photo]);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="h-8 w-8 rounded-full object-cover"
        width={32}
        height={32}
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full font-semibold text-white text-xs"
      style={{ background: colorFor(student.id) }}
    >
      {initials(student)}
    </div>
  );
}

export function SeatGrid({
  layout,
  seats,
  studentsById,
  held,
  onHoldSeat,
  onDrop,
  onSelectStudent,
  editing,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  studentsById: Map<string, Student>;
  /** Who is held, or null. A seat is a target only while something is held. */
  held: Held | null;
  /** Pick up the occupant of a seat. Only reachable in layout-edit mode. */
  onHoldSeat: (row: number, col: number) => void;
  /** Drop whoever is held onto this cell. */
  onDrop: (row: number, col: number) => void;
  onSelectStudent: (studentId: string) => void;
  /**
   * Layout-edit mode. The controls that carve gaps and empty chairs are
   * destructive and small, so they exist only here — never on the grid a
   * teacher is tapping mid-lesson, where a mis-tap would remove a seat.
   */
  editing: boolean;
}) {
  const { t } = useTranslation();
  const db = useDb();

  const byCoord = new Map<string, Seat>();
  for (const seat of seats) byCoord.set(`${seat.row}:${seat.col}`, seat);

  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      cells.push({ row, col });
    }
  }

  const onMakeSeat = (row: number, col: number): Promise<void> => makeSeat(db, layout.id, row, col);

  const onMakeGap = (row: number, col: number): Promise<void> => makeGap(db, layout.id, row, col);

  const onClearSeat = (row: number, col: number): Promise<void> =>
    clearSeat(db, layout.id, row, col);

  return (
    <div className="paper overflow-x-auto rounded-md border border-border">
      <div
        className="grid w-max gap-1.5 p-2"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
      >
        {cells.map(({ row, col }) => {
          const coord = `${row}:${col}`;
          const seat = byCoord.get(coord);

          if (!seat) {
            // Outside layout-edit mode a gap is just empty floor, not a control.
            if (!editing) return <div key={coord} className="h-14 w-20" />;
            return (
              <button
                key={coord}
                type="button"
                className="flex h-14 w-20 flex-col items-center justify-center rounded-md border border-border border-dashed text-[10px] text-text-faint hover:bg-bg-hover"
                onClick={() => void onMakeSeat(row, col)}
              >
                {t("plan.makeSeat")}
              </button>
            );
          }

          if (seat.studentId === null) {
            return (
              <div key={coord} className="relative">
                <button
                  type="button"
                  disabled={held === null}
                  className={`flex h-14 w-20 flex-col items-center justify-center rounded-md border text-[11px] text-text-muted disabled:cursor-default ${
                    held !== null
                      ? "border-accent border-dashed bg-accent/10 hover:bg-bg-hover"
                      : "border-border"
                  }`}
                  onClick={() => onDrop(row, col)}
                >
                  {t("plan.emptySeat")}
                </button>
                {editing && (
                  <button
                    type="button"
                    aria-label={t("plan.makeGap")}
                    title={t("plan.makeGap")}
                    className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onMakeGap(row, col);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          }

          const student = studentsById.get(seat.studentId);
          if (!student) {
            // The pupil was deleted elsewhere; the seat row is stale until the
            // teacher clears it. Render it as empty rather than crashing.
            return (
              <button
                key={coord}
                type="button"
                className="flex h-14 w-20 flex-col items-center justify-center rounded-md border border-border text-[11px] text-text-muted hover:bg-bg-hover"
                onClick={() => void onClearSeat(row, col)}
              >
                {t("plan.emptySeat")}
              </button>
            );
          }

          const isHeldSeat = held?.kind === "seat" && held.row === row && held.col === col;

          return (
            <div key={coord} className="relative">
              <button
                type="button"
                title={held ? t("plan.moveHere") : undefined}
                className={`flex h-14 w-20 flex-col items-center justify-center gap-0.5 rounded-md border p-1 hover:bg-bg-hover ${
                  isHeldSeat
                    ? "border-accent ring-2 ring-accent"
                    : held
                      ? "border-accent border-dashed"
                      : "border-border"
                }`}
                onClick={() => {
                  // Something held: this seat is a target.
                  // Nothing held, layout-edit mode: pick this pupil up.
                  // Nothing held, normal mode: open their card. That last
                  // branch is the gesture of the lesson itself — attendance
                  // and behaviour — and it stays the bare tap.
                  if (held) onDrop(row, col);
                  else if (editing) onHoldSeat(row, col);
                  else onSelectStudent(student.id);
                }}
              >
                <PupilDisc student={student} />
                <span className="w-full truncate text-[10px] text-text">
                  <PupilName student={student} format="surname" />
                </span>
              </button>
              {editing && (
                <button
                  type="button"
                  aria-label={t("plan.clearSeat")}
                  title={t("plan.clearSeat")}
                  className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onClearSeat(row, col);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
