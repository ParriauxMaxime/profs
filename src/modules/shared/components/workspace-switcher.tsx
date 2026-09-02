import { setActiveWorkspaceId, useActiveWorkspaceId, useWorkspaces } from "@domain/workspaces";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

/**
 * The établissement switcher at the top of the drawer.
 *
 * Switching writes the active id and nothing else: `DbProvider` reads it
 * through `useSyncExternalStore`, opens `profs-<id>`, and every page's
 * `useLiveQuery` takes `db` in its deps, so the whole app re-reads from the
 * new database without a reload.
 *
 * It collapses to a plain line of text when there is only one école — a
 * switcher with nothing to switch to is a control that does nothing, and this
 * sits above the navigation a teacher uses every lesson.
 */
export function WorkspaceSwitcher({ onSwitch }: { onSwitch: () => void }) {
  const { t } = useTranslation();
  const workspaces = useWorkspaces();
  const activeId = useActiveWorkspaceId();
  const [expanded, setExpanded] = useState(false);

  const active = workspaces.find((workspace) => workspace.id === activeId);
  if (!active) return null;

  const others = workspaces.filter((workspace) => workspace.id !== activeId);

  return (
    <div className="mb-2 flex flex-col gap-1 border-border border-b pb-2">
      {others.length === 0 ? (
        <div className="px-3 py-2">
          <div className="font-medium text-sm">{active.name}</div>
          <div className="text-text-muted text-xs">{active.year}</div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flex items-center justify-between gap-2 rounded px-3 py-2 text-left hover:bg-bg-hover"
            // The name is in the button's text already; the label prefixes it
            // with what the control does, since a school name alone does not
            // say "this opens a list of the others".
            aria-label={`${t("workspace.switch")} — ${active.name} ${active.year}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>
              <span className="block font-medium text-sm">{active.name}</span>
              <span className="block text-text-muted text-xs">{active.year}</span>
            </span>
            <span aria-hidden="true" className="text-text-muted">
              {expanded ? "▲" : "▼"}
            </span>
          </button>

          {expanded &&
            others.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className="rounded px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-hover hover:text-text"
                onClick={() => {
                  setActiveWorkspaceId(workspace.id);
                  setExpanded(false);
                  // Back to Aujourd'hui before the new database opens: a
                  // route carrying a :classId or :gradebookId from the school
                  // just left resolves to nothing in the one arriving, and
                  // the teacher lands on an empty page that looks broken.
                  Router.push("Home");
                  onSwitch();
                }}
              >
                <span className="block">{workspace.name}</span>
                <span className="block text-text-faint text-xs">{workspace.year}</span>
              </button>
            ))}
        </>
      )}
    </div>
  );
}
