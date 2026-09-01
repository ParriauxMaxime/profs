import type { SchoolClass, Subject } from "@db";
import { useDb } from "@db/provider";
import { defaultGradebookName } from "@domain/gradebook/naming";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Creates a gradebook: one class taught in one subject.
 *
 * Both lists are guaranteed non-empty by the caller — a gradebook needs a
 * class and a subject to exist, and the dashboard says so rather than
 * rendering a form with two empty dropdowns.
 */
export function GradebookForm({
  classes,
  subjects,
  onDone,
}: {
  classes: SchoolClass[];
  subjects: Subject[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [classId, setClassId] = useState(classes[0].id);
  const [subjectId, setSubjectId] = useState(subjects[0].id);
  // Until the teacher types a name of their own, the field follows the two
  // dropdowns; the first keystroke pins it, so changing a dropdown afterwards
  // never overwrites what they wrote.
  const [customName, setCustomName] = useState<string | null>(null);

  const suggestedName = defaultGradebookName(
    subjects.find((subject) => subject.id === subjectId)?.name ?? "",
    classes.find((schoolClass) => schoolClass.id === classId)?.name ?? "",
  );
  const name = customName ?? suggestedName;

  async function save(): Promise<void> {
    const now = Date.now();
    const gradebookId = crypto.randomUUID();
    const trimmed = name.trim();

    // The gradebook and its three trimesters are written together: a gradebook
    // with no period renders an empty grid with nowhere to put a column, so it
    // must never exist, not even between two awaits.
    await db.transaction("rw", [db.gradebooks, db.periods], async () => {
      await db.gradebooks.add({
        id: gradebookId,
        classId,
        subjectId,
        name: trimmed.length > 0 ? trimmed : suggestedName,
        createdAt: now,
        updatedAt: now,
      });
      await db.periods.bulkAdd(
        DEFAULT_PERIOD_NAMES.map((periodName, order) => ({
          id: crypto.randomUUID(),
          gradebookId,
          name: periodName,
          order,
        })),
      );
    });
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("dashboard.gradebookClass")}</span>
          <select className="field" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("dashboard.gradebookSubject")}</span>
          <select
            className="field"
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
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
