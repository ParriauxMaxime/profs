import type { GradeColumn } from "@db";
import { useDb } from "@db/provider";
import {
  COLUMN_TYPES,
  type ColumnType,
  DEFAULT_COLUMN_MAX,
  DEFAULT_COLUMN_WEIGHT,
  isNumericColumn,
} from "@domain/gradebook/column";
import { parseDecimal } from "@domain/gradebook/decimal";
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
  const [weight, setWeight] = useState(String(column?.weight ?? DEFAULT_COLUMN_WEIGHT));
  const [max, setMax] = useState(String(column?.max ?? DEFAULT_COLUMN_MAX));
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    // Weight and max must be strictly positive: a weight of 0 silently drops
    // the column out of every average, and a max of 0 or less makes the column
    // permanently un-fillable, since every entry then fails the max check.
    // Refuse them with a message rather than substituting a default behind the
    // teacher's back.
    const parsedWeight = parseDecimal(weight);
    const parsedMax = parseDecimal(max);
    const numeric = isNumericColumn(type);

    if (numeric && (parsedWeight === null || parsedWeight <= 0)) {
      setError(t("gradebook.positiveRequired"));
      return;
    }
    if (type === "numeric" && (parsedMax === null || parsedMax <= 0)) {
      setError(t("gradebook.positiveRequired"));
      return;
    }
    setError(null);

    // A hidden field is not validated, but its value is still kept if it is
    // usable — switching a column to a non-numeric type must not silently
    // reset the scale it would go back to.
    const nextWeight =
      parsedWeight !== null && parsedWeight > 0 ? parsedWeight : DEFAULT_COLUMN_WEIGHT;
    const nextMax = parsedMax !== null && parsedMax > 0 ? parsedMax : DEFAULT_COLUMN_MAX;

    if (column) {
      await db.columns.update(column.id, { label, type, weight: nextWeight, max: nextMax });
    } else {
      const siblings = await db.columns.where("gradebookId").equals(gradebookId).count();
      await db.columns.add({
        id: crypto.randomUUID(),
        gradebookId,
        periodId,
        type,
        label: label || t("gradebook.untitledColumn"),
        weight: nextWeight,
        max: nextMax,
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
      {isNumericColumn(type) && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("gradebook.weight")}</span>
          <input
            className="field"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
      )}
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
      {error && (
        <p role="alert" className="w-full text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
