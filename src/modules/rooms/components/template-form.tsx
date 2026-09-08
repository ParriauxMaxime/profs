import { useDb } from "@db/provider";
import { stampOverflow } from "@db/rooms";
import type { RoomShape } from "@domain/room";
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
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

const TEMPLATE_LABEL_KEYS: Record<TemplateId, string> = {
  rows: "plan.templateRows",
  arc: "plan.templateArc",
  islands: "plan.templateIslands",
  u: "plan.templateU",
};

/**
 * A single labelled number input, carrying NO clamping of its own —
 * `clampTemplate` in the domain is the only place a range is known.
 */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        className="field w-20"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Pick a shape and stamp it into the salle.
 *
 * The template is LOCAL and never stored: applying it is a one-way write, and
 * nothing anywhere records that a salle "is an arc". A live template with
 * stored parameters cannot answer whether a table dragged out of the arc
 * should follow a later curvature change; both answers are wrong half the time.
 *
 * Deliberately not a `<form>`: with a number input focused, Enter would submit
 * it, and a teacher who came here to move one table would have a hand-built
 * room replaced by a fresh grid.
 *
 * The warning counts across EVERY plan in the salle, not one — a stamp reseats
 * 3°B and 5°A both, which is the cost of sharing the furniture.
 */
export function TemplateForm({
  roomId,
  onApply,
}: {
  roomId: string;
  onApply: (shape: RoomShape) => Promise<void>;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [template, setTemplate] = useState<RoomTemplate>(clampTemplate(DEFAULT_TEMPLATE));
  const [saving, setSaving] = useState(false);

  const shape = buildRoom(template);
  const total = seatCount(template);

  // Recomputed on every parameter change, so the warning is always about the
  // shape currently in the form. `db` is in the deps like every live query
  // here, or a workspace switch would keep reporting the previous school.
  const overflow = useLiveQuery(
    () => stampOverflow(db, roomId, shape),
    [db, roomId, shape.width, shape.height, shape.positions.length],
  );
  const losing = Object.values(overflow ?? {}).reduce((n, ids) => n + ids.length, 0);

  const set = (patch: Partial<RoomTemplate>): void =>
    setTemplate((current) => clampTemplate({ ...current, ...patch } as RoomTemplate));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
        {t("plan.template")}
      </h3>

      <label className="flex flex-col gap-1 text-sm">
        {t("rooms.model")}
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

      <div className="flex flex-wrap gap-2">
        {template.id === "rows" && (
          <>
            <NumberField
              label={t("plan.paramRows")}
              value={template.rows}
              min={TEMPLATE_LIMITS.rows.rows[0]}
              max={TEMPLATE_LIMITS.rows.rows[1]}
              onChange={(rows) => set({ rows })}
            />
            <NumberField
              label={t("plan.paramTables")}
              value={template.tables}
              min={TEMPLATE_LIMITS.rows.tables[0]}
              max={TEMPLATE_LIMITS.rows.tables[1]}
              onChange={(tables) => set({ tables })}
            />
            <NumberField
              label={t("plan.paramPerTable")}
              value={template.perTable}
              min={TEMPLATE_LIMITS.rows.perTable[0]}
              max={TEMPLATE_LIMITS.rows.perTable[1]}
              onChange={(perTable) => set({ perTable })}
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
      </div>

      <p className="text-sm text-text-muted">{t("plan.seatCount", { count: total })}</p>

      {losing > 0 && (
        <p className="text-danger text-sm">{t("rooms.stampWarning", { count: losing })}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {saving ? (
          <button type="button" className="btn btn-danger" disabled>
            {t("plan.apply")}
          </button>
        ) : (
          <ConfirmButton
            label={t("plan.apply")}
            confirmLabel={t("plan.confirmStamp")}
            danger
            onConfirm={async () => {
              setSaving(true);
              try {
                await onApply(shape);
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
