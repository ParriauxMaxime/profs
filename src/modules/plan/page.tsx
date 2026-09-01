import { useDb } from "@db/provider";
import { createSession, getOrCreateTodaySession, sessionsForClass, startOfDay } from "@db/sessions";
import { buildSeats, DEFAULT_COLS, DEFAULT_ROWS, unseatedStudentIds } from "@domain/seating";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutSizeForm } from "./components/layout-size-form";
import { SeatGrid } from "./components/seat-grid";
import { SessionBar } from "./components/session-bar";
import { StudentCard } from "./components/student-card";
import { UnseatedPool } from "./components/unseated-pool";

export function PlanPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  // Armed seat, as "row:col". Anchored to the cell's coordinates, which are
  // its identity — nothing here is index-keyed.
  const [armedSeat, setArmedSeat] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // Held as a session id, never a position: a deleted or vanished id must
  // fall back to today's session, not to whatever now sits at that index in
  // the list.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  // True once the teacher has picked a session themselves (the switcher, or
  // "Nouvelle séance"). While false, the selection is only ever today's
  // session, kept in sync with the calendar — see the focus listener below.
  const [manualSelection, setManualSelection] = useState(false);

  const selectSession = useCallback((sessionId: string, manual: boolean): void => {
    setSelectedSessionId(sessionId);
    setManualSelection(manual);
  }, []);

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

  const schoolClass = useLiveQuery(
    async () => (await db.classes.get(classId)) ?? null,
    [db, classId],
  );
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );
  const layout = useLiveQuery(
    async () => (await db.seatingLayouts.where("classId").equals(classId).first()) ?? null,
    [db, classId],
  );
  const seats = useLiveQuery(
    async () => (layout ? await db.seats.where("layoutId").equals(layout.id).toArray() : []),
    [db, layout?.id],
  );

  // A class gets its room the first time someone looks at it. Creating it in
  // an effect rather than in the live query keeps the query a pure read. The
  // re-check inside the transaction keeps this idempotent under StrictMode's
  // double-invoked effects — two layouts for one class would silently split a
  // teacher's seating in half.
  useEffect(() => {
    if (layout !== null) return;
    const id = crypto.randomUUID();
    void db.transaction("rw", [db.seatingLayouts, db.seats], async () => {
      const existing = await db.seatingLayouts.where("classId").equals(classId).first();
      if (existing) return;
      await db.seatingLayouts.add({
        id,
        classId,
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        updatedAt: Date.now(),
      });
      await db.seats.bulkPut(buildSeats(id, DEFAULT_ROWS, DEFAULT_COLS));
    });
  }, [db, classId, layout]);

  if (
    schoolClass === undefined ||
    students === undefined ||
    layout === undefined ||
    seats === undefined ||
    sessions === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;
  if (layout === null) return <p className="text-text-muted">{t("common.loading")}</p>;

  const unseated = unseatedStudentIds(students, seats);
  const byId = new Map(students.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">
            {t("plan.title")} — {schoolClass.name}
          </h2>
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
              // Leaving edit mode disarms: an armed seat is a live-entry state
              // and must not survive into a different mode.
              setArmedSeat(null);
              setResizing((v) => !v);
            }}
          >
            {resizing ? t("plan.doneEditing") : t("plan.editLayout")}
          </button>
        </div>
      </div>

      {resizing && (
        <LayoutSizeForm
          key={layout.id}
          layout={layout}
          seats={seats}
          onDone={() => setResizing(false)}
        />
      )}

      <SeatGrid
        layout={layout}
        seats={seats}
        studentsById={byId}
        armedSeat={armedSeat}
        onArmSeat={setArmedSeat}
        onSelectStudent={setSelectedStudentId}
        editing={resizing}
      />

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
            />
          );
        })()}

      <UnseatedPool
        students={unseated.map((id) => byId.get(id)).filter((s) => s !== undefined)}
        armedSeat={armedSeat}
        onAssign={async (studentId) => {
          if (!armedSeat) return;
          const [row, col] = armedSeat.split(":").map(Number);
          // Seating a pupil who already holds another seat must clear that
          // seat in the same transaction, or one pupil occupies two chairs.
          await db.transaction("rw", db.seats, async () => {
            const layoutSeats = await db.seats.where("layoutId").equals(layout.id).toArray();
            const previous = layoutSeats.find((s) => s.studentId === studentId);
            if (previous && (previous.row !== row || previous.col !== col)) {
              await db.seats.put({ ...previous, studentId: null });
            }
            await db.seats.put({ layoutId: layout.id, row, col, studentId });
          });
          setArmedSeat(null);
        }}
      />
    </div>
  );
}
