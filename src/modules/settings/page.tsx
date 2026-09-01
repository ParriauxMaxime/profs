import { exportWorkspace, importWorkspace, parseBackup, type WorkspaceBackup } from "@db/backup";
import { useDb } from "@db/provider";
import { LOCALES, type Locale, loadLocale, saveLocale } from "@i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface PendingImport {
  fileName: string;
  backup: WorkspaceBackup;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const db = useDb();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function resetFileInput(): void {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Reads and validates the chosen file, but writes nothing yet — the
   * teacher must confirm before the destructive import runs. */
  async function onFileChosen(file: File): Promise<void> {
    setError(null);
    setSuccess(false);
    try {
      const backup = parseBackup(JSON.parse(await file.text()));
      setPendingImport({ fileName: file.name, backup });
    } catch {
      setError(t("settings.importFailed"));
      resetFileInput();
    }
  }

  async function onConfirmImport(): Promise<void> {
    if (!pendingImport) return;
    try {
      await importWorkspace(db, pendingImport.backup);
      setSuccess(true);
    } catch {
      setError(t("settings.importFailed"));
    } finally {
      setPendingImport(null);
      resetFileInput();
    }
  }

  function onCancelImport(): void {
    setPendingImport(null);
    resetFileInput();
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
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            disabled={pendingImport !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
            }}
          />
        </div>
        {pendingImport && (
          <div className="flex flex-col gap-2 rounded border border-border p-3">
            <p className="text-sm">
              {t("settings.importConfirmMessage", {
                fileName: pendingImport.fileName,
                date: new Date(pendingImport.backup.exportedAt).toLocaleString(loadLocale(), {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void onConfirmImport()}
              >
                {t("settings.importConfirm")}
              </button>
              <button type="button" className="btn" onClick={onCancelImport}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-danger text-sm">{error}</p>}
        {success && <p className="text-sm">{t("settings.importSuccess")}</p>}
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
