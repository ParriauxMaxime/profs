import type { Seat, SeatingLayout, Student } from "@db";
import { useDb } from "@db/provider";
import { clearSeat, removeTable } from "@db/seating";
import { compareReadingOrder, type Held, TABLE } from "@domain/room";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * How many pixels one half-tile is worth.
 *
 * A table is `TABLE` units square, so it renders 72 × 72 — a hair wider than
 * phase 5's cell and comfortably past the 44px live-entry floor.
 */
const UNIT_PX = 36;

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

/** One occupied table's disc: the pupil's photo, or their initials on a colour. */
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

/**
 * The room: tables at free positions, not a grid of cells.
 *
 * There is no gap branch any more. A cell no row existed for used to be an
 * aisle the teacher had carved, and it needed a control to carve and uncarve
 * it; with free positions an aisle is simply floor, and floor is nothing to
 * render.
 */
export function RoomView({
  layout,
  seats,
  studentsById,
  held,
  onHoldSeat,
  onDropSeat,
  onSelectStudent,
  editing,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  studentsById: Map<string, Student>;
  /** Who is held, or null. A table is a target only while something is held. */
  held: Held | null;
  /** Pick up the occupant of a table, by the table's id. */
  onHoldSeat: (seatId: string) => void;
  /** Drop whoever is held onto this table. */
  onDropSeat: (seatId: string) => void;
  onSelectStudent: (studentId: string) => void;
  /**
   * Layout-edit mode. The controls that remove a table and empty a chair are
   * destructive and small, so they exist only here — never on the room a
   * teacher is tapping mid-lesson, where a mis-tap would take a table out.
   */
  editing: boolean;
}) {
  const { t } = useTranslation();
  const db = useDb();

  // Reading order in the DOM, so Tab moves front-to-back through the room
  // rather than in whatever order IndexedDB handed the rows back.
  const ordered = [...seats].sort(compareReadingOrder);

  const tableStyle = (seat: Seat) => ({
    left: seat.x * UNIT_PX,
    top: seat.y * UNIT_PX,
    width: TABLE * UNIT_PX,
    height: TABLE * UNIT_PX,
  });

  return (
    <div className="paper overflow-auto rounded-md border border-border p-2">
      <div
        className="relative"
        style={{ width: layout.width * UNIT_PX, height: layout.height * UNIT_PX }}
      >
        {/* The board is fixed at the top and is not a control: an arc and a U
            are meaningless without something to face, and this is the whole of
            the orientation model. */}
        <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-center rounded bg-bg-hover font-medium text-text-faint text-xs tracking-wide">
          {t("plan.board")}
        </div>

        {ordered.map((seat) => {
          if (seat.studentId === null) {
            return (
              <div key={seat.id} className="absolute" style={tableStyle(seat)}>
                <button
                  type="button"
                  disabled={held === null}
                  title={held ? t("plan.moveHere") : undefined}
                  className={`flex h-full w-full flex-col items-center justify-center rounded-md border text-[11px] text-text-muted disabled:cursor-default ${
                    held !== null
                      ? "border-accent border-dashed bg-accent/10 hover:bg-bg-hover"
                      : "border-border"
                  }`}
                  onClick={() => onDropSeat(seat.id)}
                >
                  {t("plan.emptySeat")}
                </button>
                {editing && (
                  <button
                    type="button"
                    aria-label={t("plan.removeTable")}
                    title={t("plan.removeTable")}
                    className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeTable(db, seat.id);
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
            // The pupil was deleted elsewhere; the table row is stale until the
            // teacher clears it. Render it as empty rather than crashing —
            // and while something is held it is a target like every other
            // table, not a clear button that would swallow the gesture.
            return (
              <button
                key={seat.id}
                type="button"
                title={held ? t("plan.moveHere") : undefined}
                className={`absolute flex flex-col items-center justify-center rounded-md border text-[11px] text-text-muted hover:bg-bg-hover ${
                  held !== null ? "border-accent border-dashed bg-accent/10" : "border-border"
                }`}
                style={tableStyle(seat)}
                onClick={() => {
                  if (held) onDropSeat(seat.id);
                  else void clearSeat(db, seat.id);
                }}
              >
                {t("plan.emptySeat")}
              </button>
            );
          }

          const isHeldSeat =
            (held?.kind === "seat" || held?.kind === "table") && held.seatId === seat.id;

          return (
            <div key={seat.id} className="absolute" style={tableStyle(seat)}>
              <button
                type="button"
                title={held ? t("plan.moveHere") : undefined}
                // Only the table in hand is announced as pressed; the others
                // are targets, not toggles, so they carry no state at all.
                aria-pressed={isHeldSeat || undefined}
                className={`flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-md border p-1 hover:bg-bg-hover ${
                  isHeldSeat
                    ? "border-accent ring-2 ring-accent"
                    : held
                      ? "border-accent border-dashed"
                      : "border-border"
                }`}
                onClick={() => {
                  // Something held: this table is a target.
                  // Nothing held, layout-edit mode: pick this pupil up.
                  // Nothing held, normal mode: open their card. That last
                  // branch is the gesture of the lesson itself — attendance
                  // and behaviour — and it stays the bare tap.
                  if (held) onDropSeat(seat.id);
                  else if (editing) onHoldSeat(seat.id);
                  else onSelectStudent(student.id);
                }}
              >
                <PupilDisc student={student} />
                <span className="w-full truncate px-1 text-[10px] text-text">
                  <PupilName student={student} format="surname" />
                </span>
              </button>
              {editing && (
                <>
                  {/* Two different gestures, so two controls. `×` takes the
                      TABLE out of the room; this one frees the PLACE and
                      leaves the table standing. After a stamp fills every
                      table there may be no empty one to drop a pupil onto, and
                      without this the only way to unseat somebody would be to
                      remove their table and put a new one back. */}
                  <button
                    type="button"
                    aria-label={t("plan.freeSeat")}
                    title={t("plan.freeSeat")}
                    className="-left-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      void clearSeat(db, seat.id);
                    }}
                  >
                    ↩
                  </button>
                  <button
                    type="button"
                    aria-label={t("plan.removeTable")}
                    title={t("plan.removeTable")}
                    className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeTable(db, seat.id);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
