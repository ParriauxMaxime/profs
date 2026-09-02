import type { Seat, SeatingLayout } from "@db";
import { useDb } from "@db/provider";
import { resizeLayout } from "@db/seating";
import { MAX_COLS, MAX_ROWS, resizeSeats } from "@domain/seating";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

/**
 * Resize the room. Keyed on `layout.id` by the caller so switching layouts
 * (there is only ever one per class today, but the invariant still applies)
 * cannot leave stale row/col values captured at mount.
 */
export function LayoutSizeForm({
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
  const [rows, setRows] = useState(layout.rows);
  const [cols, setCols] = useState(layout.cols);
  const [saving, setSaving] = useState(false);

  useEscape(onDone);

  const preview = resizeSeats(seats, layout.id, rows, cols, layout.rows, layout.cols);
  const unseatedCount = preview.unseated.length;

  const apply = async (): Promise<void> => {
    setSaving(true);
    try {
      await resizeLayout(db, layout, rows, cols);
      onDone();
    } finally {
      setSaving(false);
    }
  };

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
          max={MAX_ROWS}
          value={rows}
          // biome-ignore lint/a11y/noAutofocus: opens ready to use — one-handed, mid-lesson, no spare tap to reach the field.
          autoFocus
          className="field w-20"
          onChange={(e) => setRows(Math.min(MAX_ROWS, Math.max(1, Number(e.target.value) || 1)))}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("plan.cols")}
        <input
          type="number"
          min={1}
          max={MAX_COLS}
          value={cols}
          className="field w-20"
          onChange={(e) => setCols(Math.min(MAX_COLS, Math.max(1, Number(e.target.value) || 1)))}
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
