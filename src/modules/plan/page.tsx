import type { Assignment, Desk, GroupMember, Student } from "@db";
import { applyPlacement, assignmentsForPlan, getOrCreatePlan, unassign } from "@db/plans";
import { useDb } from "@db/provider";
import { desksForRoom, listRooms } from "@db/rooms";
import { createSession, getOrCreateTodaySession, sessionsForClass, startOfDay } from "@db/sessions";
import { readActiveRoom, resolveActiveRoom, writeActiveRoom } from "@domain/active-room";
import { filterByGroup } from "@domain/group";
import { type HeldPupil, resolvePlacement } from "@domain/room";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { PupilName } from "../design-system/components/pupil-name";
import { RoomCanvas } from "../rooms/components/room-canvas";
import { useEscape } from "../shared/use-escape";
import { PupilDisc } from "./components/pupil-disc";
import { SessionBar } from "./components/session-bar";
import { StudentCard } from "./components/student-card";
import { StudentRail } from "./components/student-rail";

/**
 * The seating plan: a class poured into a salle.
 *
 * NO furniture on this screen. Not a `×`, not a floor slot, not a template
 * form, not a mode toggle — those live where the salle lives, and moving them
 * there is the whole of the redesign. The screen a teacher touches every hour
 * lost every control that could damage the room.
 *
 * So a tap has exactly one meaning again: on a pupil it opens their card, and
 * that is the gesture of the lesson itself. Moving somebody starts from the
 * card's `Déplacer`, which is frequent enough to be its primary action and has
 * no other path.
 *
 * The pupils, the groups and the two shared selections come from the shell:
 * the group filter and the selected session are the class's, not this view's.
 * What stays local is this view's own gesture — who is in the hand, whose card
 * is open, which salle is being looked at.
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
  // A pupil id plus where they came from. Never a rail index and never a
  // coordinate: the rail reorders on every placement, and a desk can move out
  // from under a coordinate.
  const [held, setHeld] = useState<HeldPupil | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
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

  // Resolves the selection to today's session: on first mount, if the selected
  // session vanished, or — for an automatic selection — once the calendar date
  // has moved on since it was picked. A manual pick of a past session is left
  // alone. `getOrCreateTodaySession` re-checks inside a transaction, so this is
  // idempotent under StrictMode's double-invoked effects.
  useEffect(() => {
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

  const rooms = useLiveQuery(() => listRooms(db), [db]);
  // Device-local and held as an id, never an index: deleting a salle reorders
  // the list, and an index would retarget onto its neighbour.
  const [storedRoomId, setStoredRoomId] = useState(() => readActiveRoom(classId));
  const activeRoomId = resolveActiveRoom(rooms ?? [], storedRoomId);
  const room = rooms?.find((r) => r.id === activeRoomId) ?? null;

  const selectRoom = useCallback(
    (roomId: string) => {
      // Switching salles releases the hand: the place being aimed at does not
      // exist in the next room.
      setHeld(null);
      writeActiveRoom(classId, roomId);
      setStoredRoomId(roomId);
    },
    [classId],
  );

  const desks = useLiveQuery(
    async () => (room ? await desksForRoom(db, room.id) : []),
    [db, room?.id],
  );
  // A class gets its plan in a salle the first time it is looked at there.
  // Creating it in an effect rather than in the live query keeps the query a
  // pure read; `getOrCreatePlan` re-checks inside its transaction, so
  // StrictMode's double-invoked effect cannot produce two plans.
  const plan = useLiveQuery(
    async () =>
      room ? ((await db.seatingPlans.where({ classId, roomId: room.id }).first()) ?? null) : null,
    [db, classId, room?.id],
  );
  useEffect(() => {
    if (room === null || plan !== null) return;
    void getOrCreatePlan(db, classId, room.id);
  }, [db, classId, room, plan]);

  const assignments = useLiveQuery(
    async () => (plan ? await assignmentsForPlan(db, plan.id) : []),
    [db, plan?.id],
  );

  if (rooms === undefined || sessions === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }

  // A workspace with no salle at all: there is nowhere to seat anybody, and
  // saying so beats drawing an empty floor that looks broken.
  if (room === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-muted">{t("plan.noRoom")}</p>
        <Link className="btn btn-primary" to={Router.Rooms()}>
          {t("plan.manageRooms")}
        </Link>
      </div>
    );
  }
  if (desks === undefined || assignments === undefined || !plan) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  const planId = plan.id;

  const byDesk = new Map(assignments.map((a: Assignment) => [a.deskId, a.studentId]));
  const seatedIds = new Set(assignments.map((a: Assignment) => a.studentId));
  const byId = new Map(students.map((s) => [s.id, s]));

  const unseatedStudents = students.filter((s) => !seatedIds.has(s.id));
  const visibleUnseated = filterByGroup(unseatedStudents, memberships, selectedGroupId);

  const deskOf = (studentId: string): string | null =>
    assignments.find((a: Assignment) => a.studentId === studentId)?.deskId ?? null;

  const onPlace = async (desk: Desk): Promise<void> => {
    if (held === null) return;
    // One drop per hold. `setHeld(null)` only lands after the await, and a
    // second tap runs a closure that already captured the old `held` — so
    // aiming at B then C would write both, moving a pupil nobody touched.
    if (dropping.current) return;
    dropping.current = true;
    try {
      await applyPlacement(
        db,
        planId,
        resolvePlacement(held, { ...desk, studentId: byDesk.get(desk.id) ?? null }),
      );
    } catch (error) {
      // No blocking dialog — they are banned. A failed write must still end
      // the gesture rather than stranding a pupil in the hand; the live query
      // re-renders the room as it actually is.
      console.error(error);
    } finally {
      setHeld(null);
      dropping.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">{t("plan.room")}</span>
          <select
            className="field"
            style={{ width: "12rem" }}
            value={room.id}
            onChange={(e) => selectRoom(e.target.value)}
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Link className="text-accent text-sm" to={Router.Rooms()}>
            {t("plan.manageRooms")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedSessionId !== null && (
            <SessionBar
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelect={(id) => selectSession(id, true)}
            />
          )}
          <button
            type="button"
            className="btn"
            onClick={() =>
              void createSession(db, classId, startOfDay(Date.now())).then((s) =>
                selectSession(s.id, true),
              )
            }
          >
            {t("plan.newSession")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The rail comes first in the DOM so that on a narrow screen the
            pupil you are about to place is not below the fold while you look
            at where to put them. */}
        <div className="flex flex-col gap-2 lg:order-2 lg:w-64 lg:shrink-0">
          <StudentRail
            students={visibleUnseated}
            held={held}
            onHold={(studentId) =>
              setHeld((current) =>
                current?.studentId === studentId && current.fromDeskId === null
                  ? null
                  : { studentId, fromDeskId: null },
              )
            }
          />
        </div>

        <div className="lg:order-1 lg:min-w-0 lg:flex-1">
          <RoomCanvas
            room={room}
            desks={desks}
            emptyHint={t("plan.emptyRoom")}
            renderPlace={(desk) => {
              const studentId = byDesk.get(desk.id);
              const student = studentId ? byId.get(studentId) : undefined;
              if (!student) {
                return (
                  <span className="text-[11px]" style={{ color: "var(--wood-edge)" }}>
                    {t("plan.emptySeat")}
                  </span>
                );
              }
              return (
                <>
                  <PupilDisc student={student} />
                  <span
                    className="w-full truncate px-1 text-center text-[10px]"
                    style={{ color: "var(--wood-ink)" }}
                  >
                    <PupilName student={student} format="surname" />
                  </span>
                </>
              );
            }}
            placeProps={(desk) => {
              const studentId = byDesk.get(desk.id) ?? null;
              const isHeld = held !== null && held.fromDeskId === desk.id;
              return {
                role: "button",
                tabIndex: 0,
                title: held ? t("plan.placeHere") : undefined,
                "aria-pressed": isHeld || undefined,
                className: isHeld
                  ? "outline-2 outline-accent outline-offset-2"
                  : held
                    ? "outline-2 outline-accent outline-dashed"
                    : "",
                onClick: () => {
                  // Something in hand: this place is a target. Nothing in hand
                  // and somebody sitting here: open their card, which is the
                  // gesture of the lesson. Nothing in hand and nobody here:
                  // nothing to do — a pupil is never picked up off an empty
                  // place.
                  if (held) {
                    void onPlace(desk);
                    return;
                  }
                  if (studentId) setSelectedStudentId(studentId);
                },
                onKeyDown: (e) => {
                  if (e.key !== " " && e.key !== "Enter") return;
                  e.preventDefault();
                  if (held) {
                    void onPlace(desk);
                    return;
                  }
                  if (studentId) setSelectedStudentId(studentId);
                },
              };
            }}
          />
        </div>
      </div>

      {selectedStudentId !== null &&
        (() => {
          const student = byId.get(selectedStudentId);
          if (!student) return null;
          const deskId = deskOf(student.id);
          return (
            <StudentCard
              key={student.id}
              student={student}
              session={session}
              onClose={() => setSelectedStudentId(null)}
              onMove={() => {
                setSelectedStudentId(null);
                setHeld({ studentId: student.id, fromDeskId: deskId });
              }}
              onUnseat={
                deskId === null
                  ? undefined
                  : () => {
                      setSelectedStudentId(null);
                      void unassign(db, planId, student.id);
                    }
              }
            />
          );
        })()}
    </div>
  );
}
