import { deleteRoom } from "@db/cascade";
import { useDb } from "@db/provider";
import {
  addDesk,
  applyShape,
  desksForRoom,
  moveDesk,
  nudgeDesk,
  removeDesk,
  renameRoom,
  resizeRoom,
} from "@db/rooms";
import { minimumExtent, type Position, ROOM_MAX, TABLE } from "@domain/room";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useEscape } from "../shared/use-escape";
import { RoomCanvas } from "./components/room-canvas";
import { TemplateForm } from "./components/template-form";

/**
 * Furnishing a salle. One mode, because there are no pupils on this screen.
 *
 * That is the whole mechanism: with nothing but furniture drawn, a tap can
 * only mean one thing — take this table. The old plan had to redefine a tap on
 * a pupil to mean "pick up the table underneath them", which is where the
 * grammar came apart.
 *
 * Drag is the primary gesture and TAP IS KEPT as its equivalent, sharing one
 * `heldDeskId`. CLAUDE.md rules drag out because the browser automation cannot
 * drive it and there are no component tests — but that ruling was written for
 * the plan a teacher taps mid-lesson, and this screen is used once, sitting
 * down. Keeping the tap path costs nothing, leaves the screen driveable, and
 * supplies the keyboard equivalent the ruling asks for regardless.
 */

/** What is being dragged: an existing desk, or a new one from the palette. */
type Dragging = { kind: "desk"; deskId: string } | { kind: "new" } | null;

/**
 * One dimension of the floor, in whole tiles.
 *
 * Steppers rather than a free number field: the only sensible edits are one
 * more and one less, the floor is bounded on both sides, and a spinner invites
 * typing a number the room will silently refuse. `−` disables at the minimum
 * so the wall being immovable is visible rather than discovered.
 */
function SizeStepper({
  label,
  tiles,
  min,
  onChange,
}: {
  label: string;
  tiles: number;
  min: number;
  onChange: (tiles: number) => void;
}) {
  const max = Math.floor(ROOM_MAX / TABLE);
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        className="btn h-9 min-h-9 w-9 p-0"
        disabled={tiles <= min}
        aria-label={`${label} −`}
        onClick={() => onChange(tiles - 1)}
      >
        −
      </button>
      <span className="tabular w-6 text-center text-sm">{tiles}</span>
      <button
        type="button"
        className="btn h-9 min-h-9 w-9 p-0"
        disabled={tiles >= max}
        aria-label={`${label} +`}
        onClick={() => onChange(tiles + 1)}
      >
        +
      </button>
    </div>
  );
}

export function RoomEditorPage({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  const db = useDb();

  // Anchored to the desk's id, never to its position: a live query tick can
  // move a desk out from under a coordinate between the pick-up and the drop.
  const [heldDeskId, setHeldDeskId] = useState<string | null>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const dragging = useRef<Dragging>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const release = useCallback(() => {
    setHeldDeskId(null);
    setSelectedDeskId(null);
  }, []);
  useEscape(release);

  const room = useLiveQuery(async () => (await db.rooms.get(roomId)) ?? null, [db, roomId]);
  const desks = useLiveQuery(() => desksForRoom(db, roomId), [db, roomId]);

  // Half-tile precision by keyboard, and the only way to reach the odd
  // coordinates an arc uses. `nudgeDesk` reads the position fresh inside its
  // own transaction rather than trusting a snapshot this closure captured, so
  // a key held down walks the desk one unit per press instead of rewriting the
  // same square. `desks` is deliberately not a dependency: the effect reads no
  // position out of it, so a live-query tick has nothing to make stale.
  useEffect(() => {
    if (heldDeskId === null) return;
    const deskId = heldDeskId;
    const deltas: Record<string, Position> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    function onKeyDown(event: KeyboardEvent): void {
      const delta = deltas[event.key];
      if (!delta) return;
      // The template form's number spinners are one Tab away; without this the
      // nudge eats their arrow keys, and the preventDefault below cancels the
      // input's own increment.
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      void nudgeDesk(db, deskId, delta);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [db, heldDeskId]);

  if (room === undefined || desks === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (room === null) return <p className="text-text-muted">{t("rooms.notFound")}</p>;

  /**
   * The floor received something.
   *
   * One handler for both input paths, because both end here: a drag reports
   * the cell under the pointer, a tap reports the cell tapped, and a held desk
   * with neither is the keyboard's "put it down there".
   */
  const onFloor = (at: Position): void => {
    const drag = dragging.current;
    dragging.current = null;
    if (drag?.kind === "new") {
      void addDesk(db, roomId, at);
      return;
    }
    const deskId = drag?.kind === "desk" ? drag.deskId : heldDeskId;
    if (deskId === null) return;
    // The hold survives a REFUSAL. Tapping somewhere a table does not fit —
    // too close to a neighbour, or past the wall — is an ordinary mis-aim, and
    // dropping the table out of the teacher's hand for it would make them pick
    // it up again with nothing on screen to say why.
    void moveDesk(db, deskId, at).then((moved) => {
      if (moved) setHeldDeskId(null);
    });
  };

  // In TILES, since that is what the steppers count. A room whose extent is
  // not a whole number of tiles (an arc's frame need not be) rounds up, so the
  // floor never reports a size that would clip a desk.
  const minExtent = minimumExtent(desks);
  const minTiles = {
    width: Math.ceil(minExtent.width / TABLE),
    height: Math.ceil(minExtent.height / TABLE),
  };

  const resize = async (width: number, height: number): Promise<void> => {
    await resizeRoom(db, roomId, { width, height });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-text-faint text-xs">
        <Link to={Router.Rooms()}>{t("rooms.title")}</Link> / {room.name}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">{t("rooms.name")}</span>
          <input
            className="field font-semibold"
            style={{ width: "12rem" }}
            value={renaming ?? room.name}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => {
              const next = (renaming ?? "").trim();
              if (next !== "" && next !== room.name) void renameRoom(db, roomId, next);
              setRenaming(null);
            }}
          />
          <span className="text-sm text-text-faint">
            {t("rooms.deskCount", { count: desks.length })}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void deleteRoom(db, roomId).then(() => Router.push("Rooms"))}
        >
          {t("rooms.delete")}
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-3 lg:order-2 lg:w-60 lg:shrink-0">
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
              {t("rooms.addFurniture")}
            </h3>
            {/* Drawn as the thing it becomes, so the drag has a before and an
                after that look alike. */}
            <button
              type="button"
              draggable
              onDragStart={() => {
                dragging.current = { kind: "new" };
              }}
              onDragEnd={() => {
                dragging.current = null;
              }}
              className="flex h-[72px] items-center justify-center rounded font-bold text-xs"
              style={{
                background: "var(--wood)",
                color: "var(--wood-ink)",
                border: "2px solid var(--wood-edge)",
                boxShadow: "inset 0 3px 0 var(--wood-hi), 0 4px 0 var(--wood-edge)",
              }}
            >
              {t("rooms.table")}
            </button>
            <p className="text-text-faint text-xs">{t("rooms.dragHint")}</p>
          </div>

          <TemplateForm
            roomId={roomId}
            onApply={async (shape) => {
              await applyShape(db, roomId, shape);
              release();
            }}
          />

          <p className="text-text-faint text-xs">{t("rooms.keyboardHint")}</p>
        </div>

        <div className="flex flex-col gap-2 lg:order-1 lg:min-w-0 lg:flex-1">
          {/* Above the plan, because it is about the FLOOR rather than about
              any table on it. In tiles, not half-tiles: a teacher counts
              places across the room, and the half-tile only exists so an arc
              can sit between two of them. */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
            <span className="text-sm text-text-muted">{t("rooms.floor")}</span>
            <SizeStepper
              label={t("rooms.cols")}
              tiles={room.width / TABLE}
              min={minTiles.width}
              onChange={(cols) => void resize(cols * TABLE, room.height)}
            />
            <SizeStepper
              label={t("rooms.rows")}
              tiles={room.height / TABLE}
              min={minTiles.height}
              onChange={(rows) => void resize(room.width, rows * TABLE)}
            />
            <span className="text-text-faint text-xs">
              {t("rooms.floorMin", { cols: minTiles.width, rows: minTiles.height })}
            </span>
          </div>

          <RoomCanvas
            room={room}
            desks={desks}
            onFloor={onFloor}
            emptyHint={t("rooms.emptyRoom")}
            renderPlace={(desk) => (
              <span className="text-[11px]" style={{ color: "var(--wood-ink)", opacity: 0.7 }}>
                {heldDeskId === desk.id ? t("rooms.inHand") : ""}
              </span>
            )}
            placeProps={(desk) => ({
              draggable: true,
              tabIndex: 0,
              role: "button",
              "aria-pressed": heldDeskId === desk.id || undefined,
              title: t("rooms.holdTable"),
              className:
                heldDeskId === desk.id
                  ? "outline-2 outline-accent outline-offset-2"
                  : selectedDeskId === desk.id
                    ? "outline-2 outline-accent"
                    : "",
              onDragStart: () => {
                dragging.current = { kind: "desk", deskId: desk.id };
                setHeldDeskId(desk.id);
              },
              onDragEnd: () => {
                dragging.current = null;
              },
              onClick: () => {
                // Tap: pick up, or put down onto a desk that is not this one —
                // which is refused, since furniture never lands on furniture.
                if (heldDeskId === desk.id) {
                  setHeldDeskId(null);
                  return;
                }
                if (heldDeskId !== null) return;
                setHeldDeskId(desk.id);
                setSelectedDeskId(desk.id);
              },
              onKeyDown: (e) => {
                if (e.key !== " " && e.key !== "Enter") return;
                e.preventDefault();
                setHeldDeskId((current) => (current === desk.id ? null : desk.id));
                setSelectedDeskId(desk.id);
              },
            })}
            renderTableOverlay={(group) => {
              // Only the SELECTED table carries controls. Stamped on all
              // twenty-four they were most of the clutter, and a destructive
              // control beside every place is a mis-tap waiting to happen.
              const selected = group.desks.find((d) => d.id === selectedDeskId);
              if (!selected) return null;
              return (
                <button
                  key={`x-${selected.id}`}
                  type="button"
                  aria-label={t("rooms.removeTable")}
                  title={t("rooms.removeTable")}
                  className="-top-3 absolute flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-danger bg-bg text-danger text-[15px] leading-none"
                  style={{ left: "calc(100% - 15px)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDeskId(null);
                    setHeldDeskId(null);
                    void removeDesk(db, selected.id);
                  }}
                >
                  ×
                </button>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
