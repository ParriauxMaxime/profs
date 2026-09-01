import type { BehaviourEvent, Session, Student } from "@db";
import { attendanceKey } from "@db";
import { useDb } from "@db/provider";
import { ATTENDANCE_VALUES, type AttendanceValue } from "@domain/attendance";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TYPES, type BehaviourType } from "@domain/behaviour";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { PhotoInput } from "../../design-system/components/photo-input";

/**
 * The live-entry surface: opened from a seat, closed by the teacher, one
 * pupil at a time. Takes `key={student.id}` from its caller so switching
 * pupils resets every piece of local draft state (the notes textarea and the
 * behaviour comment input) rather than carrying it onto the next child.
 */
export function StudentCard({
  student,
  session,
  onClose,
}: {
  student: Student;
  session: Session;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [notes, setNotes] = useState(student.notes ?? "");
  const [comment, setComment] = useState("");

  const attendance = useLiveQuery(
    async () => (await db.attendance.get(attendanceKey(session.id, student.id))) ?? null,
    [db, session.id, student.id],
  );
  const events = useLiveQuery(
    () =>
      db.behaviourEvents
        .where({ sessionId: session.id, studentId: student.id })
        .reverse()
        .sortBy("createdAt"),
    [db, session.id, student.id],
  );

  const setAttendance = async (value: AttendanceValue): Promise<void> => {
    if (attendance?.value === value) {
      await db.attendance.delete(attendanceKey(session.id, student.id));
      return;
    }
    await db.attendance.put({
      sessionId: session.id,
      studentId: student.id,
      value,
      updatedAt: Date.now(),
    });
  };

  const addBehaviour = async (type: BehaviourType): Promise<void> => {
    const trimmed = comment.trim();
    const event: BehaviourEvent = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      studentId: student.id,
      classId: student.classId,
      type,
      ...(trimmed ? { comment: trimmed } : {}),
      createdAt: Date.now(),
    };
    await db.behaviourEvents.add(event);
    setComment("");
  };

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PhotoInput
            value={student.photo}
            onChange={(photo) =>
              void db.students.update(student.id, {
                photo: photo ?? undefined,
                updatedAt: Date.now(),
              })
            }
          />
          <div className="flex flex-col">
            <span className="font-semibold text-lg">
              {student.firstName} {student.lastName}
            </span>
            <Link to={Router.Student({ studentId: student.id })} className="text-accent text-sm">
              {t("student.timeline")}
            </Link>
          </div>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-text-muted">{t("attendance.title")}</span>
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE_VALUES.map((value) => {
            const selected = attendance?.value === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                className={`min-h-11 min-w-11 flex-1 rounded-md border px-3 py-2 font-medium text-sm ${
                  selected ? "border-accent bg-accent text-white" : "border-border bg-bg text-text"
                }`}
                onClick={() => void setAttendance(value)}
              >
                {t(`attendance.${value}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-medium text-sm text-text-muted">{t("behaviour.title")}</span>
        <div className="flex flex-wrap gap-2">
          {BEHAVIOUR_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="min-h-11 min-w-11 flex-1 rounded-md border border-border px-3 py-2 font-medium text-sm text-white"
              style={{ background: BEHAVIOUR_COLORS[type] }}
              onClick={() => void addBehaviour(type)}
            >
              {t(`behaviour.${type}`)}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="field"
          placeholder={t("behaviour.comment")}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          {events === undefined || events.length === 0 ? (
            <span className="text-sm text-text-faint">{t("behaviour.none")}</span>
          ) : (
            events.map((event) => (
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
                  {event.comment ? ` — ${event.comment}` : ""}
                </span>
                <ConfirmButton
                  variant="link"
                  danger
                  label={t("common.delete")}
                  confirmLabel={t("behaviour.confirmDelete")}
                  onConfirm={() => db.behaviourEvents.delete(event.id)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea
          className="field"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (student.notes ?? "")) {
              void db.students.update(student.id, { notes, updatedAt: Date.now() });
            }
          }}
        />
        <span className="text-text-faint text-xs">{t("student.notesHint")}</span>
      </label>
    </div>
  );
}
