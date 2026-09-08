import { deleteWorkspaceDb } from "@db/workspace";
import { classifyOpenFailure, offersDiscard } from "@domain/recovery";
import { activeWorkspaceId, listWorkspaces } from "@domain/workspaces";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../design-system/components/confirm-button";

/**
 * The panel a teacher lands on when the database will not open.
 *
 * This is a second, smaller shell rather than a route, and it has to be: it
 * renders without `DbProvider`, without the router, and without a single
 * `useLiveQuery`, because the thing all three depend on is the thing that just
 * failed. It reads the workspace registry, which lives in `localStorage` and
 * needs no database, so it can still name the school it is talking about.
 *
 * It does not attempt an export first. An export needs the database open, and
 * a partial dump from a half-open database is worse than none — it would look
 * like a backup and restore short.
 */
export function RecoveryShell({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const kind = classifyOpenFailure(error);

  // The registry is localStorage, so it survives whatever happened to IndexedDB.
  // If it is somehow unreadable too, the discard has nothing to act on and only
  // the reload is offered.
  const activeId = activeWorkspaceId();
  const workspaces = listWorkspaces();
  const active = workspaces.find((w) => w.id === activeId) ?? null;
  const others = workspaces.filter((w) => w.id !== activeId);

  const canDiscard = offersDiscard(kind) && active !== null;

  const discard = async (): Promise<void> => {
    if (active === null) return;
    await deleteWorkspaceDb(active.id);
    // The registry entry deliberately stays. The workspace comes back on the
    // next boot with its name and year intact and no data — which is what
    // "disposable, not migrated" was always supposed to mean. Removing the
    // entry as well would turn a recoverable schema into a lost school.
    window.location.reload();
  };

  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  return (
    <main className="mx-auto flex min-h-screen max-w-prose flex-col justify-center gap-4 p-6">
      <div className="paper flex flex-col gap-4 p-6">
        <h1 className="text-2xl font-bold">{t("recovery.title")}</h1>

        <p className="text-text-muted">{t(`recovery.${kind}.body`)}</p>

        {active !== null && (
          <p className="text-sm">
            {t("recovery.workspace")} <strong>{active.name}</strong>{" "}
            <span className="text-text-muted">{active.year}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {t("recovery.reload")}
          </button>

          {canDiscard && (
            <ConfirmButton
              danger
              label={t("recovery.discard")}
              confirmLabel={t("recovery.discardConfirm", { name: active.name })}
              body={t("recovery.discardConfirmBody")}
              onConfirm={discard}
            />
          )}
        </div>

        {canDiscard && others.length > 0 && (
          <p className="text-sm text-text-muted">
            {t("recovery.othersSafe", { count: others.length })}
          </p>
        )}

        <details className="text-sm text-text-muted">
          <summary className="cursor-pointer">{t("recovery.details")}</summary>
          <pre className="tabular mt-2 overflow-x-auto whitespace-pre-wrap break-words">
            {detail}
          </pre>
        </details>
      </div>
    </main>
  );
}
