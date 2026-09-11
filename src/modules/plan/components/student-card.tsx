import type { Session, Student } from "@db";
import { attendanceKey } from "@db";
import { toggleAttendance } from "@db/attendance";
import { logBehaviour } from "@db/behaviour";
import { deleteBehaviourEvent } from "@db/cascade";
import { evaluateEscalation } from "@db/escalation";
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
import { useAnnounceRedCard } from "../../shared/components/escalation-provider";
import { useEscalationRule } from "../../shared/use-escalation-rule";

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
   * The list the pupil page's `‹ ›` arrows should walk.
   *
   * Absent from a seat on the plan, where there is no list on screen — the
   * link then names the pupil's own CLASS, which is what the teacher is
   * actually looking at. Empty params would not do: they mean "every pupil in
   * the workspace", which is right for an unfiltered /students and wrong here.
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

  const rule = useEscalationRule();
  const announce = useAnnounceRedCard();

  /**
   * Where this pupil stands against the rule, for the lesson on screen.
   *
   * A live query, so deleting one of the yellows below re-reads it and the
   * line goes away — which is the whole reason the red is derived rather than
   * written. The rule's three fields are in the dependency array
   * individually, naming the exact values this read depends on, so an
   * unrelated re-render cannot re-run it and a future change to the hook's
   * identity cannot either.
   */
  const standing = useLiveQuery(async () => {
    if (!session || !rule.enabled) return null;
    return evaluateEscalation(db, {
      classId: student.classId,
      studentId: student.id,
      sessionId: session.id,
      rule,
    });
  }, [db, session?.id, student.id, student.classId, rule.enabled, rule.seances, rule.yellows]);

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
    const sessionId = await record();
    await logBehaviour(db, {
      sessionId,
      studentId: student.id,
      classId: student.classId,
      type,
      comment,
    });
    setComment("");
    // Read AFTER the write, and against `sessionId` rather than `session` from
    // this render — the séance may have been brought into being by the line
    // above. No "crossing" test: the rule keeps firing as the window slides,
    // so a third yellow over a still-qualifying window announces again.
    if (type === "yellow" && rule.enabled) {
      const { escalated } = await evaluateEscalation(db, {
        classId: student.classId,
        studentId: student.id,
        sessionId,
        rule,
      });
      if (escalated) announce(student);
    }
  };

  return (
    <div className="paper flex flex-col gap-4 rounded-md border border-border p-4">
      {/* The card lives in a 320px column (`lg:w-80` on the class page), so
          this row is tight: an avatar, a name and Fermer. `min-w-0` on the
          name column is what lets a long surname wrap rather than setting the
          column's floor to its own width — without it the name shrank past its
          contents and drew over the avatar. The photo control that used to sit
          between them is the avatar itself now. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PhotoInput
            value={student.photo}
            onChange={(photo) => void setStudentPhoto(db, student.id, photo ?? null)}
          />
          {/* The name IS the way to the pupil's page — the same door
              `/students` puts on its surname cell, and for the same reason: a
              title that names a destination should be the link to it, rather
              than sit above a second smaller one repeating the identity it
              already carries. It keeps the heading's weight and colour and
              takes its affordance from the hover, so the card's hierarchy is
              the name, then Déplacer, then the register — which is the order a
              teacher reads it in. `Historique` is gone with the duplication,
              and `student.timeline` with it — this was its only caller.

              The underline is PERMANENT, not a hover state. This app is used
              on a tablet mid-lesson, where there is no hover at all, so a
              heading whose only link signal appears under a mouse is a heading
              that reads as plain text to everyone actually using it. The ink
              stays the text colour and the accent goes into the underline:
              filled accent on this card means *Déplacer*, the action, and a
              blue title would spend that meaning on something that is merely a
              destination. */}
          <Link
            to={Router.Student({
              studentId: student.id,
              ...(listParams ?? { classe: student.classId }),
            })}
            className="min-w-0 break-words font-semibold text-lg underline decoration-2 decoration-accent/50 underline-offset-4 hover:decoration-accent"
          >
            <PupilName student={student} />
          </Link>
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
            {/* The only place the rule explains itself in words, which is what
                lets the seat tile stay silent. Hidden at zero: a teacher who
                has handed in nothing does not need telling so. */}
            {standing && standing.yellows.length > 0 && (
              <p
                className={standing.escalated ? "font-semibold text-sm" : "text-sm text-text-muted"}
                style={standing.escalated ? { color: "var(--behaviour-red)" } : undefined}
              >
                {/* "1 séances" is not French, and `count` is already spent
                    on the yellow count — a dedicated key for a one-séance
                    window rather than an i18next plural on `seances` too. */}
                {t(
                  rule.seances === 1
                    ? "escalation.windowCountSingleSeance"
                    : "escalation.windowCount",
                  { count: standing.yellows.length, seances: rule.seances },
                )}
                {standing.escalated ? ` — ${t("escalation.redCard")}` : ""}
              </p>
            )}
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
