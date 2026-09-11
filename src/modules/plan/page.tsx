import type { Assignment, BehaviourEvent, Desk, Session, Student } from "@db";
import { escalationContext } from "@db/escalation";
import {
  applyPlacement,
  assignmentsForPlan,
  getOrCreatePlan,
  plansForClass,
  unassign,
} from "@db/plans";
import { useDb } from "@db/provider";
import { desksForRoom, listRooms } from "@db/rooms";
import { readActiveRoom, resolveActiveRoom, writeActiveRoom } from "@domain/active-room";
import type { AttendanceValue } from "@domain/attendance";
import { isEscalated } from "@domain/escalation";
import { type HeldPupil, resolvePlacement } from "@domain/room";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { Modal } from "../design-system/components/modal";
import { RoomCanvas } from "../rooms/components/room-canvas";
import { useEscalationRule } from "../shared/use-escalation-rule";
import { useEscape } from "../shared/use-escape";
import { useMediaQuery } from "../shared/use-media-query";
import { SeatOccupant, useSeatLabel } from "./components/seat-occupant";
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
 * The pupils and the séance come from the class page: which lesson is being
 * recorded is the class's business, not this view's. What stays local is this
 * view's own gesture — who is in the hand, whose card is open, which salle is
 * being looked at.
 *
 * It NO LONGER picks a séance, and no longer creates one. `session` may be
 * null — a lesson nobody has recorded anything for yet — and `onRecord`
 * brings the row into being at the moment of the first mark. Choosing the
 * lesson in an effect here is what made merely opening a seating plan write a
 * séance row.
 */
export function PlanPage({
  classId,
  students,
  session,
  onRecord,
  panel,
}: {
  classId: string;
  students: Student[];
  /** The séance being recorded against, or null while none exists yet. */
  session: Session | null;
  /** Creates that séance on demand. Awaited before any register write. */
  onRecord: () => Promise<string>;
  /**
   * What the right panel holds when no pupil card is open — the séance note
   * and the carnets, built by the class page.
   *
   * The two-column layout lives HERE rather than in the class page because the
   * card that takes this column over needs `held`, `planId` and `unassign`,
   * all local to this view. Lifting those up would drag the whole placement
   * gesture with them.
   */
  panel: React.ReactNode;
}) {
  const { t } = useTranslation();
  const db = useDb();
  // A pupil id plus where they came from. Never a rail index and never a
  // coordinate: the rail reorders on every placement, and a desk can move out
  // from under a coordinate.
  const [held, setHeld] = useState<HeldPupil | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // `lg`, the breakpoint the layout below branches on. One card is mounted at
  // a time: rendering both and hiding one with CSS would mean two sets of live
  // queries, two notes drafts racing each other's blur write, and a hidden
  // Modal running its focus-trap effects.
  const isWide = useMediaQuery("(min-width: 1024px)");
  // The desk that opened the card, so closing the sheet returns focus there
  // rather than dropping a keyboard user at the top of the document.
  const openerRef = useRef<HTMLElement | null>(null);

  const releaseHeld = useCallback(() => setHeld(null), []);
  useEscape(releaseHeld);
  // True while a drop is being written. A ref, not state: it must be readable
  // by the very next click handler, before any re-render.
  const dropping = useRef(false);

  const seatLabel = useSeatLabel();

  // The register, for the séance on screen, read whole rather than per pupil.
  // Both are indexed by `sessionId`, so this is one query each for the room
  // instead of one per seat — and both live-update, so a mark made in the card
  // repaints the seat behind it without the page knowing it happened.
  //
  // `session` is null until somebody records something, and then there is
  // nothing to read: an empty map draws a room of unmarked seats, which is
  // exactly what an unstarted lesson is.
  const attendanceOf = useLiveQuery(async () => {
    if (!session) return new Map<string, AttendanceValue>();
    const rows = await db.attendance.where("sessionId").equals(session.id).toArray();
    return new Map(rows.map((row) => [row.studentId, row.value]));
  }, [db, session?.id]);

  const eventsOf = useLiveQuery(async () => {
    if (!session) return new Map<string, BehaviourEvent[]>();
    const rows = await db.behaviourEvents.where("sessionId").equals(session.id).sortBy("createdAt");
    const byStudent = new Map<string, BehaviourEvent[]>();
    for (const row of rows) {
      const list = byStudent.get(row.studentId) ?? [];
      list.push(row);
      byStudent.set(row.studentId, list);
    }
    return byStudent;
  }, [db, session?.id]);

  const rule = useEscalationRule();

  /**
   * The escalation window for the whole room — two queries, not one per seat.
   * The rule's fields go into the dependency array individually because
   * `useEscalationRule` returns a fresh object on every live-query tick.
   */
  const escalation = useLiveQuery(
    () => escalationContext(db, classId, session?.id ?? null, rule),
    [db, classId, session?.id, rule.enabled, rule.seances, rule.yellows],
  );

  /**
   * What one seat says about the rule.
   *
   * Built once and used by BOTH the tile and its accessible name, so the
   * drawing and the word it stands for cannot drift — the pairing
   * `useSeatLabel` exists to enforce.
   */
  const seatFacts = useCallback(
    (studentId: string) => {
      const windowYellows = escalation?.yellowsByStudent.get(studentId) ?? [];
      return {
        priorYellows: windowYellows.filter((event) => event.sessionId !== session?.id),
        escalated: isEscalated(windowYellows.length, rule),
      };
    },
    [escalation, session?.id, rule],
  );

  const rooms = useLiveQuery(() => listRooms(db), [db]);
  // The salles this class is already seated in, fullest first — what
  // `resolveActiveRoom` falls back to before it falls back to the first salle
  // in the workspace. Occupancy rather than name order because a plan created
  // by a previous mis-resolve is empty, and must lose to the one the teacher
  // actually uses.
  const occupiedRoomIds = useLiveQuery(async () => {
    const plans = await plansForClass(db, classId);
    const counted = await Promise.all(
      plans.map(async (plan) => ({
        roomId: plan.roomId,
        seated: await db.assignments.where("planId").equals(plan.id).count(),
      })),
    );
    return counted.sort((a, b) => b.seated - a.seated).map((entry) => entry.roomId);
  }, [db, classId]);
  // Device-local and held as an id, never an index: deleting a salle reorders
  // the list, and an index would retarget onto its neighbour.
  const [storedRoomId, setStoredRoomId] = useState(() => readActiveRoom(classId));
  // Nothing resolves until BOTH queries have landed, and that is load-bearing
  // rather than tidy. `rooms` and `occupiedRoomIds` settle independently, so a
  // render where the salles are known and the class's plans are not would
  // resolve to the first salle — and the effect below would immediately write
  // a plan there, which is the very row this fix exists to stop creating.
  // Holding `room` at null until both are in keeps that effect quiet.
  const activeRoomId =
    rooms === undefined || occupiedRoomIds === undefined
      ? null
      : resolveActiveRoom(rooms, storedRoomId, occupiedRoomIds);
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

  if (rooms === undefined || occupiedRoomIds === undefined) {
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

  const selectedStudent = selectedStudentId === null ? null : (byId.get(selectedStudentId) ?? null);

  const card =
    selectedStudent === null ? null : (
      <StudentCard
        key={selectedStudent.id}
        student={selectedStudent}
        session={session}
        onRecord={onRecord}
        onClose={() => setSelectedStudentId(null)}
        onMove={() => {
          const deskId = deskOf(selectedStudent.id);
          setSelectedStudentId(null);
          setHeld({ studentId: selectedStudent.id, fromDeskId: deskId });
        }}
        onUnseat={
          deskOf(selectedStudent.id) === null
            ? undefined
            : () => {
                setSelectedStudentId(null);
                void unassign(db, planId, selectedStudent.id);
              }
        }
      />
    );

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
          <div>
            <RoomCanvas
              room={room}
              desks={desks}
              emptyHint={t("plan.emptyRoom")}
              renderPlace={(desk) => {
                const studentId = byDesk.get(desk.id);
                const student = studentId ? byId.get(studentId) : undefined;
                if (!student) {
                  return (
                    <span className="text-[11px]" style={{ color: "var(--desk-edge)" }}>
                      {t("plan.emptySeat")}
                    </span>
                  );
                }
                const facts = seatFacts(student.id);
                return (
                  <SeatOccupant
                    student={student}
                    attendance={attendanceOf?.get(student.id) ?? null}
                    events={eventsOf?.get(student.id) ?? []}
                    priorYellows={facts.priorYellows}
                    escalated={facts.escalated}
                  />
                );
              }}
              placeProps={(desk) => {
                const studentId = byDesk.get(desk.id) ?? null;
                const seated = studentId ? byId.get(studentId) : undefined;
                const isHeld = held !== null && held.fromDeskId === desk.id;
                // The attendance ring and the behaviour pips are colour and
                // position only, so the words they stand for live here. A seat
                // with something in hand says what a tap will do instead:
                // that is the gesture being offered, and it outranks a report.
                const facts = seated ? seatFacts(seated.id) : null;
                const label = seated
                  ? seatLabel(
                      seated,
                      attendanceOf?.get(seated.id) ?? null,
                      eventsOf?.get(seated.id) ?? [],
                      facts?.priorYellows ?? [],
                      facts?.escalated ?? false,
                      rule.seances,
                    )
                  : undefined;
                return {
                  role: "button",
                  tabIndex: 0,
                  title: held ? t("plan.placeHere") : label,
                  "aria-label": label,
                  "aria-pressed": isHeld || undefined,
                  className: isHeld
                    ? "outline-2 outline-accent outline-offset-2"
                    : held
                      ? "outline-2 outline-accent outline-dashed"
                      : "",
                  onClick: (e) => {
                    // Something in hand: this place is a target. Nothing in hand
                    // and somebody sitting here: open their card, which is the
                    // gesture of the lesson. Nothing in hand and nobody here:
                    // nothing to do — a pupil is never picked up off an empty
                    // place.
                    if (held) {
                      void onPlace(desk);
                      return;
                    }
                    if (studentId) {
                      openerRef.current = e.currentTarget as HTMLElement;
                      setSelectedStudentId(studentId);
                    }
                  },
                  onKeyDown: (e) => {
                    if (e.key !== " " && e.key !== "Enter") return;
                    e.preventDefault();
                    if (held) {
                      void onPlace(desk);
                      return;
                    }
                    if (studentId) {
                      openerRef.current = e.currentTarget as HTMLElement;
                      setSelectedStudentId(studentId);
                    }
                  },
                };
              }}
            />
          </div>

          {/* Below the room, and only when it has something to say. It used to
            sit above at all times, reporting "Tous les élèves sont placés" —
            a permanent band for the normal state. Below rather than above
            because it is conditional now: appearing above would push the
            desks down the moment a pupil is unseated, moving them under a
            hand that is mid-gesture. */}
          {unseatedStudents.length > 0 && (
            <StudentRail
              students={unseatedStudents}
              held={held}
              onHold={(studentId) =>
                setHeld((current) =>
                  current?.studentId === studentId && current.fromDeskId === null
                    ? null
                    : { studentId, fromDeskId: null },
                )
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto">
          {isWide && card !== null ? (
            // The card REPLACES the panel rather than pushing it down. A panel
            // that grows by 600px moves the note being written off screen, which
            // is the failure this whole change is about.
            card
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text-muted">{t("plan.room")}</span>
                <select
                  className="field"
                  style={{ width: "auto" }}
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
              {panel}
            </>
          )}
        </div>
      </div>

      {/* Below `lg` there is no column to take over, and a card appended under
          the room is the bug being fixed. `Modal` already caps at 88vh, scrolls
          inside itself, locks body scroll, traps Tab and closes on Escape or
          backdrop. Not `Sheet`: it draws its own title-and-close header, and
          the card already has one. */}
      {!isWide && (
        <Modal
          open={card !== null}
          onClose={() => setSelectedStudentId(null)}
          placement="bottom"
          returnFocusTo={openerRef}
        >
          {card}
        </Modal>
      )}
    </>
  );
}
