import type { GradeColumn } from "@db";
import { useDb } from "@db/provider";
import {
  CALCULATION_KINDS,
  type CalculationKind,
  type CalculationSpec,
} from "@domain/gradebook/calculation";
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
import { useEscape } from "../../shared/use-escape";

export function ColumnForm({
  gradebookId,
  periodId,
  column,
  /** The gradebook's numeric columns in this period — the only valid sources for a calculation. */
  numericColumns,
  onDone,
}: {
  gradebookId: string;
  periodId: string;
  column?: GradeColumn;
  numericColumns: GradeColumn[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [label, setLabel] = useState(column?.label ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "numeric");
  const [weight, setWeight] = useState(String(column?.weight ?? DEFAULT_COLUMN_WEIGHT));
  const [max, setMax] = useState(String(column?.max ?? DEFAULT_COLUMN_MAX));
  const [calcKind, setCalcKind] = useState<CalculationKind>(column?.calculation?.kind ?? "mean");
  const [sourceColumnIds, setSourceColumnIds] = useState<string[]>(
    column?.calculation?.sourceColumnIds ?? [],
  );
  const [bestCount, setBestCount] = useState(
    column?.calculation?.bestCount === undefined ? "" : String(column.calculation.bestCount),
  );
  const [error, setError] = useState<string | null>(null);

  useEscape(onDone);

  function toggleSource(id: string): void {
    setSourceColumnIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    );
  }

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

    // A calculation column stores nothing of its own: weight and max stay at
    // their defaults and are simply never consulted, since `isNumericColumn`
    // is false for this type.
    const parsedBestCount = parseDecimal(bestCount);
    const calculation: CalculationSpec | undefined =
      type === "calculation"
        ? {
            kind: calcKind,
            sourceColumnIds,
            ...(calcKind === "bestOf" && parsedBestCount !== null && parsedBestCount > 0
              ? { bestCount: Math.round(parsedBestCount) }
              : {}),
          }
        : undefined;

    if (column) {
      // Destructure `calculation` out rather than leaving a stale spec
      // behind: switching a column away from "calculation" must clear it,
      // not just stop reading it.
      const { calculation: _previousCalculation, ...rest } = column;
      await db.columns.put({
        ...rest,
        label,
        type,
        weight: nextWeight,
        max: nextMax,
        ...(calculation ? { calculation } : {}),
      });
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
        ...(calculation ? { calculation } : {}),
      });
    }
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-wrap items-end gap-3 rounded border border-border p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.columnType")}</span>
        <select
          className="field"
          // biome-ignore lint/a11y/noAutofocus: opens ready to use — one-handed, mid-lesson, no spare tap to reach the field.
          autoFocus
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
        <span className="text-sm text-text-muted">{t("gradebook.columnLabel")}</span>
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} />
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
      {type === "calculation" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("gradebook.calcKindLabel")}</span>
            <select
              className="field"
              value={calcKind}
              onChange={(e) => setCalcKind(e.target.value as CalculationKind)}
            >
              {CALCULATION_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`gradebook.calcKind.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          {calcKind === "bestOf" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("gradebook.bestCount")}</span>
              <input
                className="field"
                inputMode="numeric"
                value={bestCount}
                onChange={(e) => setBestCount(e.target.value)}
              />
            </label>
          )}
          <fieldset className="flex min-w-48 flex-col gap-1 border-0 p-0">
            <legend className="text-sm text-text-muted">{t("gradebook.calcSources")}</legend>
            {numericColumns.length === 0 ? (
              <p className="text-text-faint text-xs">{t("gradebook.calcNoSources")}</p>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {numericColumns.map((source) => (
                  <label key={source.id} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={sourceColumnIds.includes(source.id)}
                      onChange={() => toggleSource(source.id)}
                    />
                    {source.label}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </>
      )}
      <button type="submit" className="btn btn-primary">
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
    </form>
  );
}
