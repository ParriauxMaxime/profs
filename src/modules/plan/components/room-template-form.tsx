import type { Seat, SeatingLayout } from "@db";
import { useDb } from "@db/provider";
import { applyTemplate } from "@db/seating";
import {
  buildRoom,
  clampTemplate,
  DEFAULT_TEMPLATE,
  type RoomTemplate,
  seatCount,
} from "@domain/room-templates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

/** The `rows` template is the only one this form offers until Task 7. */
function rowsOf(template: RoomTemplate): number {
  return template.id === "rows" ? template.rows : 1;
}

function colsOf(template: RoomTemplate): number {
  return template.id === "rows" ? template.cols : 1;
}

/**
 * Stamp a template over the room.
 *
 * Reduced to the `rows` template for now — the full picker is the next task.
 * Keyed on `layout.id` by the caller so switching rooms cannot leave stale
 * parameters captured at mount.
 */
export function RoomTemplateForm({
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
  // A room records no template — stamping one is what a template is for — so
  // the form opens on the default rather than trying to read the current room
  // back as parameters it never had.
  const [template, setTemplate] = useState(clampTemplate(DEFAULT_TEMPLATE));
  const [saving, setSaving] = useState(false);

  useEscape(onDone);

  // A stamp keeps the pupils it can hold and reports the rest; the warning is
  // that count, computed from the template rather than from the room, so it is
  // right before anything is written.
  const seatedCount = seats.filter((seat) => seat.studentId !== null).length;
  const unseatedCount = Math.max(0, seatedCount - seatCount(template));

  const apply = async (): Promise<void> => {
    setSaving(true);
    try {
      await applyTemplate(db, layout.id, buildRoom(template));
      onDone();
    } finally {
      setSaving(false);
    }
  };

  // `clampTemplate` runs on every keystroke, so a typed value can never leave
  // the form outside its own range or past the class ceiling.
  const update = (patch: Partial<{ rows: number; cols: number }>): void =>
    setTemplate((current) =>
      clampTemplate({
        id: "rows",
        rows: patch.rows ?? rowsOf(current),
        cols: patch.cols ?? colsOf(current),
      }),
    );

  const rows = rowsOf(template);
  const cols = colsOf(template);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        {t("plan.rows")}
        <input
          type="number"
          min={1}
          value={rows}
          // biome-ignore lint/a11y/noAutofocus: opens ready to use — one-handed, mid-lesson, no spare tap to reach the field.
          autoFocus
          className="field w-20"
          onChange={(e) => update({ rows: Number(e.target.value) })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("plan.cols")}
        <input
          type="number"
          min={1}
          value={cols}
          className="field w-20"
          onChange={(e) => update({ cols: Number(e.target.value) })}
        />
      </label>

      {unseatedCount > 0 && (
        <p className="text-danger text-sm">{t("plan.resizeWarning", { count: unseatedCount })}</p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" disabled={saving} onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
