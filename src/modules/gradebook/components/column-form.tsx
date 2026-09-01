import type { GradeColumn } from "@db";
import { useDb } from "@db/provider";
import { COLUMN_TYPES, type ColumnType } from "@domain/gradebook/column";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ColumnForm({
  gradebookId,
  periodId,
  column,
  onDone,
}: {
  gradebookId: string;
  periodId: string;
  column?: GradeColumn;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [label, setLabel] = useState(column?.label ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "numeric");
  const [weight, setWeight] = useState(String(column?.weight ?? 1));
  const [max, setMax] = useState(String(column?.max ?? 20));

  async function save(): Promise<void> {
    const parsedWeight = Number(weight.replace(",", ".")) || 1;
    const parsedMax = Number(max.replace(",", ".")) || 20;

    if (column) {
      await db.columns.update(column.id, { label, type, weight: parsedWeight, max: parsedMax });
    } else {
      const siblings = await db.columns.where("gradebookId").equals(gradebookId).count();
      await db.columns.add({
        id: crypto.randomUUID(),
        gradebookId,
        periodId,
        type,
        label: label || t("gradebook.untitledColumn"),
        weight: parsedWeight,
        max: parsedMax,
        order: siblings,
        date: Date.now(),
      });
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.columnLabel")}</span>
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.columnType")}</span>
        <select
          className="field"
          value={type}
          onChange={(e) => setType(e.target.value as ColumnType)}
        >
          {COLUMN_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`gradebook.type.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.weight")}</span>
        <input
          className="field"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </label>
      {type === "numeric" && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("gradebook.max")}</span>
          <input
            className="field"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void save()}>
        {t("common.save")}
      </button>
      <button type="button" className="btn" onClick={onDone}>
        {t("common.cancel")}
      </button>
    </div>
  );
}
