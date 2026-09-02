import type { RubricTemplate, Subject } from "@db";
import {
  BackupOverCapacityError,
  exportWorkspace,
  importWorkspace,
  parseBackup,
  type WorkspaceBackup,
} from "@db/backup";
import { deleteRubricTemplate, deleteSubject } from "@db/cascade";
import { useDb } from "@db/provider";
import { wipeWorkspace } from "@db/workspace";
import { MAX_STUDENTS_PER_CLASS } from "@domain/class-size";
import { fromDateInputValue, readTermStart, toDateInputValue, writeTermStart } from "@domain/term";
import { THEME_CHOICES } from "@domain/theme";
import { LOCALES, type Locale, loadLocale, saveLocale } from "@i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { ToggleOption } from "../design-system/components/primitives";
import { useTheme } from "../shared/use-theme";
import { RubricTemplateForm } from "./components/rubric-template-form";
import { SubjectForm } from "./components/subject-form";

/** A subject a gradebook still points at: deleting it was refused. */
interface SubjectRefusal {
  subjectId: string;
  name: string;
  gradebookCount: number;
  sessionCount: number;
}

interface PendingImport {
  fileName: string;
  backup: WorkspaceBackup;
}

export function SettingsPage() {
  const { choice, setChoice } = useTheme();
  const { t } = useTranslation();
  const db = useDb();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | "new" | null>(null);
  const [subjectRefusal, setSubjectRefusal] = useState<SubjectRefusal | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<RubricTemplate | "new" | null>(null);
  // Held in state as well as localStorage so the field re-renders when it
  // changes; localStorage is not reactive and Today reads it on mount.
  const [termStart, setTermStart] = useState<number | null>(() => readTermStart());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const subjects = useLiveQuery(() => db.subjects.toArray(), [db]);
  const templates = useLiveQuery(() => db.rubricTemplates.toArray(), [db]);

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
    } catch (error) {
      setError(
        error instanceof BackupOverCapacityError
          ? t("settings.importOverCapacity", { max: MAX_STUDENTS_PER_CLASS })
          : t("settings.importFailed"),
      );
      resetFileInput();
    }
  }

  async function onConfirmImport(): Promise<void> {
    if (!pendingImport) return;
    try {
      await importWorkspace(db, pendingImport.backup);
      setSuccess(true);
    } catch (error) {
      setError(
        error instanceof BackupOverCapacityError
          ? t("settings.importOverCapacity", { max: MAX_STUDENTS_PER_CLASS })
          : t("settings.importFailed"),
      );
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
    await wipeWorkspace(db);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.theme")}</h2>
        <p className="text-sm text-text-muted">{t("settings.themeHint")}</p>
        <div className="flex flex-wrap gap-2">
          {THEME_CHOICES.map((option) => (
            <ToggleOption
              key={option}
              selected={choice === option}
              onSelect={() => setChoice(option)}
            >
              <span className="flex flex-col items-start">
                <span>{t(`settings.themeChoice.${option}`)}</span>
                <span className="font-normal text-xs opacity-70">
                  {t(`settings.themeNote.${option}`)}
                </span>
              </span>
            </ToggleOption>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">{t("settings.termStart")}</h2>
        <p className="text-sm text-text-muted">{t("settings.termStartHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="field max-w-xs"
            aria-label={t("settings.termStart")}
            value={termStart === null ? "" : toDateInputValue(termStart)}
            onChange={(e) => {
              // The empty string is a cleared field, not a bad date: clearing
              // the anchor is how a teacher turns A/B weeks off.
              const next = e.target.value === "" ? null : fromDateInputValue(e.target.value);
              if (e.target.value !== "" && next === null) return;
              writeTermStart(next);
              setTermStart(next);
            }}
          />
          {termStart === null ? (
            <span className="text-sm text-text-faint">{t("settings.termStartUnset")}</span>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => {
                writeTermStart(null);
                setTermStart(null);
              }}
            >
              {t("settings.termStartClear")}
            </button>
          )}
        </div>
      </section>

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">{t("settings.subjects")}</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSubjectRefusal(null);
              setEditingSubject("new");
            }}
          >
            {t("settings.addSubject")}
          </button>
        </div>

        {editingSubject === "new" && (
          <SubjectForm key="new" onDone={() => setEditingSubject(null)} />
        )}
        {editingSubject !== null && editingSubject !== "new" && (
          // Keyed by subject id: the form seeds its state at mount, so
          // switching target has to remount it.
          <SubjectForm
            key={editingSubject.id}
            subject={editingSubject}
            onDone={() => setEditingSubject(null)}
          />
        )}

        {subjects === undefined ? (
          <p className="text-text-muted">{t("common.loading")}</p>
        ) : subjects.length === 0 ? (
          <p className="text-text-muted">{t("settings.noSubjects")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2 text-sm"
                style={{ borderLeft: `4px solid ${subject.color}` }}
              >
                <span className="grow font-medium">{subject.name}</span>
                <button
                  type="button"
                  className="text-text-muted hover:text-accent"
                  onClick={() => {
                    setSubjectRefusal(null);
                    setEditingSubject(subject);
                  }}
                >
                  {t("common.edit")}
                </button>
                <ConfirmButton
                  danger
                  variant="link"
                  label={t("common.delete")}
                  confirmLabel={t("settings.confirmDeleteSubject")}
                  onArmedChange={(armed) => {
                    // Cancelling clears the refusal: leaving it up would have
                    // the teacher reading a reason for a deletion they are no
                    // longer attempting, and which a since-deleted gradebook
                    // may already have made untrue.
                    if (!armed) setSubjectRefusal(null);
                  }}
                  onConfirm={async () => {
                    // A subject holds nothing of its own, so deleting one that
                    // is still taught would have to take whole gradebooks with
                    // it. The cascade refuses instead, and the refusal has to
                    // be visible or the button looks broken.
                    const result = await deleteSubject(db, subject.id);
                    if (result.deleted) {
                      setSubjectRefusal(null);
                      setEditingSubject((current) =>
                        current !== "new" && current?.id === subject.id ? null : current,
                      );
                      return;
                    }
                    setSubjectRefusal({
                      subjectId: subject.id,
                      name: subject.name,
                      gradebookCount: result.gradebookCount,
                      sessionCount: result.sessionCount,
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        {subjectRefusal && (
          <div role="alert" className="flex flex-col gap-1 text-danger text-sm">
            {subjectRefusal.gradebookCount > 0 && (
              <p>
                {t("settings.subjectInUse", {
                  name: subjectRefusal.name,
                  count: subjectRefusal.gradebookCount,
                })}
              </p>
            )}
            {subjectRefusal.sessionCount > 0 && (
              <p>
                {t("settings.subjectInUseSessions", {
                  name: subjectRefusal.name,
                  count: subjectRefusal.sessionCount,
                })}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">{t("rubric.templates")}</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEditingTemplate("new")}
          >
            {t("rubric.newTemplate")}
          </button>
        </div>

        {editingTemplate === "new" && (
          <RubricTemplateForm key="new" onDone={() => setEditingTemplate(null)} />
        )}
        {editingTemplate !== null && editingTemplate !== "new" && (
          // Keyed by template id: the form seeds its state at mount, so
          // switching target has to remount it.
          <RubricTemplateForm
            key={editingTemplate.id}
            template={editingTemplate}
            onDone={() => setEditingTemplate(null)}
          />
        )}

        {templates === undefined ? (
          <p className="text-text-muted">{t("common.loading")}</p>
        ) : templates.length === 0 ? (
          <p className="text-text-muted">{t("rubric.noTemplates")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2 text-sm"
              >
                <span className="grow font-medium">{template.name}</span>
                <button
                  type="button"
                  className="text-text-muted hover:text-accent"
                  onClick={() => setEditingTemplate(template)}
                >
                  {t("common.edit")}
                </button>
                <ConfirmButton
                  danger
                  variant="link"
                  label={t("common.delete")}
                  confirmLabel={t("rubric.confirmDeleteTemplate")}
                  onConfirm={async () => {
                    await deleteRubricTemplate(db, template.id);
                    setEditingTemplate((current) =>
                      current !== "new" && current?.id === template.id ? null : current,
                    );
                  }}
                />
              </li>
            ))}
          </ul>
        )}
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
              {/* Armed from the outside: choosing a file is the first step of
                  this confirm, so the button is never idle. */}
              <ConfirmButton
                danger
                armed
                onArmedChange={(armed) => {
                  if (!armed) onCancelImport();
                }}
                confirmLabel={t("settings.importConfirm")}
                onConfirm={onConfirmImport}
              />
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        {success && <p className="text-sm">{t("settings.importSuccess")}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-danger text-lg">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-text-muted">{t("settings.wipeHelp")}</p>
        <div className="flex gap-2">
          <ConfirmButton
            danger
            className="self-start"
            label={t("settings.wipe")}
            confirmLabel={t("settings.wipeConfirm")}
            onConfirm={onWipe}
          />
        </div>
      </section>
    </div>
  );
}
