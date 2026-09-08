import { useDb } from "@db/provider";
import { createRoom } from "@db/rooms";
import {
  buildRoom,
  ROOM_PRESET_IDS,
  ROOM_PRESETS,
  type RoomPresetId,
  seatCount,
} from "@domain/room-templates";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { Sheet } from "../../design-system/components/sheet";
import { PresetPreview } from "./preset-preview";

/** Tables de deux is the arrangement a French classroom arrives furnished in. */
const DEFAULT_PRESET: RoomPresetId = "pairs";

/**
 * Creating a salle: a name, and a shape to start from.
 *
 * A shape rather than a form. The parametric editor exists inside the salle,
 * but it asks for numbers before it shows anything, and a teacher creating
 * their first salle cannot picture what three tables of two will look like.
 * Each preview is drawn from the SAME generator that will stamp it, so what
 * you pick is what you get.
 *
 * Picking a preset SELECTS it; the salle is created once, by the button. The
 * list screen used to create on the preset click itself, which made a mis-tap
 * on a thumbnail an immediate write plus a navigation away.
 */
export function RoomCreateSheet({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<RoomPresetId>(DEFAULT_PRESET);
  const nameRef = useRef<HTMLInputElement>(null);

  // The sheet stays mounted while closed, so the fields have to be cleared
  // here: without this, closing and reopening offers the abandoned name back.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPreset(DEFAULT_PRESET);
  }, [open]);

  const trimmed = name.trim();

  const create = async (): Promise<void> => {
    if (trimmed === "") return;
    const room = await createRoom(db, trimmed, buildRoom(ROOM_PRESETS[preset]));
    onClose();
    Router.push("Room", { roomId: room.id });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("rooms.new")}
      returnFocusTo={returnFocusTo}
      initialFocusTo={nameRef}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t("rooms.name")}
          <input
            ref={nameRef}
            className="field"
            style={{ maxWidth: "16rem" }}
            value={name}
            placeholder={t("rooms.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="p-0 text-sm">{t("rooms.pickShape")}</legend>
          <div className="flex flex-wrap gap-2">
            {ROOM_PRESET_IDS.map((id) => {
              const template = ROOM_PRESETS[id];
              const selected = id === preset;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  className={`btn flex h-auto flex-col items-center gap-1 p-2 ${
                    selected ? "border-accent bg-bg-hover" : ""
                  }`}
                  style={{
                    width: "9.5rem",
                    outline: selected ? "2px solid var(--color-accent)" : undefined,
                  }}
                  onClick={() => setPreset(id)}
                >
                  <PresetPreview template={template} />
                  <span className="font-medium text-sm">{t(`rooms.preset.${id}`)}</span>
                  <span className="text-text-faint text-xs">
                    {t("rooms.deskCount", { count: seatCount(template) })}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={trimmed === ""}>
            {t("rooms.create")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
