import type { ScheduleEntry, Session } from "@db";
import { deleteClass } from "@db/cascade";
import { useDb } from "@db/provider";
import {
  createSession,
  getOrCreateSessionAt,
  sessionsForClass,
  sessionsForDay,
  startOfDay,
} from "@db/sessions";
import { entriesForDate, isoWeekday } from "@domain/schedule";
import { resolveSlot, type Slot, slotsForDay } from "@domain/seance";
import { readTermStart } from "@domain/term";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { SeanceNote } from "../diary/components/seance-note";
import { PlanPage } from "../plan/page";
import { CarnetsPanel } from "./components/carnets-panel";
import { ClassForm } from "./components/class-form";
import { GroupFilter } from "./components/group-filter";
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
 * The class, its pupils, its groups and their memberships are loaded here once
 * and passed down, so nothing below flashes "Chargement…" over a class already
 * on screen.
 */
export function ClassPage({
  classId,
  date,
  at,
}: {
  classId: string;
  /** The day being taught, epoch-ms at local midnight, from the URL. */
  date?: string | undefined;
  /** Minutes from midnight, from the URL. Absent means an untimed séance. */
  at?: string | undefined;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [renaming, setRenaming] = useState(false);
  // Held as a group id, never an index: a deleted group falls back to "Tous",
  // not to whatever now sits at that position.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

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
  const parsedDate = date === undefined ? Number.NaN : Number(date);
  const wantedDay = Number.isFinite(parsedDate) ? startOfDay(parsedDate) : null;
  // No `date` in the URL is "wherever the teacher is", so the slot is the
  // day's first. With one, the URL names a time — and `resolveSlot` falls back
  // to the day's first when a lesson has since moved off that hour.
  const wanted = wantedDay === null ? null : { startsAt: at === undefined ? null : Number(at) };

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
  const groups = useLiveQuery(
    () => db.studentGroups.where("classId").equals(classId).sortBy("name"),
    [db, classId],
  );
  const memberships = useLiveQuery(async () => {
    if (!groups || groups.length === 0) return [];
    const groupIds = groups.map((g) => g.id);
    return await db.groupMembers.where("groupId").anyOf(groupIds).toArray();
  }, [db, groups]);

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

  const dayEntries = lesson === undefined ? [] : scheduledOn(lesson.entries, termStart, lesson.day);
  const slots = lesson === undefined ? [] : slotsForDay(lesson.daySessions, dayEntries, lesson.day);
  const slot = lesson === undefined ? null : resolveSlot(slots, wanted);

  // Broken out of `slot` so the callbacks below depend on values rather than
  // on an object rebuilt every render.
  const slotDate = slot?.date ?? null;
  const slotStartsAt = slot?.startsAt ?? null;
  const slotSessionId = slot?.sessionId ?? null;
  const slotSubjectId = dayEntries.find((e) => e.id === slot?.entryId)?.subjectId;

  /**
   * The séance to write against, brought into being if it does not exist yet.
   *
   * NEVER call this from an effect. Every write path — a mark, a behaviour
   * event, a note, the explicit button — awaits it first, and those are the
   * only four things that may create a séance.
   */
  const ensureSeance = useCallback(async (): Promise<string> => {
    if (slotSessionId !== null) return slotSessionId;
    const session = await getOrCreateSessionAt(db, classId, {
      date: slotDate ?? startOfDay(Date.now()),
      ...(slotStartsAt === null ? {} : { startsAt: slotStartsAt }),
      ...(slotSubjectId === undefined ? {} : { subjectId: slotSubjectId }),
    });
    return session.id;
  }, [db, classId, slotSessionId, slotDate, slotStartsAt, slotSubjectId]);

  const selectSlot = useCallback(
    (target: Slot): void => {
      Router.push("Class", {
        classId,
        date: String(target.date),
        ...(target.startsAt === null ? {} : { at: String(target.startsAt) }),
      });
    },
    [classId],
  );

  /**
   * "Commencer une séance": make this slot real, or — when it already is —
   * record a second, untimed lesson on the same day. That is the case
   * `createSession` exists for, and the one a lazy fetch cannot express.
   */
  const startSeance = useCallback(async (): Promise<void> => {
    if (slotSessionId === null) {
      await ensureSeance();
      return;
    }
    const created = await createSession(db, classId, slotDate ?? startOfDay(Date.now()));
    selectSlot({ date: created.date, startsAt: null, sessionId: created.id, entryId: null });
  }, [db, classId, ensureSeance, slotSessionId, slotDate, selectSlot]);

  if (
    schoolClass === undefined ||
    students === undefined ||
    groups === undefined ||
    lesson === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const session = lesson.daySessions.find((s) => s.id === slotSessionId) ?? null;
  const stripSlots = withNeighbours(slots, lesson.history, lesson.day);
  // With no séance yet the draft belongs to the SLOT, so switching lesson
  // resets it rather than carrying one hour's text onto the next.
  const noteKey = slotSessionId ?? `${slotDate}-${slotStartsAt}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
          {schoolClass.level && (
            <span className="text-sm text-text-muted">{schoolClass.level}</span>
          )}
          <span className="text-sm text-text-faint">
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
          <button type="button" className="btn" onClick={() => setRenaming(true)}>
            {t("class.rename")}
          </button>
          <ConfirmButton
            danger
            label={t("class.deleteClass")}
            confirmLabel={t("class.confirmDeleteClass")}
            body={t("class.confirmDeleteClassBody")}
            onConfirm={async () => {
              await deleteClass(db, classId);
              // The class page cannot survive its own class: without this the
              // route would render "Classe introuvable" instead of going back
              // to a list the teacher can act on.
              Router.push("Home");
            }}
          />
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
        slots={stripSlots}
        current={slot}
        className="border-border border-b pb-3"
        onSelect={selectSlot}
        onStart={() => void startSeance()}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The plan comes first in the DOM: it is what a hand reaches for
            mid-lesson, and the marks are what is read afterwards. */}
        <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
          {/* The chips filter the roster and the unseated rail, never the
              seats: filtering seats would leave holes in a room. */}
          <GroupFilter
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={setSelectedGroupId}
          />
          <PlanPage
            classId={classId}
            students={students}
            memberships={memberships ?? []}
            selectedGroupId={selectedGroupId}
            session={session}
            onRecord={ensureSeance}
          />
        </div>

        <div className="flex flex-col gap-4 lg:w-80 lg:shrink-0">
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
        </div>
      </div>
    </div>
  );
}

/**
 * The lessons the timetable predicts on a day.
 *
 * Without a term anchor nothing on an alternating cycle has a meaningful
 * parity, so the `all` lessons are selected directly rather than guessing a
 * week — the same choice Today makes, for the same reason.
 */
function scheduledOn(
  entries: ScheduleEntry[],
  termStart: number | null,
  day: number,
): ScheduleEntry[] {
  if (termStart === null) {
    return entries
      .filter((e) => e.weekCycle === "all" && e.weekday === isoWeekday(day))
      .sort((a, b) => a.startMinute - b.startMinute);
  }
  return entriesForDate(entries, termStart, day);
}

/**
 * Which day the page opens on when the URL does not say.
 *
 * Today when today holds anything at all — a scheduled lesson or a séance
 * already recorded — and otherwise the most recent day that carries one.
 * **Never an empty today**: a teacher opening 3°B on a Sunday wants the last
 * lesson they taught, not a blank screen implying nothing ever happened.
 *
 * `history` is newest first, so its head is the latest day with a séance.
 */
function defaultDay(
  entries: ScheduleEntry[],
  history: Session[],
  termStart: number | null,
): number {
  const today = startOfDay(Date.now());
  if (scheduledOn(entries, termStart, today).length > 0) return today;
  if (history.some((s) => s.date === today)) return today;
  return history[0]?.date ?? today;
}

/**
 * The day's slots, with the nearest séance either side of it.
 *
 * Reaching last Thursday should not need a date picker on a screen used with a
 * class in front of you, and the neighbours are already in hand.
 */
function withNeighbours(slots: Slot[], history: Session[], day: number): Slot[] {
  const asSlot = (s: Session): Slot => ({
    date: s.date,
    startsAt: s.startsAt ?? null,
    sessionId: s.id,
    entryId: null,
  });
  const before = history.find((s) => s.date < day);
  const after = [...history].reverse().find((s) => s.date > day);
  return [...(before ? [asSlot(before)] : []), ...slots, ...(after ? [asSlot(after)] : [])];
}
