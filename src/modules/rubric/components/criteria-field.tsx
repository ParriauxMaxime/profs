import type { RubricTemplate } from "@db";
import { newCriterion } from "@db/rubrics";
import type { RubricCriterion } from "@domain/rubric";
import { useTranslation } from "react-i18next";
import { CriteriaEditor } from "./criteria-editor";

/**
 * The "critères" half of a rubric column's form: a starting point — vierge
 * or a template — plus the same `CriteriaEditor` a template itself is edited
 * with, so a teacher can adjust what a template gave them before saving.
 *
 * Choosing a template never keeps the template's own ids. Two columns built
 * from one template must not share a criterion id — a level written against
 * one would be silently readable from the other — and improving the
 * template later must never reach a grille already graded. `newCriterion`
 * mints a fresh id every time, so `applyTemplate` is the only path a
 * template's criteria take into a column.
 */
export function CriteriaField({
  value,
  onChange,
  templates,
}: {
  value: RubricCriterion[];
  onChange: (next: RubricCriterion[]) => void;
  templates: RubricTemplate[];
}) {
  const { t } = useTranslation();

  function applyTemplate(templateId: string): void {
    if (templateId === "blank") {
      onChange([]);
      return;
    }
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    onChange(template.criteria.map((criterion) => newCriterion(criterion.label)));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("rubric.criteriaSource")}</span>
        <select
          className="field"
          defaultValue="blank"
          onChange={(e) => applyTemplate(e.target.value)}
        >
          <option value="blank">{t("rubric.blank")}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <CriteriaEditor value={value} onChange={onChange} />
    </div>
  );
}
