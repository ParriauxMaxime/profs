import type { Session } from "@db";
import { deleteSession } from "@db/cascade";
import { useDb } from "@db/provider";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * The session switcher: which lesson attendance and behaviour are being
 * recorded against, plus the only way to remove one.
 *
 * `sessions` is newest first (from `sessionsForClass`). The selection is held
 * by the caller as a session id, never a position — deleting the selected
 * session leaves the id dangling for one render, and the page's effect
 * resolves it back to today's session, not to whatever now occupies that
 * slot in the list.
 */
export function SessionBar({
  sessions,
  selectedSessionId,
  onSelect,
}: {
  sessions: Session[];
  selectedSessionId: string;
  onSelect: (sessionId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  // Date only. A session is stamped with `startOfDay`, so its time is always
  // midnight — rendering it showed every lesson as "à 00:00" and implied a
  // precision the data does not carry. Two lessons on one day are told apart
  // by their order in the list, not by a clock.
  const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  const selected = sessions.find((session) => session.id === selectedSessionId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="field w-auto"
        aria-label={t("plan.session")}
        value={selectedSessionId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatter.format(session.date)}
          </option>
        ))}
      </select>

      {selected && (
        <ConfirmButton
          // Keyed by session id: without this, switching sessions while the
          // button is armed would fire the confirm at the newly selected one.
          key={selected.id}
          variant="link"
          // Deliberately NOT `danger`: that only colours the idle state, and a
          // red link sitting at the top of a screen a teacher uses mid-lesson
          // pulls attention it has no claim on. The armed step is red either
          // way, so the warning arrives when it means something — after the
          // first tap, next to the text naming what is about to go.
          label={t("plan.deleteSession")}
          confirmLabel={t("plan.confirmDeleteSession", {
            date: formatter.format(selected.date),
          })}
          onConfirm={() => deleteSession(db, selected.id)}
        />
      )}
    </div>
  );
}
