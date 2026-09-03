import type { GroupMember, Student } from "@db";
import { useDb } from "@db/provider";
import { addTable, getOrCreateLayout, moveTable, seatStudent, swapSeats } from "@db/seating";
import { createSession, getOrCreateTodaySession, sessionsForClass, startOfDay } from "@db/sessions";
import { filterByGroup } from "@domain/group";
import {
  type Held,
  type Position,
  resolveDrop,
  resolveFloorDrop,
  unseatedStudentIds,
} from "@domain/room";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../shared/use-escape";
import { RoomTemplateForm } from "./components/room-template-form";
import { RoomView } from "./components/room-view";
import { SessionBar } from "./components/session-bar";
import { StudentCard } from "./components/student-card";
import { StudentRail } from "./components/student-rail";

/**
 * The seating plan, rendered as the class hub's first tab.
 *
 * The pupils, the groups and the two shared selections come from the shell:
 * the group filter and the selected session are the class's, not this view's,
 * so that filtering the roster and opening the plan agree. What stays local is
 * this view's own gesture — who is held in the hand, whether the room is being
 * resized, whose card is open.
 */
export function PlanPage({
  classId,
  students,
  memberships,
  selectedGroupId,
  selectedSessionId,
  onSelectSession,
}: {
  classId: string;
  students: Student[];
  memberships: GroupMember[];
  selectedGroupId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  // Who is in the teacher's hand: a pupil id from the rail, or a table's id.
  // Never a list index and never a coordinate — the rail reorders on every
  // placement, and a table can be moved out from under a coordinate.
  const [held, setHeld] = useState<Held | null>(null);
  const [resizing, setResizing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // True once the teacher has picked a session themselves (the switcher, or
  // "Nouvelle séance"). While false, the selection is only ever today's
  // session, kept in sync with the calendar — see the focus listener below.
  // Local: it describes this view's gesture, not a selection another tab needs.
  const [manualSelection, setManualSelection] = useState(false);

  const selectSession = useCallback(
    (sessionId: string, manual: boolean): void => {
      onSelectSession(sessionId);
      setManualSelection(manual);
    },
    [onSelectSession],
  );

  const releaseHeld = useCallback(() => setHeld(null), []);
  useEscape(releaseHeld);
  // True while a drop is being written. A ref, not state: it must be readable
  // by the very next click handler, before any re-render.
  const dropping = useRef(false);

  const sessions = useLiveQuery(() => sessionsForClass(db, classId), [db, classId]);

  // A tablet that sleeps on this page overnight must not go on recording
  // attendance against yesterday's session once it wakes: re-check on focus,
  // not just at mount.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    function onFocus(): void {
      setRefreshTick((n) => n + 1);
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Resolves the selection to today's session: on first mount
  // (selectedSessionId is still null), if the selected session vanished —
  // deleted by this tab's own ConfirmButton, or by another tab — or, for an
  // automatic (non-manual) selection, whenever the calendar date has moved
  // on since it was picked. A manual pick of a past session is left alone.
  // `getOrCreateTodaySession` re-checks inside a transaction, so this is
  // idempotent under StrictMode's double-invoked effects.
  useEffect(() => {
    // `refreshTick` carries no value of its own — touching it here is what
    // makes a focus/visibility event force this staleness check to re-run
    // even though nothing else changed.
    void refreshTick;
    if (sessions === undefined) return;
    const current = sessions.find((s) => s.id === selectedSessionId);
    const stale =
      current !== undefined && !manualSelection && current.date !== startOfDay(Date.now());
    if (selectedSessionId !== null && current !== undefined && !stale) return;
    let cancelled = false;
    void getOrCreateTodaySession(db, classId).then((s) => {
      if (!cancelled) selectSession(s.id, false);
    });
    return () => {
      cancelled = true;
    };
  }, [db, classId, sessions, selectedSessionId, manualSelection, refreshTick, selectSession]);

  const session = sessions?.find((s) => s.id === selectedSessionId) ?? null;

  const layout = useLiveQuery(
    async () => (await db.seatingLayouts.where("classId").equals(classId).first()) ?? null,
    [db, classId],
  );
  const seats = useLiveQuery(
    async () => (layout ? await db.seats.where("layoutId").equals(layout.id).toArray() : []),
    [db, layout?.id],
  );
  // A class gets its room the first time someone looks at it. Creating it in
  // an effect rather than in the live query keeps the query a pure read;
  // `getOrCreateLayout` re-checks inside its transaction, so StrictMode's
  // double-invoked effect cannot produce two rooms for one class.
  useEffect(() => {
    if (layout !== null) return;
    void getOrCreateLayout(db, classId);
  }, [db, classId, layout]);

  // Half-tile precision by keyboard. Tapping the floor is whole-tile only, so
  // without this the odd coordinates an arc uses would be unreachable to
  // anyone not using a pointer — and unreachable to everyone for fine
  // adjustment. `moveTable` already refuses a nudge that would overlap or
  // leave the room, so a key held down against the wall writes nothing.
  // Enter is deliberately not bound: the move has already been written by the
  // time the key is released, so committing is releasing, and `useEscape`
  // already clears the hold.
  useEffect(() => {
    if (held?.kind !== "table" || seats === undefined) return;
    const heldSeatId = held.seatId;
    const currentSeats = seats;
    const deltas: Record<string, Position> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    function onKeyDown(event: KeyboardEvent): void {
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const seat = currentSeats.find((s) => s.id === heldSeatId);
      if (!seat) return;
      void moveTable(db, seat.id, { x: seat.x + delta.x, y: seat.y + delta.y });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [db, held, seats]);

  // The class, its pupils and its groups are the shell's — only this tab's own
  // reads can still be loading here.
  if (layout === undefined || seats === undefined || sessions === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (layout === null) return <p className="text-text-muted">{t("common.loading")}</p>;

  const unseated = unseatedStudentIds(students, seats);
  const byId = new Map(students.map((s) => [s.id, s]));
  const unseatedStudents = unseated.map((id) => byId.get(id)).filter((s) => s !== undefined);
  const visibleUnseated = filterByGroup(unseatedStudents, memberships, selectedGroupId);

  const onDropSeat = async (seatId: string): Promise<void> => {
    if (held === null) return;
    // One drop per hold. `setHeld(null)` only lands after the await, and a
    // second tap runs a closure that already captured the old `held` — so
    // holding table A and tapping B then C would write both swaps, moving a
    // pupil the teacher never touched. Clearing the state earlier cannot fix
    // that; only a ref read at call time can.
    if (dropping.current) return;
    dropping.current = true;
    try {
      const action = resolveDrop(
        held,
        seats.find((s) => s.id === seatId),
      );
      if (action.kind === "seat") {
        await seatStudent(db, action.seatId, action.studentId);
      } else if (action.kind === "swap") {
        // No `expectedStudentId` guard: a table has an id now, so the id is
        // the guard. A table another tab removed simply fails the read.
        await swapSeats(db, action.fromSeatId, action.toSeatId);
      }
    } catch (error) {
      // No blocking dialog here — they are banned. A failed write must still
      // end the gesture rather than stranding a pupil in the teacher's hand;
      // the live query re-renders the room as it actually is.
      console.error(error);
    } finally {
      setHeld(null);
      dropping.current = false;
    }
  };

  // Bare floor has two meanings, and `RoomView` reports only "tapped here" —
  // this is where the gesture grammar decides which one applies, beside
  // `resolveFloorDrop`. Nothing held: the floor button is a separate control
  // that adds a table outright. A table held: it is an ordinary drop, and
  // `resolveFloorDrop` turns it into a move. A refused placement (too close
  // to a neighbour, or off the edge) is an ordinary outcome, not an error.
  const onDropFloor = async (at: Position): Promise<void> => {
    if (dropping.current) return;
    dropping.current = true;
    try {
      if (held === null) {
        await addTable(db, layout.id, at);
        return;
      }
      const action = resolveFloorDrop(held, at);
      if (action.kind === "moveTable") await moveTable(db, action.seatId, action.to);
    } catch (error) {
      console.error(error);
    } finally {
      setHeld(null);
      dropping.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* No class name here: the hub's header carries it, and repeating it
            above every tab would push the room further down the screen. */}
        <div className="flex flex-col gap-1">
          {selectedSessionId !== null && (
            <SessionBar
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelect={(id) => selectSession(id, true)}
            />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => void createSession(db, classId).then((s) => selectSession(s.id, true))}
          >
            {t("plan.newSession")}
          </button>
          <button
            type="button"
            className={resizing ? "btn btn-primary" : "btn"}
            aria-pressed={resizing}
            onClick={() => {
              // Leaving edit mode releases: a held pupil is a live gesture and
              // must not survive a mode change, exactly as the armed seat did not.
              setHeld(null);
              setResizing((v) => !v);
            }}
          >
            {resizing ? t("plan.doneEditing") : t("plan.editLayout")}
          </button>
        </div>
      </div>

      {resizing && (
        <RoomTemplateForm
          key={layout.id}
          layout={layout}
          seats={seats}
          onDone={() => {
            // Save, Cancel and the form's own Escape all leave layout-edit
            // mode through here. Leaving must release the held pupil on EVERY
            // exit path, not only the toolbar button — and a stamp replaces
            // every table, so the very one being held ceases to exist.
            setHeld(null);
            setResizing(false);
          }}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The rail comes first in the DOM so that on a narrow screen the
            pupil you are about to place is not below the fold while you look
            at where to put them. */}
        {/* The group filter is the hub's, above the tabs: one filter for the
            class, so the roster and the room never disagree about who is
            being looked at. */}
        <div className="flex flex-col gap-2 lg:order-2 lg:w-64 lg:shrink-0">
          <StudentRail
            students={visibleUnseated}
            held={held}
            onHold={(studentId) =>
              setHeld((current) =>
                current?.kind === "pool" && current.studentId === studentId
                  ? null
                  : { kind: "pool", studentId },
              )
            }
          />
        </div>

        <div className="lg:order-1 lg:min-w-0 lg:flex-1">
          <RoomView
            layout={layout}
            seats={seats}
            studentsById={byId}
            held={held}
            onHoldSeat={(seatId) =>
              setHeld(resizing ? { kind: "table", seatId } : { kind: "seat", seatId })
            }
            onDropSeat={(seatId) => void onDropSeat(seatId)}
            onFloor={(at) => void onDropFloor(at)}
            onSelectStudent={setSelectedStudentId}
            editing={resizing}
          />
        </div>
      </div>

      {selectedStudentId !== null &&
        session &&
        (() => {
          const student = byId.get(selectedStudentId);
          if (!student) return null;
          return (
            <StudentCard
              key={student.id}
              student={student}
              session={session}
              onClose={() => setSelectedStudentId(null)}
              onMove={() => {
                const seat = seats.find((s) => s.studentId === student.id);
                if (!seat) return;
                setSelectedStudentId(null);
                setHeld({ kind: "seat", seatId: seat.id });
              }}
            />
          );
        })()}
    </div>
  );
}
