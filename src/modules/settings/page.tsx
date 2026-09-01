import { exportWorkspace, importWorkspace } from "@db/backup";
import { useDb } from "@db/provider";
import { LOCALES, type Locale, loadLocale, saveLocale } from "@i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SettingsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useLiveQuery(() => db.subjects.toArray(), [db]);

  async function onExport(): Promise<void> {
    const backup = await exportWorkspace(db);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `profs-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(file: File): Promise<void> {
    setError(null);
    try {
      await importWorkspace(db, JSON.parse(await file.text()));
    } catch {
      setError(t("settings.importFailed"));
    }
  }

  async function onWipe(): Promise<void> {
    await db.transaction(
      "rw",
      [db.classes, db.students, db.subjects, db.gradebooks, db.periods, db.columns, db.grades],
      async () => {
        for (const table of [
          db.classes,
          db.students,
          db.subjects,
          db.gradebooks,
          db.periods,
          db.columns,
          db.grades,
        ]) {
          await table.clear();
        }
      },
    );
    setConfirmingWipe(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.language")}</h2>
        <select
          className="field max-w-xs"
          value={loadLocale()}
          onChange={(e) => saveLocale(e.target.value as Locale)}
        >
          {LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {t(`settings.locale.${locale}`)}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.subjects")}</h2>
        <ul className="flex flex-wrap gap-2">
          {(subjects ?? []).map((subject) => (
            <li
              key={subject.id}
              className="rounded border border-border px-2 py-1 text-sm"
              style={{ borderLeft: `4px solid ${subject.color}` }}
            >
              {subject.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.backup")}</h2>
        <p className="text-sm text-text-muted">{t("settings.backupHelp")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => void onExport()}>
            {t("settings.export")}
          </button>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-danger text-lg">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-text-muted">{t("settings.wipeHelp")}</p>
        {confirmingWipe ? (
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger" onClick={() => void onWipe()}>
              {t("settings.wipeConfirm")}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmingWipe(false)}>
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-danger self-start"
            onClick={() => setConfirmingWipe(true)}
          >
            {t("settings.wipe")}
          </button>
        )}
      </section>
    </div>
  );
}
