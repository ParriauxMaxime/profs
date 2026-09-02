import { deleteWorkspaceDb } from "@db/workspace";
import {
  createWorkspace,
  currentSchoolYear,
  DEFAULT_WORKSPACE_NAME,
  removeWorkspace,
  setActiveWorkspaceId,
  useActiveWorkspaceId,
  useWorkspaces,
  type Workspace,
} from "@domain/workspaces";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { WorkspaceForm } from "./workspace-form";

/**
 * Manage the list of établissements: create, rename, delete.
 *
 * Switching lives in the drawer instead — a teacher changes school far more
 * often than they create one, and the drawer is the control already under
 * their thumb. This section is the rarer, heavier half.
 */
export function WorkspaceSection() {
  const { t } = useTranslation();
  const workspaces = useWorkspaces();
  const activeId = useActiveWorkspaceId();
  const [editing, setEditing] = useState<Workspace | "new" | null>(null);

  async function onDelete(workspace: Workspace): Promise<void> {
    // A replacement is created BEFORE the last workspace goes, never after:
    // for the instant between, `activeWorkspaceId()` would be null and the
    // provider that opens the database has nothing to open. Boot's
    // `ensureDefaultWorkspace` cannot cover that gap — it only runs at boot.
    if (workspaces.length === 1) {
      const replacement = createWorkspace(DEFAULT_WORKSPACE_NAME, currentSchoolYear());
      setActiveWorkspaceId(replacement.id);
    }

    setEditing((current) => (current !== "new" && current?.id === workspace.id ? null : current));
    removeWorkspace(workspace.id);

    // The registry entry going is not the deletion `PRIVACY.md` promises: the
    // pupils' names would still be in IndexedDB under `profs-<id>`, invisible
    // and unreachable. Deleting the database is the deletion.
    //
    // The connection may still be open when the workspace being deleted is
    // the one on screen. Dexie's default `versionchange` handler closes it,
    // so this resolves rather than blocking.
    await deleteWorkspaceDb(workspace.id);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("workspace.title")}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          {t("workspace.add")}
        </button>
      </div>
      <p className="text-sm text-text-muted">{t("workspace.help")}</p>

      {editing === "new" && <WorkspaceForm key="new" onDone={() => setEditing(null)} />}
      {editing !== null && editing !== "new" && (
        // Keyed by workspace id: the form seeds its fields at mount, so
        // switching which école is being renamed has to remount it, or one
        // school's name is saved onto another.
        <WorkspaceForm key={editing.id} workspace={editing} onDone={() => setEditing(null)} />
      )}

      <ul className="flex flex-col gap-2">
        {workspaces.map((workspace) => (
          <li
            key={workspace.id}
            className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2 text-sm"
          >
            <span className="grow font-medium">{workspace.name}</span>
            <span className="text-text-muted">{workspace.year}</span>
            {workspace.id === activeId && (
              <span className="rounded bg-bg-hover px-2 py-0.5 text-text-muted text-xs">
                {t("workspace.active")}
              </span>
            )}
            <button
              type="button"
              className="text-text-muted hover:text-accent"
              onClick={() => setEditing(workspace)}
            >
              {t("common.edit")}
            </button>
            <ConfirmButton
              danger
              variant="link"
              label={t("common.delete")}
              confirmLabel={t("workspace.confirmDelete")}
              // The armed state is anchored by the <li> key being the
              // workspace id: deleting or renaming another school while this
              // one is armed must not retarget the delete onto whoever ends
              // up at that index.
              onConfirm={() => onDelete(workspace)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
