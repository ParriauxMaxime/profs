import { deleteRoom } from "@db/cascade";
import { plansForRoom } from "@db/plans";
import { useDb } from "@db/provider";
import { desksForRoom, saveRoomDraft } from "@db/rooms";
import { minimumExtent, type Position, ROOM_MAX, snapCell, snapToPlace, TABLE } from "@domain/room";
import {
  addToDraft,
  draftChanged,
  draftFrom,
  moveInDraft,
  nudgeInDraft,
  type RoomDraft,
  removeFromDraft,
  renameDraft,
  resizeDraft,
} from "@domain/room-draft";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { useEscape } from "../shared/use-escape";
import { type FloorHandle, RoomCanvas, UNIT_PX } from "./components/room-canvas";
import { usePointerDrag } from "./use-pointer-drag";

/**
 * Furnishing a salle. One mode, because there are no pupils on this screen.
 *
 * That is the whole mechanism: with nothing but furniture drawn, a tap can
 * only mean one thing — take this table. The old plan had to redefine a tap on
 * a pupil to mean "pick up the table underneath them", which is where the
 * grammar came apart.
 *
 * Every gesture edits a DRAFT and nothing else writes. The screen used to
 * commit each drag, nudge and removal on its own, so rearranging a room was
 * twenty-four transactions with no way back and no moment where the teacher
 * decided they were done. `saveRoomDraft` writes the lot as one diff, and the
 * ids in the draft are what keep every class's seating attached to the tables
 * that merely moved.
 *
 * The cost, stated plainly because nothing on screen can state it: leaving the
 * page loses an unsaved arrangement. The two mechanisms that would warn —
 * Chicane's `useBlocker` and `beforeunload` — both raise a blocking browser
 * dialog, which this codebase bans because it freezes the automation these
 * pages are verified with. So the unsaved marker sits beside the button, and
 * *Annuler* is there to make abandoning deliberate.
 *
 * Drag and tap are one gesture with two entrances, and `held` is the whole of
 * it: a table is in the teacher's hand whether they picked it up with a tap,
 * with the keyboard, or by pressing and moving. Both entrances end in the same
 * `place`, so nothing on this screen can mean one thing to a finger and
 * another to a mouse.
 *
 * The drag runs on POINTER events (`usePointerDrag`) rather than HTML5 drag
 * and drop, because a finger never fires a drag event: on a tablet the old
 * implementation left tap as the only gesture and made the table palette,
 * which was drag-only, unable to add a table at all.
 */

/** What is in hand: a table already in the room, or a new one from the palette. */
type Held = { kind: "desk"; deskId: string } | { kind: "new" } | null;

/** Where a table would land, and whether the floor will take it. */
interface Ghost {
  at: Position;
  allowed: boolean;
}

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

  // Anchored to the desk's id, never to its position: a re-render can move a
  // desk out from under a coordinate between the pick-up and the drop.
  const [held, setHeld] = useState<Held>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const [saving, setSaving] = useState(false);
  // Where the table in hand would land, while a pointer drag is in flight.
  const [target, setTarget] = useState<Ghost | null>(null);
  const floor = useRef<FloorHandle>(null);
  // A drag ends in a `click` as well as a `pointerup`; without this the drop
  // would be undone by the tap handler firing straight after it.
  const dropped = useRef(false);

  const heldDeskId = held?.kind === "desk" ? held.deskId : null;

  const release = useCallback(() => {
    setHeld(null);
    setSelectedDeskId(null);
    setTarget(null);
  }, []);
  useEscape(release);

  const room = useLiveQuery(async () => (await db.rooms.get(roomId)) ?? null, [db, roomId]);
  const desks = useLiveQuery(() => desksForRoom(db, roomId), [db, roomId]);
  // Which classes lose an arrangement if this salle goes — the confirm has
  // to be able to say so.
  const usedBy =
    useLiveQuery(async () => {
      const plans = await plansForRoom(db, roomId);
      const classes = await db.classes.bulkGet(plans.map((plan) => plan.classId));
      return classes.filter((c) => c !== undefined).map((c) => c.name);
    }, [db, roomId]) ?? [];

  const saved = room && desks ? draftFrom(room, desks) : null;
  // What the screen shows: the draft while one is open, the salle otherwise.
  const current = draft ?? saved;

  /**
   * Apply an edit to the draft, opening one from the saved salle if needed.
   *
   * A refusal — a table dropped where it does not fit — returns null and the
   * room simply does not change, exactly as the per-gesture writes used to
   * behave. It must not open an empty draft either, or a mis-aimed drop would
   * arm the Save button with nothing in it.
   */
  const edit = useCallback(
    (apply: (draft: RoomDraft) => RoomDraft | null): boolean => {
      if (!saved) return false;
      const next = apply(draft ?? saved);
      if (next === null) return false;
      setDraft(next);
      return true;
    },
    [draft, saved],
  );

  /**
   * Put what is in hand onto the floor, and say whether it landed.
   *
   * The single ending for every input path — a tap on the floor, a pointer
   * drag released over it, the keyboard's "put it down there". A refusal (too
   * close to a neighbour, or past the wall) returns false and the room simply
   * does not change.
   */
  const place = useCallback(
    (what: Held, at: Position): boolean => {
      if (what === null) return false;
      if (what.kind === "new") return edit((draft) => addToDraft(draft, at, crypto.randomUUID()));
      return edit((draft) => moveInDraft(draft, what.deskId, at));
    },
    [edit],
  );

  /**
   * Where the table in hand would land, and whether it may.
   *
   * The canvas reports where the pointer IS; which square that becomes depends
   * on the furniture, so it is resolved here, where the draft and the table in
   * hand are both known. A moving table is excluded from its own collision
   * set — the square it already occupies would otherwise be the one place it
   * could never go back to.
   *
   * When nothing within reach can hold a table, the raw square comes back
   * marked refused, so the ghost can say so in red rather than vanishing and
   * leaving the teacher to guess why nothing is happening.
   */
  const resolveDrop = useCallback(
    (what: Held, at: { clientX: number; clientY: number }): Ghost | null => {
      const point = floor.current?.pointAtClient(at.clientX, at.clientY) ?? null;
      if (point === null || current === null) return null;
      const taken =
        what?.kind === "desk"
          ? current.desks.filter((desk) => desk.id !== what.deskId)
          : current.desks;
      const cell = snapToPlace(point, taken, current);
      return cell === null
        ? { at: snapCell(point.x, point.y), allowed: false }
        : { at: cell, allowed: true };
    },
    [current],
  );

  const { begin, dragging } = usePointerDrag<Held>({
    onStart: (payload, at) => {
      dropped.current = false;
      setHeld(payload);
      if (payload?.kind === "desk") setSelectedDeskId(payload.deskId);
      setTarget(resolveDrop(payload, at));
    },
    onMove: (payload, at) => setTarget(resolveDrop(payload, at)),
    onDrop: (payload, at) => {
      const cell = resolveDrop(payload, at);
      setTarget(null);
      // A drag ends in a click as well as a pointerup. The flag swallows that
      // click, and clears on the next macrotask so a gesture that fires no
      // click cannot swallow the following tap instead.
      dropped.current = true;
      setTimeout(() => {
        dropped.current = false;
      }, 0);
      if (cell?.allowed && place(payload, cell.at)) setHeld(null);
    },
    // The hold SURVIVES a cancel, as it survives a refusal: the browser taking
    // the gesture is not the teacher letting go.
    onCancel: () => setTarget(null),
  });

  // The keyboard's half-tile step. It is no longer the ONLY way to reach the
  // odd coordinates the generators use — `snapCell` put the pointer on the
  // same grid — but it is still how a table is placed precisely without one.
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
      // The name field is one Tab away; without this the nudge eats its arrow
      // keys, and the preventDefault below cancels the caret's own move.
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      edit((current) => nudgeInDraft(current, deskId, delta));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [edit, heldDeskId]);

  if (room === undefined || desks === undefined || !saved || !current) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (room === null) return <p className="text-text-muted">{t("rooms.notFound")}</p>;

  /**
   * The floor was tapped: put down whatever is in hand.
   *
   * The hold survives a REFUSAL. Tapping somewhere a table does not fit — too
   * close to a neighbour, or past the wall — is an ordinary mis-aim, and
   * dropping the table out of the teacher's hand for it would make them pick
   * it up again with nothing on screen to say why.
   */
  const onFloor = (point: Position): void => {
    if (dropped.current || held === null) return;
    const taken =
      held.kind === "desk"
        ? current.desks.filter((desk) => desk.id !== held.deskId)
        : current.desks;
    const cell = snapToPlace(point, taken, current);
    if (cell !== null && place(held, cell)) setHeld(null);
  };

  // In TILES, since that is what the steppers count. A room whose extent is
  // not a whole number of tiles — an arc's frame need not be — rounds UP, so
  // the floor never reports a size that would clip a desk, and stepping from
  // there lands on whole tiles from then on.
  const minExtent = minimumExtent(current.desks);
  const minTiles = {
    width: Math.ceil(minExtent.width / TABLE),
    height: Math.ceil(minExtent.height / TABLE),
  };

  const dirty = draft !== null && draftChanged(saved, draft);
  const canSave = dirty && draft.name.trim() !== "" && !saving;

  const save = async (): Promise<void> => {
    if (draft === null) return;
    setSaving(true);
    // The draft is deliberately KEPT on success. It now equals what is stored,
    // so `draftChanged` goes false on its own and the button disables — while
    // dropping it would render the live query's previous answer for a frame
    // and flash the tables back to where they were.
    await saveRoomDraft(db, roomId, draft);
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* One toolbar row: where the salle is, and everything you can do to it.
          The save pair and the delete used to sit on the row below, beside the
          name field, which put the primary action of the screen in the middle
          of a form. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="text-sm text-text-muted" aria-label={t("rooms.breadcrumb")}>
          <Link to={Router.Rooms()}>{t("rooms.title")}</Link> <span aria-hidden="true">/</span>{" "}
          <span className="font-semibold text-text" aria-current="page">
            {current.name}
          </span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {/* The only warning there is. A blocking dialog on the way out is
              banned here, so an unsaved arrangement has to announce itself
              while the teacher is still looking at it. */}
          {dirty ? <span className="text-danger text-sm">{t("rooms.unsaved")}</span> : null}
          <button
            type="button"
            className="btn"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(null);
              release();
            }}
          >
            {t("common.cancel")}
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            {t("common.save")}
          </button>
          {/* The confirm names the classes that lose an arrangement — a salle
              is shared, so the cost of deleting it reaches past the screen it
              is deleted from. */}
          <ConfirmButton
            label={t("rooms.delete")}
            confirmLabel={t("rooms.confirmDelete", { name: room.name })}
            body={
              usedBy.length === 0
                ? t("rooms.confirmDeleteBody")
                : t("rooms.confirmDeleteUsedBody", { classes: usedBy.join(", ") })
            }
            danger
            onConfirm={() => deleteRoom(db, roomId).then(() => Router.push("Rooms"))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Everything about the salle ITSELF, stacked in one card: its name,
            how many places it holds, the floor it stands on, and the table you
            add to it. The plan beside it is the only other thing on screen. */}
        <div className="flex flex-col gap-4 rounded-md border border-border p-3 lg:w-56 lg:shrink-0">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            {t("rooms.name")}
            <input
              className="field font-semibold text-text"
              value={current.name}
              onChange={(e) => {
                const name = e.target.value;
                edit((draft) => renameDraft(draft, name));
              }}
            />
          </label>

          <span className="text-sm text-text-faint">
            {t("rooms.deskCount", { count: current.desks.length })}
          </span>

          {/* In TILES, not half-tiles: a teacher counts places across the room,
              and the half-tile only exists so an arc can sit between two of
              them. `−` disables at the minimum, which is what says the floor
              cannot shrink under the furniture — a sentence saying so as well
              explained a rule the disabled button had already made obvious. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-muted">{t("rooms.floor")}</span>
            <SizeStepper
              label={t("rooms.cols")}
              tiles={Math.ceil(current.width / TABLE)}
              min={minTiles.width}
              onChange={(cols) =>
                edit((draft) => resizeDraft(draft, { width: cols * TABLE, height: draft.height }))
              }
            />
            <SizeStepper
              label={t("rooms.rows")}
              tiles={Math.ceil(current.height / TABLE)}
              min={minTiles.height}
              onChange={(rows) =>
                edit((draft) => resizeDraft(draft, { width: draft.width, height: rows * TABLE }))
              }
            />
          </div>

          {/* Drawn as the thing it becomes, so the drag has a before and an
              after that look alike. Tap it to take a table in hand, or press
              and drag it straight onto the floor. */}
          <button
            type="button"
            aria-pressed={held?.kind === "new"}
            aria-label={t("rooms.addTable")}
            onPointerDown={(e) => begin(e, { kind: "new" })}
            onClick={() => {
              if (dropped.current) return;
              setHeld((current) => (current?.kind === "new" ? null : { kind: "new" }));
            }}
            className={`flex h-[72px] items-center justify-center rounded font-bold text-xs uppercase tracking-wide ${
              held?.kind === "new" ? "outline-2 outline-accent outline-offset-2" : ""
            }`}
            style={{
              background: "var(--wood)",
              color: "var(--wood-ink)",
              border: "2px solid var(--wood-edge)",
              boxShadow: "inset 0 3px 0 var(--wood-hi), 0 4px 0 var(--wood-edge)",
            }}
          >
            <span aria-hidden="true">+&nbsp;</span>
            {t("rooms.table")}
          </button>
        </div>

        <div className="flex flex-col gap-2 lg:min-w-0 lg:flex-1">
          <RoomCanvas
            room={current}
            desks={current.desks.map((desk) => ({ ...desk, roomId }))}
            onFloor={onFloor}
            ghost={held === null ? null : target}
            floorRef={floor}
            liftedDeskId={heldDeskId}
            emptyHint={t("rooms.emptyRoom")}
            // Nothing is written on a table. What is in hand is said by the
            // lift, and where it will land by the ghost.
            renderPlace={() => null}
            placeProps={(desk) => ({
              tabIndex: 0,
              role: "button",
              "aria-pressed": heldDeskId === desk.id || undefined,
              // The screen carries no instructions any more, so the keyboard
              // path lives in the accessible name, where it costs no pixels.
              "aria-keyshortcuts": "Space",
              title: t("rooms.holdTable"),
              "aria-label": t("rooms.holdTable"),
              // Only the SELECTED table is outlined, to anchor its × control.
              // The held one needs no outline: it is the one off the floor.
              className:
                selectedDeskId === desk.id && heldDeskId !== desk.id
                  ? "outline-2 outline-accent"
                  : "",
              onPointerDown: (e) => begin(e, { kind: "desk", deskId: desk.id }),
              onClick: () => {
                // Tap: pick up, or put down onto a desk that is not this one —
                // which is refused, since furniture never lands on furniture.
                if (dropped.current) return;
                if (heldDeskId === desk.id) {
                  setHeld(null);
                  return;
                }
                if (held !== null) return;
                setHeld({ kind: "desk", deskId: desk.id });
                setSelectedDeskId(desk.id);
              },
              onKeyDown: (e) => {
                if (e.key !== " " && e.key !== "Enter") return;
                e.preventDefault();
                setHeld((current) =>
                  current?.kind === "desk" && current.deskId === desk.id
                    ? null
                    : { kind: "desk", deskId: desk.id },
                );
                setSelectedDeskId(desk.id);
              },
            })}
            renderTableOverlay={(group) => {
              // Only the SELECTED table carries controls. Stamped on all
              // twenty-four they were most of the clutter, and a destructive
              // control beside every place is a mis-tap waiting to happen.
              const selected = group.desks.find((d) => d.id === selectedDeskId);
              if (!selected) return null;
              // Anchored to the SELECTED place, not to the group's box. Pinned
              // to the group's top-right corner it landed on whichever place
              // happened to sit there — on an L-shaped island, a delete for the
              // bottom-left table appeared over the top-right one.
              const lifted = heldDeskId === selected.id;
              return (
                <button
                  key={`x-${selected.id}`}
                  type="button"
                  aria-label={t("rooms.removeTable")}
                  title={t("rooms.removeTable")}
                  className="absolute flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-danger bg-bg text-danger text-[15px] leading-none"
                  style={{
                    left: (selected.x - group.x + TABLE) * UNIT_PX - 15,
                    // Rides along when its table is off the floor, so the two
                    // do not drift apart while one is in hand.
                    top: (selected.y - group.y) * UNIT_PX - 12 - (lifted ? 6 : 0),
                    zIndex: 3,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDeskId(null);
                    setHeld(null);
                    edit((draft) => removeFromDraft(draft, selected.id));
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
