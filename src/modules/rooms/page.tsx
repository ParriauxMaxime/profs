import { deleteRoom } from "@db/cascade";
import { plansForRoom } from "@db/plans";
import { useDb } from "@db/provider";
import { createRoom, listRooms } from "@db/rooms";
import { buildRoom, DEFAULT_TEMPLATE, seatCount } from "@domain/room-templates";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";

/**
 * The salles of an établissement.
 *
 * A salle belongs here rather than to a class: 204 holds its tables whether or
 * not 3°B is in it, and both 3°B and 5°A sit at the same furniture. Creating
 * one stamps the default shape so the editor opens on a room rather than on
 * bare floor — an empty room gives a teacher nothing to drag.
 */
export function RoomsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState("");

  const rooms = useLiveQuery(() => listRooms(db), [db]);
  // Which classes sit in each salle, so a delete can say what it costs.
  const usage = useLiveQuery(async () => {
    const all = await listRooms(db);
    const entries = await Promise.all(
      all.map(async (room) => {
        const plans = await plansForRoom(db, room.id);
        const classes = await db.classes.bulkGet(plans.map((p) => p.classId));
        return [room.id, classes.filter((c) => c !== undefined).map((c) => c.name)] as const;
      }),
    );
    return Object.fromEntries(entries);
  }, [db]);
  const counts = useLiveQuery(async () => {
    const all = await listRooms(db);
    const entries = await Promise.all(
      all.map(
        async (room) => [room.id, await db.desks.where("roomId").equals(room.id).count()] as const,
      ),
    );
    return Object.fromEntries(entries);
  }, [db]);

  if (rooms === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;

  const create = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    const room = await createRoom(db, trimmed, buildRoom(DEFAULT_TEMPLATE));
    setName("");
    Router.push("Room", { roomId: room.id });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2>{t("rooms.title")}</h2>
          <p className="text-sm text-text-faint">{t("rooms.help")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("rooms.name")}
          <input
            className="field"
            style={{ width: "16rem" }}
            value={name}
            placeholder={t("rooms.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={name.trim() === ""}
          onClick={() => void create()}
        >
          {t("rooms.add")}
        </button>
        <p className="pb-3 text-text-faint text-xs">
          {t("rooms.addHint", { count: seatCount(DEFAULT_TEMPLATE) })}
        </p>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-text-muted">{t("rooms.empty")}</p>
      ) : (
        <div className="border-border border-t">
          {rooms.map((room) => {
            const classNames = usage?.[room.id] ?? [];
            return (
              <div
                key={room.id}
                className="flex flex-wrap items-center justify-between gap-3 border-border border-b py-3"
              >
                <div>
                  <div className="font-semibold text-[17px]">{room.name}</div>
                  <div className="text-sm text-text-muted">
                    {t("rooms.deskCount", { count: counts?.[room.id] ?? 0 })}
                  </div>
                  <div className="text-text-faint text-xs">
                    {classNames.length === 0
                      ? t("rooms.usedByNobody")
                      : t("rooms.usedBy", { classes: classNames.join(", ") })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="btn" to={Router.Room({ roomId: room.id })}>
                    {t("rooms.open")}
                  </Link>
                  {/* The confirm names the classes that lose an arrangement —
                      a salle is shared, so deleting one reaches further than
                      the screen it is deleted from. */}
                  <ConfirmButton
                    label={t("common.delete")}
                    confirmLabel={
                      classNames.length === 0
                        ? t("rooms.confirmDelete", { name: room.name })
                        : t("rooms.confirmDeleteUsed", {
                            name: room.name,
                            classes: classNames.join(", "),
                          })
                    }
                    danger
                    onConfirm={() => deleteRoom(db, room.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
