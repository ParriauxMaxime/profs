import type { Session } from "@db";
import { useDb } from "@db/provider";
import { createSession, getOrCreateTodaySession } from "@db/sessions";
import { buildSeats, DEFAULT_COLS, DEFAULT_ROWS, unseatedStudentIds } from "@domain/seating";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutSizeForm } from "./components/layout-size-form";
import { SeatGrid } from "./components/seat-grid";
import { StudentCard } from "./components/student-card";
import { UnseatedPool } from "./components/unseated-pool";

export function PlanPage({ classId }: { classId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  // Armed seat, as "row:col". Anchored to the cell's coordinates, which are
  // its identity — nothing here is index-keyed.
  const [armedSeat, setArmedSeat] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  // The session is fetched once the class is known, not on every render: a
  // lazy get-or-create is idempotent but still a write, so it lives in an
  // effect rather than a live query. The `cancelled` flag guards against
  // React 19 StrictMode's double-invoked effects racing each other.
  useEffect(() => {
    let cancelled = false;
    void getOrCreateTodaySession(db, classId).then((s) => {
      if (!cancelled) setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, [db, classId]);

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
    seats === undefined
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
        <div className="flex flex-col">
          <h2 className="font-semibold text-lg">
            {t("plan.title")} — {schoolClass.name}
          </h2>
          {session && (
            <span className="text-sm text-text-muted">
              {t("plan.sessionOf", {
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
                  session.date,
                ),
              })}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => void createSession(db, classId).then(setSession)}
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
