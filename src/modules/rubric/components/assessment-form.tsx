import type { Period, RubricTemplate } from "@db";
import { useDb } from "@db/provider";
import { createAssessment, createAssessmentFromTemplate } from "@db/rubrics";
import type { RubricCriterion } from "@domain/rubric";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { CriteriaEditor } from "./criteria-editor";

/**
 * Creates a new assessment, from a template or from a blank grid.
 *
 * A template copies its criteria (through `createAssessmentFromTemplate`) so
 * that improving the template later cannot rewrite a grid already graded. A
 * blank grid is built inline with `CriteriaEditor` and written through
 * `createAssessment` — either way, the write itself lives in `@db/rubrics`,
 * never inline here.
 */
export function AssessmentForm({
  gradebookId,
  periods,
  activePeriodId,
  templates,
  onDone,
}: {
  gradebookId: string;
  periods: Period[];
  /** The gradebook's active period, preselected — "" when there is none. */
  activePeriodId: string;
  templates: RubricTemplate[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState("");
  const [periodId, setPeriodId] = useState(activePeriodId);
  const [templateId, setTemplateId] = useState<string>("blank");
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || periodId === "") return;

    const assessment =
      templateId === "blank"
        ? await createAssessment(db, { gradebookId, periodId, name: trimmed, criteria })
        : await createAssessmentFromTemplate(db, templateId, {
            gradebookId,
            periodId,
            name: trimmed,
          });

    onDone();
    Router.push("Rubric", { gradebookId, assessmentId: assessment.id });
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("rubric.assessmentName")}</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("rubric.period")}</span>
        <select className="field" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("rubric.source")}</span>
        <select
          className="field"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="blank">{t("rubric.blank")}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      {templateId === "blank" && <CriteriaEditor value={criteria} onChange={setCriteria} />}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={name.trim().length === 0 || periodId === ""}
          onClick={() => void save()}
        >
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
