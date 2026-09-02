import type { Seat, SeatingLayout, Student } from "@db";
import { seatKey } from "@db";
import { useDb } from "@db/provider";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
  armedSeat,
  onArmSeat,
  onSelectStudent,
  editing,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  studentsById: Map<string, Student>;
  /** "row:col" of the armed seat, or null — anchored to the cell's coordinates. */
  armedSeat: string | null;
  onArmSeat: (armedSeat: string | null) => void;
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

  const makeSeat = async (row: number, col: number): Promise<void> => {
    await db.seats.put({ layoutId: layout.id, row, col, studentId: null });
  };

  const makeGap = async (row: number, col: number): Promise<void> => {
    await db.seats.delete(seatKey(layout.id, row, col));
    if (armedSeat === `${row}:${col}`) onArmSeat(null);
  };

  const clearSeat = async (row: number, col: number): Promise<void> => {
    await db.seats.put({ layoutId: layout.id, row, col, studentId: null });
  };

  /**
   * Move a seated pupil into the armed seat.
   *
   * Without this the only way to rearrange a room is to empty a chair and
   * re-assign from the pool, and rearranging is what a seating plan is for.
   * Both writes go in one transaction so a pupil is never briefly in two
   * chairs or in none.
   */
  const movePupil = async (from: Seat, toCoord: string): Promise<void> => {
    const [row, col] = toCoord.split(":").map(Number);
    await db.transaction("rw", db.seats, async () => {
      await db.seats.put({ layoutId: layout.id, row, col, studentId: from.studentId });
      await db.seats.put({
        layoutId: layout.id,
        row: from.row,
        col: from.col,
        studentId: null,
      });
    });
    onArmSeat(null);
  };

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
            if (!editing) return <div key={coord} className="h-14 w-16" />;
            return (
              <button
                key={coord}
                type="button"
                className="flex h-14 w-16 flex-col items-center justify-center rounded-md border border-border border-dashed text-[10px] text-text-faint hover:bg-bg-hover"
                onClick={() => void makeSeat(row, col)}
              >
                {t("plan.makeSeat")}
              </button>
            );
          }

          if (seat.studentId === null) {
            const armed = armedSeat === coord;
            return (
              <div key={coord} className="relative">
                <button
                  type="button"
                  aria-pressed={armed}
                  className={`flex h-14 w-16 flex-col items-center justify-center rounded-md border text-[11px] text-text-muted hover:bg-bg-hover ${
                    armed ? "border-accent ring-2 ring-accent" : "border-border"
                  }`}
                  onClick={() => onArmSeat(armed ? null : coord)}
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
                      void makeGap(row, col);
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
                className="flex h-14 w-16 flex-col items-center justify-center rounded-md border border-border text-[11px] text-text-muted hover:bg-bg-hover"
                onClick={() => void clearSeat(row, col)}
              >
                {t("plan.emptySeat")}
              </button>
            );
          }

          return (
            <div key={coord} className="relative">
              <button
                type="button"
                title={armedSeat ? t("plan.moveHere") : undefined}
                className={`flex h-14 w-16 flex-col items-center justify-center gap-0.5 rounded-md border p-1 hover:bg-bg-hover ${
                  armedSeat ? "border-accent border-dashed" : "border-border"
                }`}
                onClick={() => {
                  // With a seat armed, tapping an occupant moves them into it.
                  // With nothing armed, it opens their card.
                  if (armedSeat) void movePupil(seat, armedSeat);
                  else onSelectStudent(student.id);
                }}
              >
                <PupilDisc student={student} />
                <span className="w-full truncate text-[10px] text-text">{student.lastName}</span>
              </button>
              {editing && (
                <button
                  type="button"
                  aria-label={t("plan.clearSeat")}
                  title={t("plan.clearSeat")}
                  className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    void clearSeat(row, col);
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
