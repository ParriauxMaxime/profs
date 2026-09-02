import { deleteBehaviourEvent } from "@db/cascade";
import { useDb } from "@db/provider";
import { sessionsForClass } from "@db/sessions";
import { ATTENDANCE_VALUES } from "@domain/attendance";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, countByType } from "@domain/behaviour";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { PupilName } from "../design-system/components/pupil-name";

export function StudentPage({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();

  // An explicit null distinguishes "no such pupil" from "still loading":
  // useLiveQuery gives undefined for both, and the page would otherwise sit
  // on "Chargement…" forever for a pupil who has been deleted.
  const student = useLiveQuery(
    async () => (await db.students.get(studentId)) ?? null,
    [db, studentId],
  );

  const schoolClass = useLiveQuery(
    async () => (student ? ((await db.classes.get(student.classId)) ?? null) : null),
    [db, student],
  );

  const sessions = useLiveQuery(
    async () => (student ? await sessionsForClass(db, student.classId) : []),
    [db, student],
  );

  const events = useLiveQuery(
    () => db.behaviourEvents.where({ studentId }).reverse().sortBy("createdAt"),
    [db, studentId],
  );

  const attendanceRecords = useLiveQuery(
    () => db.attendance.where({ studentId }).toArray(),
    [db, studentId],
  );

  if (
    student === undefined ||
    sessions === undefined ||
    events === undefined ||
    attendanceRecords === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (student === null) {
    return <p className="text-text-muted">{t("student.notFound")}</p>;
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const counts = countByType(events);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });

  const attendanceCounts = Object.fromEntries(
    ATTENDANCE_VALUES.map((value) => [
      value,
      attendanceRecords.filter((record) => record.value === value).length,
    ]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {student.photo ? (
          <PhotoPreview photo={student.photo} />
        ) : (
          <div className="h-16 w-16 rounded-full bg-bg-subtle" />
        )}
        <div className="flex flex-col">
          <span className="font-semibold text-lg">
            <PupilName student={student} />
          </span>
          {schoolClass && (
            <Link to={Router.Class({ classId: schoolClass.id })} className="text-accent text-sm">
              {schoolClass.name}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-text-muted">{t("behaviour.title")}</span>
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
              <span className="font-semibold">{counts[type]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-text-muted">
          {t("student.attendanceSummary")}
        </span>
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE_VALUES.map((value) => (
            <div
              key={value}
              className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{t(`attendance.${value}`)}</span>
              <span className="font-semibold">{attendanceCounts[value]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-text-muted">{t("student.timeline")}</span>
        {events.length === 0 ? (
          <span className="text-sm text-text-faint">{t("behaviour.none")}</span>
        ) : (
          <div className="flex flex-col gap-1">
            {events.map((event) => {
              const session = sessionById.get(event.sessionId);
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: BEHAVIOUR_COLORS[event.type] }}
                    />
                    {t(`behaviour.${event.type}`)}
                    {session ? ` — ${dateFormatter.format(session.date)}` : ""}
                    {event.comment ? ` — ${event.comment}` : ""}
                  </span>
                  <ConfirmButton
                    variant="link"
                    danger
                    label={t("common.delete")}
                    confirmLabel={t("behaviour.confirmDelete")}
                    onConfirm={() => deleteBehaviourEvent(db, event.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A pupil's stored photo, rendered from an object URL created for the
 * lifetime of this component only and revoked on unmount or when the photo
 * changes.
 */
function PhotoPreview({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(photo);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);

  if (!url) return <div className="h-16 w-16 rounded-full bg-bg-subtle" />;

  return (
    <img src={url} alt="" className="h-16 w-16 rounded-full object-cover" width={64} height={64} />
  );
}
