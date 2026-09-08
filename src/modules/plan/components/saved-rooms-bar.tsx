import type { Seat, SeatingLayout } from "@db";
import { useDb } from "@db/provider";
import { listRooms, roomShape, saveRoom } from "@db/rooms";
import { applyTemplate } from "@db/seating";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * Saved rooms — "Ma salle 204" — beside the template picker in layout-edit mode.
 *
 * A saved room is a user-defined template, and stamping one goes through the
 * same `applyTemplate` the four built-in templates use. That is the whole
 * reason the backlog's "what happens to the occupants" question needed no new
 * answer: `reseat` pours the seated pupils into the new positions in reading
 * order, and whoever no longer fits returns to the rail. The count is shown
 * BEFORE the write, exactly as the template form shows it.
 *
 * Renaming and deleting a saved room live in Réglages, not here. This bar is
 * used mid-arrangement; managing a library is not.
 */
export function SavedRoomsBar({
  layout,
  seats,
  onDone,
}: {
  layout: SeatingLayout;
  seats: Seat[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const rooms = useLiveQuery(() => listRooms(db), [db]);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) nameField.current?.focus();
  }, [naming]);

  const seated = seats.filter((seat) => seat.studentId !== null).length;

  const save = (): void => {
    const name = draft.trim();
    if (name === "") return;
    // The shape as it stands, positions only — who is sitting where is this
    // class's business and would be meaningless in another.
    void saveRoom(db, name, {
      width: layout.width,
      height: layout.height,
      positions: seats.map((seat) => ({ x: seat.x, y: seat.y })),
    });
    setDraft("");
    setNaming(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
      <span className="text-sm text-text-muted">{t("plan.rooms.label")}</span>

      {(rooms ?? []).map((room) => {
        const overflow = Math.max(0, seated - room.positions.length);
        return (
          <ConfirmButton
            key={room.id}
            label={room.name}
            // Naming the cost before the write, not after it: a stamp replaces
            // every table, and whoever no longer fits goes back to the rail.
            confirmLabel={
              overflow > 0
                ? t("plan.rooms.stampConfirmOverflow", { name: room.name, count: overflow })
                : t("plan.rooms.stampConfirm", { name: room.name })
            }
            danger
            onConfirm={async () => {
              await applyTemplate(db, layout.id, roomShape(room));
              onDone();
            }}
          />
        );
      })}

      {rooms !== undefined && rooms.length === 0 && (
        <span className="text-sm text-text-muted">{t("plan.rooms.none")}</span>
      )}

      {naming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <input
            ref={nameField}
            className="field"
            value={draft}
            placeholder={t("plan.rooms.namePlaceholder")}
            aria-label={t("plan.rooms.namePlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              // The form's Escape must not also close layout-edit mode.
              event.stopPropagation();
              setNaming(false);
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
              setNaming(false);
              setDraft("");
            }}
          >
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDraft("");
            setNaming(true);
          }}
        >
          {t("plan.rooms.save")}
        </button>
      )}
    </div>
  );
}
