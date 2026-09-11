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
import { resetToFixture } from "@db/seed";
import { readEscalation, writeEscalation } from "@db/settings";
import { wipeWorkspace } from "@db/workspace";
import { MAX_STUDENTS_PER_CLASS } from "@domain/class-size";
import {
  clampRule,
  DEFAULT_ESCALATION,
  MAX_ESCALATION_SEANCES,
  MAX_ESCALATION_YELLOWS,
  MIN_ESCALATION_SEANCES,
  MIN_ESCALATION_YELLOWS,
} from "@domain/escalation";
import { fromDateInputValue, readTermStart, toDateInputValue, writeTermStart } from "@domain/term";
import { THEME_CHOICES } from "@domain/theme";
import { useActiveWorkspaceId } from "@domain/workspaces";
import { LOCALES, type Locale, loadLocale, saveLocale } from "@i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { ToggleGroup, ToggleOption } from "../design-system/components/primitives";
import { useTheme } from "../shared/use-theme";
import { RubricTemplateForm } from "./components/rubric-template-form";
import { SubjectForm } from "./components/subject-form";
import { WorkspaceSection } from "./components/workspace-section";

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
  const workspaceId = useActiveWorkspaceId();
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
  const escalation = useLiveQuery(() => readEscalation(db), [db]) ?? DEFAULT_ESCALATION;
  /**
   * The two numbers as typed, so a teacher going from 2 to 10 is not clamped
   * back to the floor by the "1" they pass through. Null means "showing the
   * stored value"; a string means they are mid-edit. Written on BLUR.
   */
  const [draftYellows, setDraftYellows] = useState<string | null>(null);
  const [draftSeances, setDraftSeances] = useState<string | null>(null);
  // Keyed on the STORED value rather than "does the draft now match it": a
  // clamp can equal the old stored value before the write lands (typing 99
  // over a stored 10 clamps to 10), so that comparison would clear the draft
  // at the wrong moment. A change in the stored value — from this write
  // landing, or from an import, a wipe, another surface — is the honest
  // signal that the field can go back to tracking it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: escalation.yellows is a reset trigger, not a value read in the body — any change must clear the stale draft.
  useEffect(() => setDraftYellows(null), [escalation.yellows]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: escalation.seances is a reset trigger, not a value read in the body — any change must clear the stale draft.
  useEffect(() => setDraftSeances(null), [escalation.seances]);

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

  // The hook, not `activeWorkspaceId()`: the id has to be the one this render
  // is looking at, and a reset filed against a stale id would clear the wrong
  // workspace's seed marker while wiping this one.
  async function onReset(): Promise<void> {
    if (!workspaceId) return;
    await resetToFixture(db, workspaceId);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* First on the page: every section below it — subjects, backup, the
          wipe — acts on the active établissement, so which one that is has to
          be readable before any of them. */}
      <WorkspaceSection />

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
        <h2 className="font-semibold text-lg">{t("escalation.title")}</h2>
        <p className="text-sm text-text-muted">{t("escalation.hint")}</p>

        <ToggleGroup>
          <ToggleOption
            selected={escalation.enabled}
            onSelect={() => void writeEscalation(db, { enabled: true })}
          >
            {t("escalation.on")}
          </ToggleOption>
          <ToggleOption
            selected={!escalation.enabled}
            onSelect={() => void writeEscalation(db, { enabled: false })}
          >
            {t("escalation.off")}
          </ToggleOption>
        </ToggleGroup>

        {/* Disabled rather than hidden while the rule is off: a teacher turning
            it back on should find the numbers they set, not a row that appeared
            from nowhere. */}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("escalation.yellowsLabel")}</span>
            <input
              type="number"
              className="field max-w-28"
              min={MIN_ESCALATION_YELLOWS}
              max={MAX_ESCALATION_YELLOWS}
              disabled={!escalation.enabled}
              value={draftYellows ?? String(escalation.yellows)}
              onChange={(e) => setDraftYellows(e.target.value)}
              onBlur={() => {
                // A blur with no preceding onChange leaves the draft null —
                // the teacher tabbed or tapped through without typing a
                // digit. `Number(null)` reads as 0, which `clampRule` lifts
                // to the floor, so clamping here unconditionally would
                // silently overwrite a real rule with the floor every time a
                // field is merely focused and released.
                if (draftYellows === null) return;
                const next = clampRule({ ...escalation, yellows: Number(draftYellows) });
                // The clamped string, not null: falling back to the
                // render-time `escalation.yellows` here would flash the OLD
                // value until the write resolves and useLiveQuery re-renders.
                // The effect above clears this once the stored value moves.
                setDraftYellows(String(next.yellows));
                if (next.yellows !== escalation.yellows) {
                  void writeEscalation(db, { yellows: next.yellows });
                }
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-text-muted">{t("escalation.seancesLabel")}</span>
            <input
              type="number"
              className="field max-w-28"
              min={MIN_ESCALATION_SEANCES}
              max={MAX_ESCALATION_SEANCES}
              disabled={!escalation.enabled}
              value={draftSeances ?? String(escalation.seances)}
              onChange={(e) => setDraftSeances(e.target.value)}
              onBlur={() => {
                // A blur with no preceding onChange leaves the draft null —
                // the teacher tabbed or tapped through without typing a
                // digit. `Number(null)` reads as 0, which `clampRule` lifts
                // to the floor, so clamping here unconditionally would
                // silently overwrite a real rule with the floor every time a
                // field is merely focused and released.
                if (draftSeances === null) return;
                const next = clampRule({ ...escalation, seances: Number(draftSeances) });
                // The clamped string, not null: falling back to the
                // render-time `escalation.seances` here would flash the OLD
                // value until the write resolves and useLiveQuery re-renders.
                // The effect above clears this once the stored value moves.
                setDraftSeances(String(next.seances));
                if (next.seances !== escalation.seances) {
                  void writeEscalation(db, { seances: next.seances });
                }
              }}
            />
          </label>
        </div>

        {/* The rule in a sentence, so two numbers in two boxes cannot be read
            backwards. */}
        <p className="text-sm text-text-faint">
          {escalation.enabled
            ? // MIN_ESCALATION_SEANCES is 1, and "1 séances" is not French —
              // a dedicated key rather than an i18next plural, because
              // `count` is already spent on `yellows` and cannot also drive
              // agreement on `seances`.
              t(escalation.seances === 1 ? "escalation.ruleSingleSeance" : "escalation.rule", {
                yellows: escalation.yellows,
                seances: escalation.seances,
              })
            : t("escalation.ruleOff")}
        </p>
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
                body={t("settings.importConfirmBody")}
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
        {/* Each destructive action carries its OWN sentence. Both erase this
            school, and only the second puts anything back — a single shared
            paragraph over two buttons would leave which is which to the
            labels alone, in the one section where a mis-tap is unrecoverable. */}
        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-muted">{t("settings.wipeHelp")}</p>
          <ConfirmButton
            danger
            className="self-start"
            label={t("settings.wipe")}
            confirmLabel={t("settings.wipeConfirm")}
            body={t("settings.wipeConfirmBody")}
            onConfirm={onWipe}
          />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm text-text-muted">{t("settings.resetHelp")}</p>
          <ConfirmButton
            danger
            className="self-start"
            label={t("settings.reset")}
            confirmLabel={t("settings.resetConfirm")}
            body={t("settings.resetConfirmBody")}
            onConfirm={onReset}
          />
        </div>
      </section>
    </div>
  );
}
