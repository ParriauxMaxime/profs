import type { BehaviourEvent, Session, Student } from "@db";
import { deleteBehaviourEvent } from "@db/cascade";
import { useDb } from "@db/provider";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "@domain/behaviour";
import { groupSeancesByMonth } from "@domain/student-summary";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { useOpenMonth } from "../use-open-month";
import { MonthDisclosure } from "./month-disclosure";

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
 *
 * The timeline is grouped into months and collapsed the way Présence's is,
 * from the same `groupSeancesByMonth` and the same `useOpenMonth`. A year of
 * red cards read as one undifferentiated list, and the two blocks sitting one
 * above the other with different shapes made the page look like two features.
 */
export function BehaviourBlock({ student, sessions }: { student: Student; sessions: Session[] }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  const events = useLiveQuery(
    () => db.behaviourEvents.where({ studentId: student.id }).reverse().sortBy("createdAt"),
    [db, student.id],
  );

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  // `groupSeancesByMonth` groups anything carrying a date and an hour, so an
  // event borrows its séance's. An event whose séance is not in this list —
  // a pupil moved between classes keeps events pointing at the old class's
  // lessons — falls back to when it was RECORDED, which is the only moment
  // this app still knows about it. The block already drew those dateless
  // rather than dropping them, and it still does.
  const dated = (events ?? []).map((event) => {
    const session = sessionById.get(event.sessionId);
    return {
      event,
      session,
      date: session?.date ?? event.createdAt,
      startsAt: session?.startsAt ?? 0,
    };
  });
  const months = groupSeancesByMonth(dated);
  const { openKey, toggle } = useOpenMonth(months);

  if (events === undefined) return null;

  const counts = countByType(events);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
  });

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

      {months.length === 0 ? (
        <span className="text-sm text-text-faint">{t("behaviour.none")}</span>
      ) : (
        <ul className="flex flex-col gap-2">
          {months.map((month) => {
            const isOpen = month.key === openKey;
            const label = monthFormatter.format(new Date(month.year, month.month, 1));
            return (
              <li key={month.key} className="flex flex-col gap-1">
                <MonthDisclosure
                  label={label}
                  count={t("behaviour.monthEvents", { count: month.sessions.length })}
                  open={isOpen}
                  onToggle={() => toggle(month.key)}
                />

                {isOpen && (
                  <ul className="flex flex-col gap-1">
                    {month.sessions.map(({ event, session }) => (
                      <EventRow
                        // Keyed by event id: an armed delete must not survive
                        // onto a neighbour when the list reorders under it.
                        key={event.id}
                        event={event}
                        date={session ? dateFormatter.format(session.date) : null}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EventRow({ event, date }: { event: BehaviourEvent; date: string | null }) {
  const { t } = useTranslation();
  const db = useDb();

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm">
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ background: BEHAVIOUR_COLORS[event.type] }}
        />
        <span className="break-words">
          {t(`behaviour.${event.type}`)}
          {date ? ` — ${date}` : ""}
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
}
