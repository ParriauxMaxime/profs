import type { RubricTemplate } from "@db";
import { useDb } from "@db/provider";
import { saveTemplate } from "@db/rubrics";
import type { RubricCriterion } from "@domain/rubric";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CriteriaEditor } from "../../rubric/components/criteria-editor";

/**
 * Creates or renames a rubric template and edits its criteria.
 *
 * Keyed by the caller on the template id (`"new"` for creation) — the same
 * `StudentForm` bug in a new disguise: `useState` seeds from `template` only
 * at mount, so switching the edit target without a fresh key would write one
 * template's edits onto another.
 */
export function RubricTemplateForm({
  template,
  onDone,
}: {
  template?: RubricTemplate;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState(template?.name ?? "");
  const [criteria, setCriteria] = useState<RubricCriterion[]>(template?.criteria ?? []);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    // The write itself lives in src/db/rubrics.ts: deciding between add and
    // update, minting the id and stamping the timestamps are database
    // concerns, and inline versions of them are what let defects through in
    // phase 2A.
    await saveTemplate(db, { templateId: template?.id, name: trimmed, criteria });
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("rubric.templateName")}</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <CriteriaEditor value={criteria} onChange={setCriteria} />

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={name.trim().length === 0}
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
