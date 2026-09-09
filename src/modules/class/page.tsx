import type { ScheduleEntry, Session } from "@db";
import { useDb } from "@db/provider";
import { listRooms } from "@db/rooms";
import { getOrCreateSessionAt, sessionsForClass, sessionsForDay, startOfDay } from "@db/sessions";
import { entriesForDay } from "@domain/schedule";
import { hourOfDay, resolveSlot, type Slot, slotsForDay, teachingDays } from "@domain/seance";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { SeanceNote } from "../diary/components/seance-note";
import { StudentCard } from "../plan/components/student-card";
import { PlanPage } from "../plan/page";
import { CarnetsPanel } from "./components/carnets-panel";
import { ClassForm } from "./components/class-form";
import { ClassMenu } from "./components/class-menu";
import { RosterRegister } from "./components/roster-register";
import { SeanceStrip } from "./components/seance-strip";

/**
 * A class is ONE page, and that page is the lesson.
 *
 * The seating plan (which is also the register), the séance's note and the way
 * into the carnets sit on one screen, because that is what a teacher does in
 * an hour: seat them, mark them, write down what was covered. The four tabs
 * this replaced made the register a destination you had to choose.
 *
 * **Opening this page writes NOTHING.** The tab it replaced called
 * `getOrCreateTodaySession` in an effect on mount, so glancing at a seating
 * plan created a séance for a lesson nobody taught — the schedule's "predicts,
 * never pre-creates" ruling, undone by the one screen that reads it. A séance
 * row appears on the first thing actually recorded: an attendance mark, a
 * behaviour event, a note that changed, or "Commencer une séance". Every one
 * of those paths goes through `ensureSeance` and awaits it before writing;
 * none of them is an effect.
 *
 * The class and its pupils are loaded here once and passed down, so nothing
 * below flashes "Chargement…" over a class already on screen.
 */
export function ClassPage({
  classId,
  date,
  at,
}: {
  classId: string;
  /** The day being taught, epoch-ms at local midnight, from the URL. */
  date?: string | undefined;
  /** Minutes from midnight, from the URL. Absent falls back to the day's first séance — see `resolveSlot`. */
  at?: string | undefined;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [renaming, setRenaming] = useState(false);
  // Held as a pupil id, never an index: the roster register's rows re-sort as
  // pupils are added. Only used without a salle — with one, the plan owns its
  // own card locally.
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // A tablet left on this page overnight must not go on recording attendance
  // against yesterday: the day is resolved from the clock, so re-resolve it
  // when the device comes back rather than only at mount.
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

  const termStart = readTermStart();
  // An empty `?date=` is folded into the missing case before parsing:
  // `Number("")` is `0`, not NaN, so left alone it would resolve to 1 January
  // 1970 rather than falling back to "wherever the teacher is".
  const rawDate = date === undefined ? "" : date.trim();
  const parsedDate = rawDate === "" ? Number.NaN : Number(rawDate);
  const wantedDay = Number.isFinite(parsedDate) ? startOfDay(parsedDate) : null;
  // No `date` in the URL is "wherever the teacher is", so the slot is the
  // day's first. With one, the URL names a time — and `resolveSlot` falls back
  // to the day's first when a lesson has since moved off that hour.
  const wanted = wantedDay === null || at === undefined ? null : { startsAt: Number(at) };

  const schoolClass = useLiveQuery(
    // An explicit null distinguishes "no such class" from "still loading":
    // useLiveQuery gives undefined for both, and the page would otherwise sit
    // on "Chargement…" forever for a class that has been deleted.
    async () => (await db.classes.get(classId)) ?? null,
    [db, classId],
  );
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );

  // A pure read: it resolves which day is on screen and fetches that day's
  // séances. It creates nothing, which is the whole point of this page.
  const lesson = useLiveQuery(async () => {
    void refreshTick;
    const entries = await db.scheduleEntries.where("classId").equals(classId).toArray();
    const history = await sessionsForClass(db, classId);
    const day = wantedDay ?? defaultDay(entries, history, termStart);
    return { entries, history, day, daySessions: await sessionsForDay(db, classId, day) };
  }, [db, classId, wantedDay, termStart, refreshTick]);

  const books = useLiveQuery(async () => {
    const [gradebooks, subjects] = await Promise.all([
      db.gradebooks.where("classId").equals(classId).toArray(),
      db.subjects.toArray(),
    ]);
    return { gradebooks, subjects };
  }, [db, classId]);

  // Whether the workspace has any salle at all. A salle is an upgrade to the
  // register, never a prerequisite for it, so this decides between the plan
  // and the roster register — not whether attendance can be taken.
  const rooms = useLiveQuery(() => listRooms(db), [db]);

  const dayEntries =
    lesson === undefined ? [] : entriesForDay(lesson.entries, termStart, lesson.day);
  const slots = lesson === undefined ? [] : slotsForDay(lesson.daySessions, dayEntries, lesson.day);
  const slot = lesson === undefined ? null : resolveSlot(slots, wanted);

  /**
   * The day anything recorded here belongs to.
   *
   * `lesson.day` is the day the STRIP IS SHOWING — the one the URL asked for
   * when it named one, and the resolved default otherwise. It is not
   * `slot?.date`: a day carrying neither a séance nor a scheduled lesson has
   * no slot at all, and falling back to today from there would file a mark
   * under today while the screen said 3 September. Attendance on the wrong
   * date is the one failure this app cannot afford, so the fallback chain
   * ends at the URL's own day before it ever reaches the clock.
   *
   * (`slotsForDay` stamps every slot it builds with the day it was given, so
   * where a slot exists `slot.date` and `lesson.day` are the same value.)
   */
  const seanceDay = lesson?.day ?? wantedDay ?? startOfDay(Date.now());

  // Broken out of `slot` so the callbacks below depend on values rather than
  // on an object rebuilt every render.
  const slotStartsAt = slot?.startsAt ?? null;
  const slotEndsAt = slot?.endsAt ?? null;
  const slotSessionId = slot?.sessionId ?? null;
  const slotSubjectId = dayEntries.find((e) => e.id === slot?.entryId)?.subjectId;
  // The day's séances, for `canStart` — see `startSeance`.
  const daySessions = lesson === undefined ? [] : lesson.daySessions;
  // "Commencer une séance" offers to make THIS slot real when it has no
  // séance yet, or — when it already does — to start an extra one at the
  // current hour. It hides only in the second case, and only once a séance
  // already sits at that hour: starting another there could only reuse a row
  // the strip already reaches. A button that cannot do anything is worse than
  // no button.
  const canStart =
    slotSessionId === null || !daySessions.some((s) => s.startsAt === hourOfDay(Date.now()));

  /**
   * The séance to write against, brought into being if it does not exist yet.
   *
   * NEVER call this from an effect. Every write path — a mark, a behaviour
   * event, a note, the explicit button — awaits it first, and those are the
   * only four things that may create a séance.
   */
  const ensureSeance = useCallback(async (): Promise<string> => {
    if (slotSessionId !== null) return slotSessionId;
    const startsAt = slotStartsAt ?? hourOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, classId, {
      date: seanceDay,
      startsAt,
      ...(slotEndsAt === null ? {} : { endsAt: slotEndsAt }),
      ...(slotSubjectId === undefined ? {} : { subjectId: slotSubjectId }),
    });
    return session.id;
  }, [db, classId, slotSessionId, seanceDay, slotStartsAt, slotEndsAt, slotSubjectId]);

  /**
   * Choosing a day, not a lesson: no `at`, so `resolveSlot` falls back to that
   * day's first — which is what picking a day means.
   */
  const selectDay = useCallback(
    (day: number): void => {
      Router.push("Class", { classId, date: String(day) });
    },
    [classId],
  );

  const selectSlot = useCallback(
    (target: Slot): void => {
      Router.push("Class", {
        classId,
        date: String(target.date),
        at: String(target.startsAt),
      });
    },
    [classId],
  );

  /**
   * "Commencer une séance": make this slot real, or — when it already is —
   * start a NEW séance at the CURRENT clock hour.
   *
   * The old contract was "open the day's UNSCHEDULED séance, creating it only
   * if the day has none", because `resolveSlot` matched a slot by its time:
   * two untimed séances on one day both answered to "no time", the first won
   * every lookup, and the second would be written unreachable — invisible in
   * the strip, invisible in the register, present only in the export. Times
   * are required now, so a séance started now lands on the hour it was
   * started rather than on no time at all, and `getOrCreateSessionAt` reuses
   * whichever séance already sits at that hour instead of making a second.
   * The hazard does not disappear, it changes shape: the rule relaxes from
   * "at most one unscheduled séance a day" to "at most one séance an hour",
   * and `canStart` guards it the same way — hidden once starting could only
   * reuse a row already reachable.
   */
  const startSeance = useCallback(async (): Promise<void> => {
    if (slotSessionId === null) {
      await ensureSeance();
      return;
    }
    const startsAt = hourOfDay(Date.now());
    const session = await getOrCreateSessionAt(db, classId, { date: seanceDay, startsAt });
    selectSlot({
      date: session.date,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      sessionId: session.id,
      entryId: null,
    });
  }, [db, classId, ensureSeance, slotSessionId, seanceDay, selectSlot]);

  // The roster register's marks for the slot on screen. Read directly rather
  // than through the pupil card, which only ever reads for the one pupil it
  // has open. Empty while no séance exists yet — nothing has been recorded,
  // not "everyone present".
  const attendanceRecords = useLiveQuery(
    async () =>
      slotSessionId === null
        ? []
        : await db.attendance.where("sessionId").equals(slotSessionId).toArray(),
    [db, slotSessionId],
  );

  if (
    schoolClass === undefined ||
    students === undefined ||
    lesson === undefined ||
    rooms === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const session = lesson.daySessions.find((s) => s.id === slotSessionId) ?? null;
  // Was `withNeighbours`, which smuggled a slot from the nearest day either
  // side into this day's row. The day menu names those days instead.
  const dayOptions = (() => {
    const days = teachingDays(lesson.entries, lesson.history, termStart, startOfDay(Date.now()), {
      backDays: 28,
      aheadDays: 14,
    });
    // The day on screen must be an option, or the select shows a value it does
    // not offer: a day carrying no lesson at all is still reachable by URL.
    return days.includes(lesson.day) ? days : [...days, lesson.day].sort((a, b) => a - b);
  })();
  // With no séance yet the draft belongs to the SLOT, so switching lesson
  // resets it rather than carrying one hour's text onto the next.
  const noteKey = slotSessionId ?? `${seanceDay}-${slotStartsAt}`;
  const hasRoom = rooms.length > 0;

  /**
   * The right panel's steady contents. Built here because the note and the
   * carnets are the class's business, and handed to whichever branch renders —
   * the plan takes it over with the pupil card, so the plan owns the column.
   */
  const panel = (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-text-muted text-xs uppercase tracking-wider">
          {t("diary.entryLabel")}
        </h3>
        <SeanceNote
          key={noteKey}
          sessionId={slotSessionId}
          text={session?.note ?? ""}
          onEnsureSession={ensureSeance}
        />
      </div>

      {books !== undefined && (
        <CarnetsPanel
          schoolClass={schoolClass}
          gradebooks={books.gradebooks}
          subjects={books.subjects}
        />
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {/* The page had no way back to the list except the drawer. */}
          <Link to={Router.Classes()} className="text-accent text-sm">
            {t("nav.classes")}
          </Link>
          <span className="text-sm text-text-faint">/</span>
          <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
          <span className="text-sm text-text-muted">
            {schoolClass.level ? `${schoolClass.level} \u00b7 ` : ""}
            {t("dashboard.studentCount", { count: students.length })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The roster and the archive are detours from the lesson, each with
              its own URL — links, not panels of this page. */}
          <Link to={Router.ClassStudents({ classId })} className="text-accent text-sm">
            {t("class.tab.students")}
          </Link>
          <Link to={Router.ClassDiary({ classId })} className="text-accent text-sm">
            {t("class.tab.diary")}
          </Link>
          <ClassMenu schoolClass={schoolClass} onRename={() => setRenaming(true)} />
        </div>
      </div>

      {renaming && (
        // Keyed by class id: the form captures its defaults at mount.
        <ClassForm
          key={schoolClass.id}
          schoolClass={schoolClass}
          onDone={() => setRenaming(false)}
        />
      )}

      <SeanceStrip
        days={dayOptions}
        slots={slots}
        current={slot}
        canStart={canStart}
        className="border-border border-b pb-3"
        onSelectDay={selectDay}
        onSelect={selectSlot}
        onStart={() => void startSeance()}
      />

      {hasRoom ? (
        <PlanPage
          classId={classId}
          students={students}
          session={session}
          onRecord={ensureSeance}
          panel={panel}
        />
      ) : (
        // No salle in the workspace: a plan has nowhere to draw, but the
        // register does not depend on one. Same gesture as a seat — tap a row
        // to open the pupil card, the only place a mark is set. This branch
        // keeps its own column split: there is no room to sit beside.
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
            <RosterRegister
              students={students}
              attendance={attendanceRecords ?? []}
              onOpen={setSelectedStudentId}
            />
            {selectedStudentId !== null &&
              (() => {
                const student = students.find((s) => s.id === selectedStudentId);
                if (!student) return null;
                return (
                  <StudentCard
                    key={student.id}
                    student={student}
                    session={session}
                    onRecord={ensureSeance}
                    onClose={() => setSelectedStudentId(null)}
                  />
                );
              })()}
          </div>
          <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">{panel}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Which day the page opens on when the URL does not say.
 *
 * Today when today holds anything at all — a scheduled lesson or a séance
 * already recorded — and otherwise **the last day taught**. Never an empty
 * today: a teacher opening 3°B on a Sunday wants the lesson they last gave,
 * not a blank screen implying nothing ever happened.
 *
 * `<= today` is what makes "last taught" mean that. A séance can now be
 * prepared ahead — the strip predicts upcoming lessons from the timetable, and
 * writing next Thursday's note creates its row — so the newest séance overall
 * may be one that has not happened. Landing on it would open the page on a
 * lesson nobody has given.
 *
 * `history` is newest first, so the first entry at or before today is the
 * latest one; the head is kept as a fallback for a workspace whose every
 * séance is somehow in the future.
 */
function defaultDay(
  entries: ScheduleEntry[],
  history: Session[],
  termStart: number | null,
): number {
  const today = startOfDay(Date.now());
  if (entriesForDay(entries, termStart, today).length > 0) return today;
  if (history.some((s) => s.date === today)) return today;
  return history.find((s) => s.date <= today)?.date ?? history[0]?.date ?? today;
}
