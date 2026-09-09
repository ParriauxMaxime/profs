import { plansForRoom } from "@db/plans";
import { useDb } from "@db/provider";
import { desksForRoom, listRooms } from "@db/rooms";
import type { RoomShape } from "@domain/room";
import { summariseOccupants } from "@domain/room-occupants";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import type { TFunction } from "i18next";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { RoomCreateSheet } from "./components/room-create-sheet";
import { RoomThumbnail } from "./components/room-thumbnail";

interface RoomCard {
  id: string;
  name: string;
  shape: RoomShape;
  classNames: string[];
}

/**
 * The salles of an établissement.
 *
 * A salle belongs here rather than to a class: 204 holds its tables whether or
 * not 3°B is in it, and both 3°B and 5°A sit at the same furniture.
 *
 * A grid of rooms, each drawn from its own desks, because a teacher recognises
 * their salles by shape long before they read the names — 204 is the one with
 * the horseshoe. The whole card is the link to the editor, and there is no
 * delete here: `deleteRoom` cascades into every plan taught in the salle, so
 * it belongs on the room's own page beside the tables it destroys, one
 * navigation away from a mis-tap on a list.
 */
/**
 * The "utilisée par" line: three classes named, the rest counted.
 *
 * Three branches rather than one interpolated string, because "et 13 autres"
 * has to agree in number and i18next resolves that from a `count` — which
 * means the no-remainder case must NOT pass one, or a salle used by exactly
 * three classes would read "et 0 autres".
 */
function renderOccupants(t: TFunction, classNames: string[]): string {
  const { named, rest } = summariseOccupants(classNames);
  if (named.length === 0) return t("rooms.usedByNobody");
  const classes = named.join(", ");
  if (rest === 0) return t("rooms.usedBy", { classes });
  return t("rooms.usedByMore", { classes, count: rest });
}

export function RoomsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [creating, setCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement>(null);

  // One query, not three: a card needs the salle, its desks and the classes
  // sitting in it together, and three live queries each re-listing the rooms
  // was three passes over the same tables for one screen.
  const rooms = useLiveQuery<RoomCard[]>(async () => {
    const all = await listRooms(db);
    return Promise.all(
      all.map(async (room) => {
        const desks = await desksForRoom(db, room.id);
        const plans = await plansForRoom(db, room.id);
        const classes = await db.classes.bulkGet(plans.map((plan) => plan.classId));
        return {
          id: room.id,
          name: room.name,
          shape: { width: room.width, height: room.height, positions: desks },
          classNames: classes.filter((c) => c !== undefined).map((c) => c.name),
        };
      }),
    );
  }, [db]);

  if (rooms === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2>{t("rooms.title")}</h2>
        <p className="text-sm text-text-faint">{t("rooms.help")}</p>
      </div>

      {rooms.length === 0 ? <p className="text-sm text-text-muted">{t("rooms.empty")}</p> : null}

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}
      >
        {rooms.map((room) => (
          <Link
            key={room.id}
            to={Router.Room({ roomId: room.id })}
            className="flex flex-col gap-2 rounded-md border border-border p-3 no-underline hover:bg-bg-hover"
          >
            <RoomThumbnail shape={room.shape} boxW={220} boxH={104} />
            <div>
              <div className="font-semibold text-[17px]">{room.name}</div>
              <div className="text-sm text-text-muted">
                {t("rooms.deskCount", { count: room.shape.positions.length })}
              </div>
              <div className="text-text-faint text-xs">{renderOccupants(t, room.classNames)}</div>
            </div>
          </Link>
        ))}

        {/* Creation sits among the salles rather than in the header: it is the
            only thing to do on an empty screen, and on a full one it is where
            the eye already is. */}
        <button
          ref={createRef}
          type="button"
          className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-md border border-border border-dashed p-3 text-text-muted hover:bg-bg-hover"
          onClick={() => setCreating(true)}
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            +
          </span>
          <span className="font-medium text-sm">{t("rooms.new")}</span>
        </button>
      </div>

      <RoomCreateSheet
        open={creating}
        onClose={() => setCreating(false)}
        returnFocusTo={createRef}
      />
    </div>
  );
}
