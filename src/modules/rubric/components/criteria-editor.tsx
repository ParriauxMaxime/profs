import type { RubricCriterion } from "@domain/rubric";
import { useTranslation } from "react-i18next";

/**
 * A controlled editor over a whole `RubricCriterion[]`.
 *
 * The list is the value, not one criterion at a time: criteria are edited as
 * a set (add, remove, reorder), so anything less than the whole array would
 * force the caller to reconstruct it on every change anyway.
 *
 * Rows are keyed on `criterion.id`, never the array index — with an index
 * key, reordering would move the focused input's contents to a different
 * criterion, the position-vs-identity bug this codebase keeps producing.
 */
export function CriteriaEditor({
  value,
  onChange,
}: {
  value: RubricCriterion[];
  onChange: (next: RubricCriterion[]) => void;
}) {
  const { t } = useTranslation();

  function updateLabel(id: string, label: string): void {
    onChange(value.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  function remove(id: string): void {
    onChange(value.filter((c) => c.id !== id));
  }

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    onChange(next);
  }

  function add(): void {
    onChange([...value, { id: crypto.randomUUID(), label: "" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">{t("rubric.criteria")}</span>
      <ul className="flex flex-col gap-2">
        {value.map((criterion, index) => (
          <li key={criterion.id} className="flex items-center gap-2">
            <input
              className="field grow"
              value={criterion.label}
              placeholder={t("rubric.criterionLabel")}
              onChange={(e) => updateLabel(criterion.id, e.target.value)}
            />
            <button
              type="button"
              className="btn"
              aria-label={t("rubric.moveUp")}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn"
              aria-label={t("rubric.moveDown")}
              disabled={index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="text-text-muted hover:text-accent"
              onClick={() => remove(criterion.id)}
            >
              {t("common.delete")}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn self-start" onClick={add}>
        {t("rubric.addCriterion")}
      </button>
    </div>
  );
}
