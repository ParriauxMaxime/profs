import type { Subject } from "@db";
import { useDb } from "@db/provider";
import { DEFAULT_SUBJECT_COLOR, SUBJECT_COLORS } from "@domain/subject";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Creates or renames a subject, and picks its colour from the shared palette.
 *
 * The colour is chosen from swatches rather than typed: the palette lives in
 * `@domain/subject`, and a free hex field would let a teacher pick something
 * unreadable against the page.
 */
export function SubjectForm({ subject, onDone }: { subject?: Subject; onDone: () => void }) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState(subject?.name ?? "");
  const [color, setColor] = useState<string>(subject?.color ?? DEFAULT_SUBJECT_COLOR);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("settings.subjectNameRequired"));
      return;
    }
    setError(null);

    const now = Date.now();
    if (subject) {
      await db.subjects.update(subject.id, { name: trimmed, color, updatedAt: now });
    } else {
      await db.subjects.add({
        id: crypto.randomUUID(),
        name: trimmed,
        color,
        createdAt: now,
        updatedAt: now,
      });
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("settings.subjectName")}</span>
        <input
          className="field"
          value={name}
          placeholder={t("settings.subjectNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm text-text-muted">{t("settings.subjectColor")}</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={color === swatch}
              className={`h-8 w-8 rounded-full border-2 ${
                color === swatch ? "border-text" : "border-transparent"
              }`}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
