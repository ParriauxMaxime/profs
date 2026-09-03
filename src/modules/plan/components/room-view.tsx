import type { Seat, SeatingLayout, Student } from "@db";
import { useDb } from "@db/provider";
import { clearSeat, removeTable } from "@db/seating";
import { canPlace, compareReadingOrder, type Held, type Position, TABLE } from "@domain/room";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * How many pixels one half-tile is worth.
 *
 * A table is `TABLE` units square, so it renders 72 × 72 — a hair wider than
 * phase 5's cell and comfortably past the 44px live-entry floor.
 */
const UNIT_PX = 36;

/**
 * The scale below which a table tile stops being tappable.
 *
 * `TABLE * UNIT_PX` is a tile's natural size in pixels (72); this is the
 * scale factor at which that tile renders at exactly 44px — the live-entry
 * floor. Below it, scale-to-fit would trade a gesture for a glance: the room
 * would still be visible, but a teacher's thumb could no longer land on a
 * seat. Derived from `TABLE` and `UNIT_PX` rather than written as `0.611` so
 * the relationship survives anyone changing either constant.
 */
const MIN_SCALE = 44 / (TABLE * UNIT_PX);

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
 * Where a table could go.
 *
 * Whole-tile coordinates only (even x and y): tapping is a one-tile-precision
 * gesture, and the odd coordinates an arc uses are reached with the arrow keys
 * instead. Computing them from the pointer offset was the obvious alternative
 * and is unreachable without a mouse.
 *
 * Bounded by the room the template actually stamped, never by ROOM_MAX.
 */
function floorSlots(layout: SeatingLayout, seats: Seat[]): Position[] {
  const slots: Position[] = [];
  for (let y = 0; y + TABLE <= layout.height; y += TABLE) {
    for (let x = 0; x + TABLE <= layout.width; x += TABLE) {
      if (canPlace(seats, { x, y }, layout)) slots.push({ x, y });
    }
  }
  return slots;
}

/**
 * Fit the room to the screen — down to a floor, not all the way to a dot.
 *
 * At ARC_SPACING = 5, an eighteen-seat arc is ninety units across — over
 * 3000px, which no tablet scrolls comfortably mid-lesson. Never scales ABOVE
 * 1: a four-table room stays its natural size rather than ballooning to fill
 * the screen. And never scales below `MIN_SCALE`: past that point a tile is
 * no longer 44px, and a room you can see but cannot tap is a picture, not a
 * seating plan. The wrapper already scrolls horizontally, so a room too wide
 * even at `MIN_SCALE` stays reachable — fitting wins down to the touch
 * floor, scrolling wins past it.
 */
function useFitScale(roomWidthPx: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      const fit = available > 0 ? available / roomWidthPx : 1;
      setScale(Math.min(1, Math.max(MIN_SCALE, fit)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [roomWidthPx]);
  return [ref, scale];
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
  onFloor,
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
  /**
   * The teacher tapped bare floor here. `RoomView` does not know whether that
   * adds a table or moves the one in hand — `page.tsx` decides, beside
   * `resolveFloorDrop`, where the rest of the gesture grammar already lives.
   */
  onFloor: (at: Position) => void;
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

  const roomWidthPx = layout.width * UNIT_PX;
  const roomHeightPx = layout.height * UNIT_PX;
  const [wrapperRef, scale] = useFitScale(roomWidthPx);

  // Reading order in the DOM, so Tab moves front-to-back through the room
  // rather than in whatever order IndexedDB handed the rows back.
  const ordered = [...seats].sort(compareReadingOrder);

  const tableStyle = (seat: Seat) => ({
    left: seat.x * UNIT_PX,
    top: seat.y * UNIT_PX,
    width: TABLE * UNIT_PX,
    height: TABLE * UNIT_PX,
  });

  /**
   * A per-table control's counter-scale.
   *
   * The `×` and `↩` buttons live INSIDE the scaled room, so at `MIN_SCALE`
   * a 28px button renders at 17px — a destructive control below the 44px tap
   * target this branch derived `MIN_SCALE` from in the first place. Undoing
   * the room's scale on the button holds its on-screen size as the room
   * shrinks. Bumping it to 44px in room units instead would have crowded a
   * 44px tile off its own corner. The origin is the button's own outer
   * corner, so it grows away from the tile rather than across it.
   */
  const controlStyle = (corner: "left" | "right") => ({
    transform: `scale(${1 / scale})`,
    transformOrigin: `top ${corner}`,
  });

  const positionStyle = (at: Position) => ({
    left: at.x * UNIT_PX,
    top: at.y * UNIT_PX,
    width: TABLE * UNIT_PX,
    height: TABLE * UNIT_PX,
  });

  // A held table excludes itself from the collision set, or the slot it
  // currently sits on is the one place it can never move to.
  const collisionSeats = held?.kind === "table" ? seats.filter((s) => s.id !== held.seatId) : seats;
  const slots = editing ? floorSlots(layout, collisionSeats) : [];
  const isEmpty = seats.length === 0 && !editing;

  return (
    <div className="paper overflow-auto rounded-md border border-border p-2">
      <div ref={wrapperRef} style={{ height: roomHeightPx * scale }}>
        <div
          className="relative"
          style={{
            width: roomWidthPx,
            height: roomHeightPx,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* The board is fixed at the top and is not a control: an arc and a U
            are meaningless without something to face, and this is the whole of
            the orientation model. */}
          <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-center rounded bg-bg-hover font-medium text-text-faint text-xs tracking-wide">
            {t("plan.board")}
          </div>

          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-text-faint">
              {t("plan.emptyRoom")}
            </div>
          )}

          {slots.map((at) => {
            // Three states, and the label has to tell the truth about each.
            // A table held: the floor is where it goes. Nothing held: the slot
            // is the control that adds a table. A PUPIL held — reachable,
            // because the rail stays live in layout-edit mode — is neither:
            // "a pupil is never dropped on bare floor" is a deliberate rule,
            // so the slot keeps its name and goes inert rather than offering
            // an action it would decline to perform.
            const movingTable = held?.kind === "table";
            const pupilInHand = held !== null && !movingTable;
            const label = movingTable ? t("plan.moveHere") : t("plan.addTable");
            return (
              <button
                key={`floor-${at.x}-${at.y}`}
                type="button"
                disabled={pupilInHand}
                title={label}
                className="absolute flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border border-dashed text-[11px] text-text-faint hover:bg-bg-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                style={positionStyle(at)}
                onClick={() => onFloor(at)}
              >
                {label}
              </button>
            );
          })}

          {ordered.map((seat) => {
            if (seat.studentId === null) {
              return (
                <div key={seat.id} className="absolute" style={tableStyle(seat)}>
                  <button
                    type="button"
                    disabled={held === null && !editing}
                    title={held ? t("plan.moveHere") : editing ? t("plan.holdTable") : undefined}
                    className={`flex h-full w-full flex-col items-center justify-center rounded-md border text-[11px] text-text-muted disabled:cursor-default ${
                      held !== null
                        ? "border-accent border-dashed bg-accent/10 hover:bg-bg-hover"
                        : "border-border"
                    }`}
                    onClick={() => {
                      // Nothing held, layout-edit mode: an empty table is
                      // furniture like any other, and picking it up is the only
                      // way to move a table nobody is sitting at yet.
                      if (held) onDropSeat(seat.id);
                      else if (editing) onHoldSeat(seat.id);
                    }}
                  >
                    {t("plan.emptySeat")}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      aria-label={t("plan.removeTable")}
                      title={t("plan.removeTable")}
                      className="-right-2 -top-2 absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg text-sm text-text-muted leading-none hover:text-danger"
                      style={controlStyle("right")}
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
                  title={held ? t("plan.moveHere") : editing ? t("plan.holdTable") : undefined}
                  className={`absolute flex flex-col items-center justify-center rounded-md border text-[11px] text-text-muted hover:bg-bg-hover ${
                    held !== null ? "border-accent border-dashed bg-accent/10" : "border-border"
                  }`}
                  style={tableStyle(seat)}
                  onClick={() => {
                    if (held) onDropSeat(seat.id);
                    else if (editing) onHoldSeat(seat.id);
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
                  title={held ? t("plan.moveHere") : editing ? t("plan.holdTable") : undefined}
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
                    // Nothing held, layout-edit mode: pick the TABLE up, not the
                    // pupil sitting at it — moving the pupil goes through the
                    // pupil card's Déplacer button instead.
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
                      style={controlStyle("left")}
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
                      style={controlStyle("right")}
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
    </div>
  );
}
