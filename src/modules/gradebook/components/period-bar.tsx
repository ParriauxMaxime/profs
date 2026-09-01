import type { Period } from "@db";
import { deletePeriod } from "@db/cascade";
import { useDb } from "@db/provider";
import { nextPeriodOrder } from "@domain/gradebook/period";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/** Adds a period at the end of the list, or renames an existing one. */
function PeriodForm({
  gradebookId,
  periods,
  period,
  onDone,
}: {
  gradebookId: string;
  periods: Period[];
  period?: Period;
  onDone: (createdId?: string) => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState(period?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("gradebook.periodNameRequired"));
      return;
    }
    setError(null);

    if (period) {
      await db.periods.update(period.id, { name: trimmed });
      onDone();
      return;
    }
    const id = crypto.randomUUID();
    await db.periods.add({ id, gradebookId, name: trimmed, order: nextPeriodOrder(periods) });
    onDone(id);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-border p-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("gradebook.periodName")}</span>
        <input
          className="field"
          value={name}
          placeholder={t("gradebook.periodNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="button" className="btn btn-primary" onClick={() => void save()}>
        {t("common.save")}
      </button>
      <button type="button" className="btn" onClick={() => onDone()}>
        {t("common.cancel")}
      </button>
      {error && (
        <p role="alert" className="w-full text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The period switcher and everything that manages periods.
 *
 * It lives beside the gradebook page rather than inside it: the page is
 * already the largest file in the app, and periods bring their own form,
 * confirm and selection rules.
 */
export function PeriodBar({
  gradebookId,
  periods,
  activePeriodId,
  onSelect,
}: {
  gradebookId: string;
  periods: Period[];
  /** "" when the gradebook has no period at all. */
  activePeriodId: string;
  onSelect: (periodId: string) => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [editing, setEditing] = useState<Period | "new" | null>(null);

  const activePeriod = periods.find((period) => period.id === activePeriodId);

  /**
   * Where to land after deleting the shown period: its neighbour on the left
   * if it has one, otherwise the next one along. Leaving the deleted id
   * selected would show an empty grid for a period that no longer exists.
   */
  function periodAfterDeleting(deletedId: string): string {
    const index = periods.findIndex((period) => period.id === deletedId);
    const fallback = periods[index - 1] ?? periods[index + 1];
    return fallback?.id ?? "";
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {periods.length > 0 && (
          <select
            className="field w-auto"
            aria-label={t("gradebook.period")}
            value={activePeriodId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="btn"
          onClick={() => setEditing("new")}
          disabled={editing === "new"}
        >
          {t("gradebook.addPeriod")}
        </button>

        {activePeriod && (
          <>
            <button type="button" className="btn" onClick={() => setEditing(activePeriod)}>
              {t("gradebook.renamePeriod")}
            </button>
            <ConfirmButton
              // Keyed by period id: the switcher stays live while the button
              // is armed, and without a key React would keep the armed state
              // across a change of period and fire it at the new one.
              key={activePeriod.id}
              danger
              label={t("gradebook.deletePeriod")}
              confirmLabel={t("gradebook.confirmDeletePeriod", { name: activePeriod.name })}
              onConfirm={async () => {
                const next = periodAfterDeleting(activePeriod.id);
                await deletePeriod(db, activePeriod.id);
                setEditing((current) =>
                  current !== "new" && current?.id === activePeriod.id ? null : current,
                );
                onSelect(next);
              }}
            />
          </>
        )}
      </div>

      {editing === "new" && (
        <PeriodForm
          key="new"
          gradebookId={gradebookId}
          periods={periods}
          onDone={(createdId) => {
            setEditing(null);
            // Land on the period that was just created: it is empty, and
            // staying on the old one hides the thing that just happened.
            if (createdId) onSelect(createdId);
          }}
        />
      )}
      {editing !== null && editing !== "new" && (
        // Keyed by period id: the form seeds its state at mount.
        <PeriodForm
          key={editing.id}
          gradebookId={gradebookId}
          periods={periods}
          period={editing}
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}
