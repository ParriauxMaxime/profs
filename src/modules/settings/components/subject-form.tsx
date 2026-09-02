import type { Subject } from "@db";
import { useDb } from "@db/provider";
import { DEFAULT_SUBJECT_COLOR, SUBJECT_COLORS } from "@domain/subject";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

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

  useEscape(onDone);

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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("settings.subjectName")}</span>
        <input
          className="field"
          // biome-ignore lint/a11y/noAutofocus: opens ready to type — one-handed, mid-lesson, no spare tap to reach the field.
          autoFocus
          value={name}
          placeholder={t("settings.subjectNamePlaceholder")}
          aria-invalid={error ? true : undefined}
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
        <button type="submit" className="btn btn-primary">
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
    </form>
  );
}
