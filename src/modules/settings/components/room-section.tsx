import { useDb } from "@db/provider";
import { deleteRoom, listRooms, renameRoom } from "@db/rooms";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * The saved-room library: rename and delete.
 *
 * Rooms are *saved* from the seating plan, where the shape being saved is on
 * screen; there is nothing to create here, because a room with no tables would
 * be a shape nobody drew. What belongs here is what a library needs and a
 * lesson does not — tidying it.
 *
 * Deleting one destroys no arrangement: a saved room stamps and ceases to
 * exist, so every class stamped from it already holds its own copy of the
 * positions. The confirm says so, since "delete room" otherwise reads as
 * though it would empty the classes that used it.
 */
export function RoomSection() {
  const { t } = useTranslation();
  const db = useDb();
  const rooms = useLiveQuery(() => listRooms(db), [db]);
  // Held as an id, never an index: the list re-sorts on rename and reorders on
  // delete, and an index would retarget the edit onto another room.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId !== null) nameField.current?.focus();
  }, [renamingId]);

  const submit = (): void => {
    const name = draft.trim();
    if (renamingId === null || name === "") return;
    void renameRoom(db, renamingId, name);
    setRenamingId(null);
    setDraft("");
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("settings.rooms.title")}</h2>
      <p className="text-sm text-text-muted">{t("settings.rooms.help")}</p>

      {rooms === undefined ? (
        <p className="text-sm text-text-muted">{t("common.loading")}</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-text-muted">{t("settings.rooms.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2 text-sm"
            >
              {renamingId === room.id ? (
                <form
                  className="flex grow flex-wrap items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  <input
                    ref={nameField}
                    className="field grow"
                    value={draft}
                    aria-label={t("settings.rooms.name")}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      setRenamingId(null);
                      setDraft("");
                    }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={draft.trim() === ""}>
                    {t("common.save")}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setRenamingId(null);
                      setDraft("");
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </form>
              ) : (
                <>
                  <span className="grow font-medium">{room.name}</span>
                  <span className="text-text-muted">
                    {t("settings.rooms.tableCount", { count: room.positions.length })}
                  </span>
                  <button
                    type="button"
                    className="text-text-muted hover:text-accent"
                    onClick={() => {
                      setDraft(room.name);
                      setRenamingId(room.id);
                    }}
                  >
                    {t("common.edit")}
                  </button>
                  <ConfirmButton
                    danger
                    variant="link"
                    label={t("common.delete")}
                    confirmLabel={t("settings.rooms.confirmDelete", { name: room.name })}
                    onConfirm={() => void deleteRoom(db, room.id)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
