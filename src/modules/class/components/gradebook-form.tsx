import type { SchoolClass, Subject } from "@db";
import { createGradebookWithPeriods } from "@db/gradebooks";
import { useDb } from "@db/provider";
import { defaultGradebookName } from "@domain/gradebook/naming";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

/**
 * Creates a gradebook: this class taught in one subject.
 *
 * The class is not a choice — the form only ever opens inside a class, so
 * offering a dropdown of every class would invite creating a carnet for 5°A
 * while standing in 3°B. Only the subject is picked, and the caller guarantees
 * there is at least one to pick.
 */
export function GradebookForm({
  schoolClass,
  subjects,
  onDone,
}: {
  schoolClass: SchoolClass;
  subjects: Subject[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const classId = schoolClass.id;
  const [subjectId, setSubjectId] = useState(subjects[0].id);
  // Until the teacher types a name of their own, the field follows the two
  // dropdowns; the first keystroke pins it, so changing a dropdown afterwards
  // never overwrites what they wrote.
  const [customName, setCustomName] = useState<string | null>(null);

  const suggestedName = defaultGradebookName(
    subjects.find((subject) => subject.id === subjectId)?.name ?? "",
    schoolClass.name,
  );
  const name = customName ?? suggestedName;

  useEscape(onDone);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    await createGradebookWithPeriods(db, {
      classId,
      subjectId,
      name: trimmed.length > 0 ? trimmed : suggestedName,
    });
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("dashboard.gradebookSubject")}</span>
          <select
            className="field"
            // biome-ignore lint/a11y/noAutofocus: opens ready to use — one-handed, mid-lesson, no spare tap to reach the field.
            autoFocus
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("dashboard.gradebookName")}</span>
          <input className="field" value={name} onChange={(e) => setCustomName(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-text-muted">{t("dashboard.gradebookPeriodsHint")}</p>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
