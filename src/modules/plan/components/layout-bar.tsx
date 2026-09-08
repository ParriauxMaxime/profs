import type { SeatingLayout } from "@db";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * The class's rooms, and the one on screen.
 *
 * A class may hold several arrangements — the ordinary one, one for
 * assessments, one for group work. Which one is showing is a device-local
 * selection (`@domain/active-layout`), not a stored property of the class.
 *
 * Adding and renaming happen inline. `window.prompt` is banned here for the
 * same reason `window.confirm` is: it freezes the browser automation these
 * screens are verified with.
 *
 * Rename and delete are only offered in layout-edit mode. The lesson's gesture
 * is placing pupils, and a delete sitting beside the room picker during a
 * lesson is a mis-tap that costs an arrangement.
 */
export function LayoutBar({
  layouts,
  activeLayoutId,
  editing,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  layouts: SeatingLayout[];
  activeLayoutId: string | null;
  /** Layout-edit mode: rename and delete appear only here. */
  editing: boolean;
  onSelect: (layoutId: string) => void;
  onCreate: (name: string) => void;
  onRename: (layoutId: string, name: string) => void;
  onDelete: (layoutId: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Anchored to the layout's id, never its index: the list reorders when one
  // is deleted, and an index would retarget the rename onto another room.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const nameField = useRef<HTMLInputElement>(null);

  // The field replaces the button that was just pressed, so focus has to
  // follow it — otherwise a keyboard user is left on a control that no longer
  // exists. Done with a ref rather than `autoFocus`, which is banned here.
  const naming = adding || renamingId !== null;
  useEffect(() => {
    if (naming) nameField.current?.focus();
  }, [naming]);

  const active = layouts.find((layout) => layout.id === activeLayoutId) ?? null;
  const nameOf = (layout: SeatingLayout): string => layout.name ?? t("plan.layouts.unnamed");

  const submitNew = (): void => {
    const name = draft.trim();
    if (name === "") return;
    onCreate(name);
    setDraft("");
    setAdding(false);
  };

  const submitRename = (): void => {
    const name = draft.trim();
    if (renamingId === null || name === "") return;
    onRename(renamingId, name);
    setDraft("");
    setRenamingId(null);
  };

  // One room is not a choice. The picker only earns its space once there are
  // two, but the add button stays so a second one can be made.
  return (
    <div className="flex flex-wrap items-center gap-2">
      {layouts.length > 1 && (
        <fieldset className="m-0 flex flex-wrap gap-1 border-0 p-0">
          <legend className="sr-only">{t("plan.layouts.label")}</legend>
          {layouts.map((layout) => (
            <button
              key={layout.id}
              type="button"
              className={layout.id === activeLayoutId ? "btn btn-primary" : "btn"}
              aria-pressed={layout.id === activeLayoutId}
              onClick={() => onSelect(layout.id)}
            >
              {nameOf(layout)}
            </button>
          ))}
        </fieldset>
      )}

      {naming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (renamingId !== null) submitRename();
            else submitNew();
          }}
        >
          <input
            ref={nameField}
            className="field"
            value={draft}
            placeholder={t("plan.layouts.namePlaceholder")}
            aria-label={t("plan.layouts.namePlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              setAdding(false);
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
              setAdding(false);
              setRenamingId(null);
              setDraft("");
            }}
          >
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDraft("");
              setAdding(true);
            }}
          >
            {t("plan.layouts.add")}
          </button>

          {editing && active !== null && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(active.name ?? "");
                  setRenamingId(active.id);
                }}
              >
                {t("plan.layouts.rename")}
              </button>
              {/* The last room is never deletable: a class with none would be
                  handed a fresh default on the next render, so the delete
                  would read as "reset" while destroying the arrangement. */}
              {layouts.length > 1 && (
                <ConfirmButton
                  danger
                  label={t("plan.layouts.delete")}
                  confirmLabel={t("plan.layouts.deleteConfirm", { name: nameOf(active) })}
                  onConfirm={() => onDelete(active.id)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
