import type { Session, Student } from "@db";
import { attendanceKey } from "@db";
import { toggleAttendance } from "@db/attendance";
import { logBehaviour } from "@db/behaviour";
import { deleteBehaviourEvent } from "@db/cascade";
import { useDb } from "@db/provider";
import { setStudentNotes, setStudentPhoto } from "@db/students";
import { ATTENDANCE_VALUES, type AttendanceValue } from "@domain/attendance";
import {
  BEHAVIOUR_COLORS,
  BEHAVIOUR_TEXT_COLORS,
  BEHAVIOUR_TYPES,
  type BehaviourType,
} from "@domain/behaviour";
import type { StudentListParams } from "@domain/student-list";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ConfirmButton } from "../../design-system/components/confirm-button";
import { PhotoInput } from "../../design-system/components/photo-input";
import { PupilName } from "../../design-system/components/pupil-name";

/**
 * The live-entry surface: opened from a seat or from a roster row, closed by
 * the teacher, one pupil at a time. Takes `key={student.id}` from its caller so
 * switching pupils resets every piece of local draft state (the notes textarea
 * and the behaviour comment input) rather than carrying it onto the next child.
 *
 * Attendance and behaviour belong to a **séance** — a lesson on a date — so
 * without one the card shows the pupil's notes and a link to their page and
 * nothing else. Recording an absence against no lesson is exactly the second
 * attendance path phase 2A refused to create.
 *
 * `onRecord` is what lets the register appear before the séance row exists.
 * The class page knows which lesson is on screen; the row is written by the
 * FIRST mark, not by opening the page, so every write here awaits `onRecord`
 * and uses the id it returns rather than trusting `session` from this render.
 * `session` still supplies the reads: with no row there is nothing recorded
 * yet, which is exactly what the empty state shows.
 */
export function StudentCard({
  student,
  session,
  onRecord,
  onClose,
  onMove,
  onUnseat,
  listParams,
}: {
  student: Student;
  session?: Session | null;
  /** Creates the séance on demand. Its presence is what offers the register. */
  onRecord?: () => Promise<string>;
  onClose: () => void;
  /** Only the seating plan can pick a pupil back up. */
  onMove?: () => void;
  /** Only offered when they actually hold a place. */
  onUnseat?: () => void;
  /**
   * The list the pupil page's `‹ ›` arrows should walk, when this card was
   * opened from one. Absent on the seating plan, which is not a list.
   */
  listParams?: StudentListParams;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [notes, setNotes] = useState(student.notes ?? "");
  const [comment, setComment] = useState("");
  // Another surface (the class page's own draft) can write `student.notes`
  // while this card sits open on the same pupil — dexie-react-hooks keeps
  // both live. Re-sync from the prop whenever it changes, but only while the
  // field isn't focused: otherwise an incoming update would stomp on
  // whatever the teacher is currently typing here.
  const notesFocused = useRef(false);
  useEffect(() => {
    if (!notesFocused.current) setNotes(student.notes ?? "");
  }, [student.notes]);

  const attendance = useLiveQuery(
    async () =>
      session ? ((await db.attendance.get(attendanceKey(session.id, student.id))) ?? null) : null,
    [db, session?.id, student.id],
  );
  const events = useLiveQuery(
    () =>
      session
        ? db.behaviourEvents
            .where({ sessionId: session.id, studentId: student.id })
            .reverse()
            .sortBy("createdAt")
        : [],
    [db, session?.id, student.id],
  );

  // The séance this card records against, created if the teacher is the first
  // to touch this lesson. Null when there is no lesson at all — the roster,
  // where attendance has deliberately no path.
  const record: (() => Promise<string>) | null =
    onRecord ?? (session ? () => Promise.resolve(session.id) : null);

  // Tapping the value already recorded clears it. `toggleAttendance` re-reads
  // inside its transaction rather than trusting `attendance` from this render.
  const setAttendance = async (value: AttendanceValue): Promise<void> => {
    if (record === null) return;
    await toggleAttendance(db, await record(), student.id, value);
  };

  const addBehaviour = async (type: BehaviourType): Promise<void> => {
    if (record === null) return;
    await logBehaviour(db, {
      sessionId: await record(),
      studentId: student.id,
      classId: student.classId,
      type,
      comment,
    });
    setComment("");
  };

  return (
    <div className="paper flex flex-col gap-4 rounded-md border border-border p-4">
      {/* Wrapping, at every level: the card lives in a 320px column (`lg:w-80`
          on the class page) and this row carries an avatar, a photo control, a
          name and Fermer. Without it they shrink past their contents and draw
          over each other — the surname landed on top of the photo button.
          `min-w-0` on the name column is what lets the surname wrap instead of
          setting the column's floor to its own width. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <PhotoInput
            value={student.photo}
            onChange={(photo) => void setStudentPhoto(db, student.id, photo ?? null)}
          />
          <div className="flex min-w-0 flex-col">
            <span className="break-words font-semibold text-lg">
              <PupilName student={student} />
            </span>
            <Link
              to={Router.Student({ studentId: student.id, ...listParams })}
              className="text-accent text-sm"
            >
              {t("student.timeline")}
            </Link>
          </div>
        </div>
        {/* `shrink-0`, and the row itself does NOT wrap: Fermer stays where a
            teacher reaches for it — top right of the card — while everything
            to its left wraps within what is left of the column. */}
        <button type="button" className="btn shrink-0" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>

      {/* Above the register, and the larger of the two.
          Moving a pupil mid-lesson — Adam is chatting, put him at the front —
          is frequent and has NO other path: a tap on a pupil opens this card,
          always, so the card is where the move has to start. `Retirer de sa
          place` is what the old `↩` on a seat tile was, and reads as an action
          on a person rather than as a symbol on a case. */}
      {(onMove || onUnseat) && (
        <div className="flex flex-col gap-2">
          {onMove && (
            <button type="button" className="btn btn-primary w-full" onClick={onMove}>
              {t("plan.movePupil")}
            </button>
          )}
          {onUnseat && (
            <button type="button" className="btn w-full" onClick={onUnseat}>
              {t("plan.unseat")}
            </button>
          )}
        </div>
      )}

      {record !== null ? (
        <>
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
                    // `min-w-28`, not `min-w-11`: `flex-1` is `flex: 1 1 0%`
                    // and a min-width REPLACES the `min-width: auto` that
                    // stops a flex item shrinking below its content, so the
                    // 44px tap floor also let four buttons squeeze to ~72px
                    // in a 320px panel while "Encouragement" — one unbroken
                    // token, unwrappable — ran straight out of its button.
                    // A label-sized minimum makes flex-wrap do its job: two
                    // per row, each then grown by flex-1. `break-words` is
                    // the backstop for a longer label in another locale.
                    className={`min-h-11 min-w-28 flex-1 break-words rounded-md border px-3 py-2 font-medium text-sm ${
                      selected
                        ? "border-accent bg-accent text-white"
                        : "border-border bg-bg text-text"
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
                  // Same minimum as the attendance row above, for the same
                  // reason — these are the labels that actually overflowed.
                  className="min-h-11 min-w-28 flex-1 break-words rounded-md border border-border px-3 py-2 font-medium text-sm text-white"
                  style={{ background: BEHAVIOUR_COLORS[type], color: BEHAVIOUR_TEXT_COLORS[type] }}
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
                      onConfirm={() => deleteBehaviourEvent(db, event.id)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        // No lesson at all — say why the register is not here, rather than
        // leaving a gap the teacher reads as a missing feature.
        <p className="text-sm text-text-faint">{t("attendance.needsSession")}</p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea
          className="field"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onFocus={() => {
            notesFocused.current = true;
          }}
          onBlur={() => {
            notesFocused.current = false;
            if (notes !== (student.notes ?? "")) {
              void setStudentNotes(db, student.id, notes);
            }
          }}
        />
        <span className="text-text-faint text-xs">{t("student.notesHint")}</span>
      </label>
    </div>
  );
}
