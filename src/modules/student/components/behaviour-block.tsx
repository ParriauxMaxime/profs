import type { Session, Student } from "@db";
import { deleteBehaviourEvent } from "@db/cascade";
import { useDb } from "@db/provider";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "@domain/behaviour";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";

/**
 * The complete behaviour record, and a delete.
 *
 * There is no range control: the counts and the timeline both cover everything.
 * At a December conseil the whole year is the trimestre, and by June a teacher
 * reading a full-year record is reading what actually happened.
 *
 * There is no ADD, either. A `BehaviourEvent` is append-only and belongs to the
 * moment it was observed; a page cannot add an observation to a lesson it was
 * not in. Deleting stays the only correction, as it has always been.
 */
export function BehaviourBlock({ student, sessions }: { student: Student; sessions: Session[] }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const events = useLiveQuery(
    () => db.behaviourEvents.where({ studentId: student.id }).reverse().sortBy("createdAt"),
    [db, student.id],
  );

  if (events === undefined) return null;

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const counts = countByType(events);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-medium text-sm text-text-muted">{t("behaviour.title")}</h3>

      <div className="flex flex-wrap gap-2">
        {BEHAVIOUR_TYPES.map((type) => (
          <div
            key={type}
            className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: BEHAVIOUR_COLORS[type] }}
              />
              {t(`behaviour.${type}`)}
            </span>
            <span className="font-semibold tabular-nums">{counts[type]}</span>
          </div>
        ))}
      </div>

      {events.length === 0 ? (
        <span className="text-sm text-text-faint">{t("behaviour.none")}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {events.map((event) => {
            const session = sessionById.get(event.sessionId);
            return (
              <li
                // Keyed by event id: an armed delete must not survive onto a
                // neighbour when the list reorders under it.
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: BEHAVIOUR_COLORS[event.type] }}
                  />
                  <span className="break-words">
                    {t(`behaviour.${event.type}`)}
                    {session ? ` — ${dateFormatter.format(session.date)}` : ""}
                    {event.comment ? ` — ${event.comment}` : ""}
                  </span>
                </span>
                <ConfirmButton
                  variant="link"
                  danger
                  label={t("common.delete")}
                  confirmLabel={t("behaviour.confirmDelete")}
                  onConfirm={() => deleteBehaviourEvent(db, event.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
