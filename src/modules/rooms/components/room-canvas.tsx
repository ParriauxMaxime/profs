import type { Desk } from "@db";
import {
  type FreeEdges,
  freeEdges,
  type Position,
  TABLE,
  type TableGroup,
  tableGroups,
} from "@domain/room";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The salle, drawn.
 *
 * Owns the floor, the scale, the board and the merged tables — and NO gesture
 * beyond reporting where the floor was touched. The two screens that use it
 * have entirely different grammars (furniture on one, pupils on the other),
 * and the previous room view tangled both into one component, which is how a
 * tap came to mean two things depending on invisible state.
 */

/**
 * How many pixels one half-tile is worth.
 *
 * A desk is `TABLE` units square, so it renders 72 × 72 — comfortably past the
 * 44px live-entry floor.
 */
export const UNIT_PX = 36;

/**
 * The scale below which a place stops being tappable.
 *
 * `TABLE * UNIT_PX` is a place's natural size (72); this is the factor at
 * which it renders at exactly 44px. Below it, scale-to-fit would trade a
 * gesture for a glance: the room would still be visible, but a thumb could no
 * longer land on a place. Derived from the constants rather than written as
 * `0.611`, so the relationship survives anyone changing either.
 */
const MIN_SCALE = 44 / (TABLE * UNIT_PX);

/** The wall's thickness, kept here because the fit has to subtract it. */
const WALL_PX = 6;

/**
 * Fit the room to the screen — down to a floor, not all the way to a dot.
 *
 * Never above 1: a four-table salle stays its natural size rather than
 * ballooning. Never below `MIN_SCALE`: past that a room you can see but cannot
 * tap is a picture, not a seating plan. The wrapper scrolls, so a room too
 * wide even at the floor stays reachable — fitting wins down to the touch
 * floor, scrolling wins past it.
 */
function useFitScale(roomWidthPx: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      // Less the wall: 6px of border either side, which is not floor and
      // cannot hold a table.
      const available = entry.contentRect.width - 2 * WALL_PX;
      const fit = available > 0 ? available / roomWidthPx : 1;
      setScale(Math.min(1, Math.max(MIN_SCALE, fit)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [roomWidthPx]);
  return [ref, scale];
}

/**
 * Where a place's chair sits, given which of its sides are free.
 *
 * The near edge wins when it is available, because that is where a pupil sits
 * in a row. Otherwise the chair takes whichever side faces open room — the
 * arms of a horseshoe seat people facing across it — and a place hemmed in on
 * all four sides (the middle of a large island) gets none, which is correct:
 * nobody can reach it.
 */
function chairStyle(
  edge: FreeEdges,
  desk: { x: number },
  group: { x: number; width: number },
): React.CSSProperties {
  const long = 32;
  const short = 13;
  const inset = (TABLE * UNIT_PX - long) / 2;
  const bottom = {
    left: inset,
    bottom: -short,
    width: long,
    height: short,
    borderRadius: "0 0 6px 6px",
  };
  const right = {
    top: inset,
    right: -short,
    width: short,
    height: long,
    borderRadius: "0 6px 6px 0",
  };
  const left = {
    top: inset,
    left: -short,
    width: short,
    height: long,
    borderRadius: "6px 0 0 6px",
  };
  const top = { left: inset, top: -short, width: long, height: short, borderRadius: "6px 6px 0 0" };

  if (edge.bottom) return bottom;
  // Which SIDE cannot be decided from the free edges alone: both arms of a
  // horseshoe are one place wide, so both have a free left and a free right,
  // and a fixed preference seats one arm facing out of the room. The chair
  // faces the table's own centre instead, which puts both arms facing across
  // the U — where the pupils in them actually look.
  const facingRight = desk.x + TABLE / 2 < group.x + group.width / 2;
  if (facingRight && edge.right) return right;
  if (!facingRight && edge.left) return left;
  if (edge.right) return right;
  if (edge.left) return left;
  if (edge.top) return top;
  // Hemmed in on all four sides — the middle of a large island. Correct: it
  // cannot be reached, so nobody sits there.
  return { display: "none" };
}

/** Snap a pointer offset, in unscaled px, to the whole-tile cell under it. */
function cellAt(offsetX: number, offsetY: number): Position {
  const toCell = (px: number) => Math.max(0, Math.round(px / UNIT_PX / TABLE) * TABLE);
  return { x: toCell(offsetX - (TABLE * UNIT_PX) / 2), y: toCell(offsetY - (TABLE * UNIT_PX) / 2) };
}

export interface RoomCanvasProps {
  room: { width: number; height: number };
  desks: Desk[];
  /** What sits on a place: a pupil, a label, nothing. */
  renderPlace: (desk: Desk) => React.ReactNode;
  /** Interactivity for a place — handlers, title, aria. The canvas adds none. */
  placeProps?: (desk: Desk) => React.HTMLAttributes<HTMLDivElement> & { className?: string };
  /** Anchored to a whole table rather than a place: the editor's × control. */
  renderTableOverlay?: (group: TableGroup<Desk>) => React.ReactNode;
  /** The floor was tapped, or something was dropped on it, at this cell. */
  onFloor?: (at: Position) => void;
  /** Shown centred when the salle holds no furniture at all. */
  emptyHint?: string;
}

export function RoomCanvas({
  room,
  desks,
  renderPlace,
  placeProps,
  renderTableOverlay,
  onFloor,
  emptyHint,
}: RoomCanvasProps) {
  const { t } = useTranslation();
  const roomWidthPx = room.width * UNIT_PX;
  const roomHeightPx = room.height * UNIT_PX;
  const [wrapperRef, scale] = useFitScale(roomWidthPx);

  const groups = tableGroups(desks);

  const floorHandlers = onFloor
    ? {
        onClick: (e: React.MouseEvent<HTMLDivElement>) => {
          onFloor(cellAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY));
        },
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          // Without this the drop never fires: the default is to refuse.
          e.preventDefault();
        },
        onDrop: (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          onFloor(cellAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY));
        },
      }
    : {};

  return (
    // Two elements, and they cannot be one. The outer one MEASURES, so it has
    // to be full width; the wall HUGS the scaled room, so it has to be
    // content-sized. Putting the ref on the wall makes the observed width the
    // room's own, and the scale then never shrinks to fit anything.
    // The scroll lives HERE, on the full-width measurer, not on the wall.
    // Below `MIN_SCALE` the room deliberately stops shrinking, so it can be
    // wider than its column — and a `w-fit` wall then pushes its siblings off
    // the screen instead of scrolling. That is how the rail disappeared.
    <div ref={wrapperRef} className="w-full overflow-x-auto">
      <div
        className="w-fit rounded-lg border-6 p-0"
        style={{
          borderColor: "var(--wall)",
          boxShadow: "inset 0 0 0 2px var(--wall-inner)",
          background: "var(--floor)",
        }}
      >
        <div style={{ width: roomWidthPx * scale, height: roomHeightPx * scale }}>
          <div
            className="relative overflow-hidden"
            style={{
              width: roomWidthPx,
              height: roomHeightPx,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              // The seams are the coordinate grid, not a second grid over it.
              backgroundColor: "var(--floor)",
              backgroundImage: [
                "linear-gradient(45deg, var(--floor-alt) 25%, transparent 25% 75%, var(--floor-alt) 75%)",
                `repeating-linear-gradient(to right, var(--floor-seam) 0 1px, transparent 1px ${UNIT_PX}px)`,
                `repeating-linear-gradient(to bottom, var(--floor-seam) 0 1px, transparent 1px ${UNIT_PX}px)`,
              ].join(","),
              backgroundSize: `${TABLE * UNIT_PX}px ${TABLE * UNIT_PX}px, auto, auto`,
            }}
          >
            {/* The floor sits UNDER the furniture, so a drop on a table is the
              table's business and a drop on bare floor is the room's. */}
            <div className="absolute inset-0" {...floorHandlers} />

            {/* Fixed at the top and not a control: an arc and a horseshoe are
              meaningless without something to face, and this is the whole of
              the orientation model. */}
            <div
              className="pointer-events-none absolute flex items-center justify-center rounded-sm font-medium text-[11px] tracking-widest"
              style={{
                left: 4 * UNIT_PX,
                right: 4 * UNIT_PX,
                top: 10,
                height: 26,
                background: "var(--board)",
                border: "3px solid var(--board-frame)",
                color: "var(--board-ink)",
              }}
            >
              {t("plan.board")}
            </div>

            {emptyHint && desks.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-text-muted">
                {emptyHint}
              </div>
            )}

            {groups.map((group) => (
              <div
                key={group.desks[0].id}
                className="absolute flex rounded"
                style={{
                  left: group.x * UNIT_PX,
                  top: group.y * UNIT_PX,
                  width: group.width * UNIT_PX,
                  height: group.height * UNIT_PX,
                }}
              >
                {group.desks.map((desk) => {
                  const extra = placeProps?.(desk) ?? {};
                  const { className, ...rest } = extra;
                  // Bordered only where no sibling abuts. That is what draws a
                  // merged table: the seam down a table de deux disappears, and
                  // a horseshoe keeps the opening it is built around instead of
                  // being outlined as the rectangle enclosing it.
                  const edge = freeEdges(desk, group.desks);
                  const line = "2px solid var(--wood-edge)";
                  return (
                    <div
                      key={desk.id}
                      className={`absolute flex flex-col items-center justify-center gap-0.5 p-1 ${className ?? ""}`}
                      style={{
                        // Positioned within the group, so a merged table is one
                        // wooden surface and the places are drawn on top of it.
                        left: (desk.x - group.x) * UNIT_PX,
                        top: (desk.y - group.y) * UNIT_PX,
                        width: TABLE * UNIT_PX,
                        height: TABLE * UNIT_PX,
                        background: "var(--wood)",
                        color: "var(--wood-ink)",
                        borderTop: edge.top ? line : undefined,
                        borderRight: edge.right ? line : undefined,
                        borderBottom: edge.bottom ? line : undefined,
                        borderLeft: edge.left ? line : undefined,
                        borderTopLeftRadius: edge.top && edge.left ? 4 : 0,
                        borderTopRightRadius: edge.top && edge.right ? 4 : 0,
                        borderBottomLeftRadius: edge.bottom && edge.left ? 4 : 0,
                        borderBottomRightRadius: edge.bottom && edge.right ? 4 : 0,
                        // The front edge and the floor shadow belong to the
                        // OUTSIDE of a table, so only a place with open air
                        // below it carries them.
                        boxShadow: edge.bottom
                          ? "inset 0 3px 0 var(--wood-hi), 0 4px 0 var(--wood-edge), 0 7px 10px var(--room-shadow)"
                          : "inset 0 3px 0 var(--wood-hi)",
                      }}
                      {...rest}
                    >
                      {/* A chair marks where one place ends. With the surface
                        continuous there is no internal border to do it, and a
                        chair is how a teacher reads a real classroom anyway.

                        It goes on a FREE side, preferring the near edge. Pinned
                        to the bottom it vanished behind the next place on any
                        table taller than one — the arms of a horseshoe showed
                        no chairs at all, so their places did not read as
                        places. Whoever sits in an arm faces across the room,
                        and their chair is on the side facing it. */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute"
                        style={{
                          ...chairStyle(edge, desk, group),
                          background: "var(--chair)",
                          border: "2px solid var(--wood-edge)",
                        }}
                      />
                      {renderPlace(desk)}
                    </div>
                  );
                })}
                {/* The outline goes over the places, so a merged table reads as
                  one object with no seam down its middle. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded"
                  style={{
                    border: "2px solid var(--wood-edge)",
                    boxShadow: "0 4px 0 var(--wood-edge), 0 7px 10px var(--room-shadow)",
                  }}
                />
                {renderTableOverlay?.(group)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
