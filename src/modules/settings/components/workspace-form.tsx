import {
  createWorkspace,
  currentSchoolYear,
  renameWorkspace,
  type Workspace,
} from "@domain/workspaces";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

/**
 * Creates or renames an établissement.
 *
 * The year is free text rather than a pair of dates: French school years are
 * written "2026-2027" and nothing in the app computes with them — they only
 * tell two workspaces apart in the switcher.
 */
export function WorkspaceForm({
  workspace,
  onDone,
}: {
  workspace?: Workspace;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(workspace?.name ?? "");
  const [year, setYear] = useState(workspace?.year ?? currentSchoolYear());
  const [error, setError] = useState<string | null>(null);

  useEscape(onDone);

  function save(): void {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError(t("workspace.nameRequired"));
      return;
    }
    setError(null);

    const trimmedYear = year.trim();
    if (workspace) {
      renameWorkspace(workspace.id, trimmedName, trimmedYear);
    } else {
      // Deliberately does NOT switch to the new workspace: creating one from
      // Réglages while the teacher is mid-import or mid-wipe of the current
      // one must not move the ground under them. Switching is the drawer's
      // job, one explicit tap away.
      createWorkspace(trimmedName, trimmedYear);
    }
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("workspace.name")}</span>
        <input
          className="field"
          // biome-ignore lint/a11y/noAutofocus: opens ready to type — one-handed, mid-lesson, no spare tap to reach the field.
          autoFocus
          value={name}
          placeholder={t("workspace.namePlaceholder")}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="flex max-w-xs flex-col gap-1">
        <span className="text-sm text-text-muted">{t("workspace.year")}</span>
        <input
          className="field"
          value={year}
          placeholder={currentSchoolYear()}
          onChange={(e) => setYear(e.target.value)}
        />
      </label>

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
