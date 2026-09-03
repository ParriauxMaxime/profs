import type { Seat, SeatingLayout } from "@db";
import { useDb } from "@db/provider";
import { applyTemplate } from "@db/seating";
import {
  buildRoom,
  clampTemplate,
  DEFAULT_TEMPLATE,
  defaultTemplate,
  type RoomTemplate,
  seatCount,
  TEMPLATE_IDS,
  TEMPLATE_LIMITS,
  type TemplateId,
} from "@domain/room-templates";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { useEscape } from "../../shared/use-escape";

const TEMPLATE_LABEL_KEYS: Record<TemplateId, string> = {
  rows: "plan.templateRows",
  arc: "plan.templateArc",
  islands: "plan.templateIslands",
  u: "plan.templateU",
};

/**
 * A single labelled number input. It carries NO clamping of its own —
 * `clampTemplate` in the domain is the only place a range is known, the same
 * reason the subject palette and the period names are not in a component.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  autoFocus,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        // biome-ignore lint/a11y/noAutofocus: opens ready to use — one-handed, mid-lesson, no spare tap to reach the field.
        autoFocus={autoFocus}
        className="field w-20"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Pick a room shape and stamp it.
 *
 * The template is LOCAL state and is never stored: applying it is a one-way
 * write, and nothing anywhere records that a room "is an arc". Keyed on
 * `layout.id` by the caller, so switching rooms cannot leave a template
 * captured at mount.
 *
 * Deliberately NOT a `<form>`, and the stamp is a `ConfirmButton` rather than a
 * submit. A stamp replaces every table in the room, and with `autoFocus` on a
 * number input, Enter would submit it — so a teacher who opened layout-edit
 * mode to remove one table and pressed Enter would have a hand-built arc
 * replaced by a fresh grid.
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
  const [template, setTemplate] = useState<RoomTemplate>(clampTemplate(DEFAULT_TEMPLATE));
  const [saving, setSaving] = useState(false);

  useEscape(onDone);

  const seated = seats.filter((seat) => seat.studentId !== null).length;
  const total = seatCount(template);
  // Exactly the count `reseat` would hand back — computed here so the warning
  // arrives BEFORE the destructive write, not after it.
  const overflow = Math.max(0, seated - total);

  const set = (patch: Partial<RoomTemplate>): void =>
    setTemplate((current) => clampTemplate({ ...current, ...patch } as RoomTemplate));

  const apply = async (): Promise<void> => {
    setSaving(true);
    try {
      await applyTemplate(db, layout.id, buildRoom(template));
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("plan.template")}
        <select
          className="field"
          value={template.id}
          onChange={(e) => setTemplate(defaultTemplate(e.target.value as TemplateId))}
        >
          {TEMPLATE_IDS.map((id) => (
            <option key={id} value={id}>
              {t(TEMPLATE_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
      </label>

      {template.id === "rows" && (
        <>
          <NumberField
            label={t("plan.paramRows")}
            value={template.rows}
            min={TEMPLATE_LIMITS.rows.rows[0]}
            max={TEMPLATE_LIMITS.rows.rows[1]}
            onChange={(rows) => set({ rows })}
            autoFocus
          />
          <NumberField
            label={t("plan.paramCols")}
            value={template.cols}
            min={TEMPLATE_LIMITS.rows.cols[0]}
            max={TEMPLATE_LIMITS.rows.cols[1]}
            onChange={(cols) => set({ cols })}
          />
        </>
      )}
      {template.id === "arc" && (
        <>
          <NumberField
            label={t("plan.paramPerRow")}
            value={template.perRow}
            min={TEMPLATE_LIMITS.arc.perRow[0]}
            max={TEMPLATE_LIMITS.arc.perRow[1]}
            onChange={(perRow) => set({ perRow })}
            autoFocus
          />
          <NumberField
            label={t("plan.paramRows")}
            value={template.rows}
            min={TEMPLATE_LIMITS.arc.rows[0]}
            max={TEMPLATE_LIMITS.arc.rows[1]}
            onChange={(rows) => set({ rows })}
          />
          <NumberField
            label={t("plan.paramCurve")}
            value={template.curve}
            min={TEMPLATE_LIMITS.arc.curve[0]}
            max={TEMPLATE_LIMITS.arc.curve[1]}
            onChange={(curve) => set({ curve })}
          />
        </>
      )}
      {template.id === "islands" && (
        <>
          <NumberField
            label={t("plan.paramIslands")}
            value={template.islands}
            min={TEMPLATE_LIMITS.islands.islands[0]}
            max={TEMPLATE_LIMITS.islands.islands[1]}
            onChange={(islands) => set({ islands })}
            autoFocus
          />
          <NumberField
            label={t("plan.paramPerIsland")}
            value={template.perIsland}
            min={TEMPLATE_LIMITS.islands.perIsland[0]}
            max={TEMPLATE_LIMITS.islands.perIsland[1]}
            onChange={(perIsland) => set({ perIsland })}
          />
        </>
      )}
      {template.id === "u" && (
        <>
          <NumberField
            label={t("plan.paramCols")}
            value={template.cols}
            min={TEMPLATE_LIMITS.u.cols[0]}
            max={TEMPLATE_LIMITS.u.cols[1]}
            onChange={(cols) => set({ cols })}
            autoFocus
          />
          <NumberField
            label={t("plan.paramRows")}
            value={template.rows}
            min={TEMPLATE_LIMITS.u.rows[0]}
            max={TEMPLATE_LIMITS.u.rows[1]}
            onChange={(rows) => set({ rows })}
          />
        </>
      )}

      <p className="text-sm text-muted-foreground">{t("plan.seatCount", { count: total })}</p>

      {overflow > 0 && (
        <p className="text-danger text-sm">{t("plan.resizeWarning", { count: overflow })}</p>
      )}

      <div className="flex gap-2">
        {saving ? (
          <button type="button" className="btn btn-primary" disabled>
            {t("plan.apply")}
          </button>
        ) : (
          <ConfirmButton
            label={t("plan.apply")}
            confirmLabel={t("plan.confirmStamp")}
            danger
            onConfirm={apply}
          />
        )}
        <button type="button" className="btn" disabled={saving} onClick={onDone}>
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
