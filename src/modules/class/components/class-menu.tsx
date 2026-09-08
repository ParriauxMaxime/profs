import type { SchoolClass } from "@db";
import { deleteClass } from "@db/cascade";
import { useDb } from "@db/provider";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { Modal } from "../../design-system/components/modal";

/**
 * Renommer and Supprimer, one deliberate tap further away.
 *
 * They used to sit on the lesson screen as two full-size buttons, which put
 * "Supprimer la classe" one mis-tap from the confirm step of destroying a term
 * of marks — on the screen used one-handed with a class in front of you. They
 * are rare actions and can afford the extra tap; the register cannot afford
 * the width they took.
 *
 * `Modal` rather than a popover of its own: Escape, the focus trap, the
 * backdrop and the scroll lock are written once in this codebase, and a second
 * copy is exactly what `Modal`'s docstring says it exists to prevent.
 */
export function ClassMenu({
  schoolClass,
  onRename,
}: {
  schoolClass: SchoolClass;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("class.openActions")}
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        placement="center"
        returnFocusTo={buttonRef}
      >
        <h3 className="m-0">{t("class.actions")}</h3>

        <button
          type="button"
          className="btn w-full"
          onClick={() => {
            setOpen(false);
            onRename();
          }}
        >
          {t("class.rename")}
        </button>

        <ConfirmButton
          danger
          label={t("class.deleteClass")}
          confirmLabel={t("class.confirmDeleteClass")}
          body={t("class.confirmDeleteClassBody")}
          onConfirm={async () => {
            await deleteClass(db, schoolClass.id);
            // The class page cannot survive its own class: without this the
            // route would render "Classe introuvable" instead of going back to
            // a list the teacher can act on.
            Router.push("Home");
          }}
        />
      </Modal>
    </>
  );
}
