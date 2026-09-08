import type { ScheduleEntry, Session } from "@db";
import { deleteClass } from "@db/cascade";
import { useDb } from "@db/provider";
import { getOrCreateSessionAt, sessionsForClass, sessionsForDay, startOfDay } from "@db/sessions";
import { nextDay, previousDay } from "@domain/calendar";
import { entriesForDay } from "@domain/schedule";
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
  const slotSessionId = slot?.sessionId ?? null;
  const slotSubjectId = dayEntries.find((e) => e.id === slot?.entryId)?.subjectId;
  // Whether the day already holds a séance nobody scheduled. One is the most
  // a day can have — see `startSeance`.
  const hasUntimedSeance = slots.some((s) => s.startsAt === null && s.sessionId !== null);

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
      date: seanceDay,
      ...(slotStartsAt === null ? {} : { startsAt: slotStartsAt }),
      ...(slotSubjectId === undefined ? {} : { subjectId: slotSubjectId }),
    });
    return session.id;
  }, [db, classId, slotSessionId, seanceDay, slotStartsAt, slotSubjectId]);

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
   * open the day's UNSCHEDULED séance, creating it only if the day has none.
   *
   * Reuse rather than a second row, because `resolveSlot` matches a slot by
   * its time: two untimed séances on one day both answer to "no time", the
   * first wins every lookup, and the second would be written unreachable —
   * invisible in the strip, invisible in the register, present in the export.
   * A day therefore holds at most one unscheduled séance, and the button
   * hides once it exists rather than pretending to make another.
   */
  const startSeance = useCallback(async (): Promise<void> => {
    if (slotSessionId === null) {
      await ensureSeance();
      return;
    }
    const session = await getOrCreateSessionAt(db, classId, { date: seanceDay });
    selectSlot({ date: session.date, startsAt: null, sessionId: session.id, entryId: null });
  }, [db, classId, ensureSeance, slotSessionId, seanceDay, selectSlot]);

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
  const stripSlots = withNeighbours(slots, lesson.entries, lesson.history, termStart, lesson.day);
  // With no séance yet the draft belongs to the SLOT, so switching lesson
  // resets it rather than carrying one hour's text onto the next.
  const noteKey = slotSessionId ?? `${seanceDay}-${slotStartsAt}`;

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
        canStart={slotSessionId === null || !hasUntimedSeance}
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

/**
 * How far either side the strip looks for a neighbouring day.
 *
 * Two school weeks: enough to cross a holiday and to reach a fortnightly
 * lesson on the other side of an A/B alternation, and short enough that the
 * walk stays trivial. Beyond it only a real séance is offered, since a
 * timetable that predicts nothing for a fortnight is predicting a break.
 */
const NEIGHBOUR_SEARCH_DAYS = 14;

/**
 * The nearest day either side that holds a lesson — taught OR merely
 * scheduled.
 *
 * The séances answer the past and the timetable answers the future, which is
 * the asymmetry the design asks for: a lesson that happened left a row, and a
 * lesson still to come exists only as a prediction. Offering only séances made
 * next Thursday reachable solely by typing a URL, on the one screen built so a
 * teacher never has to choose.
 *
 * The walk steps through the CALENDAR (`nextDay`/`previousDay`) rather than
 * adding milliseconds, so a DST change cannot slide it a day.
 */
function neighbourDay(
  direction: "before" | "after",
  day: number,
  entries: ScheduleEntry[],
  termStart: number | null,
  history: Session[],
): number | null {
  const step = direction === "before" ? previousDay : nextDay;
  // `history` is newest first, so the past side reads it forwards and the
  // future side backwards; either way this is the CLOSEST séance on that side.
  const seanceDay =
    direction === "before"
      ? (history.find((s) => s.date < day)?.date ?? null)
      : ([...history].reverse().find((s) => s.date > day)?.date ?? null);

  let cursor = day;
  for (let i = 0; i < NEIGHBOUR_SEARCH_DAYS; i += 1) {
    cursor = step(cursor);
    // The séance is nearer than any scheduled day found so far, so it wins.
    if (cursor === seanceDay) return seanceDay;
    if (entriesForDay(entries, termStart, cursor).length > 0) return cursor;
  }
  return seanceDay;
}

/**
 * The day's slots, with one lesson either side of it.
 *
 * Reaching last Thursday — or next Tuesday — should not need a date picker on
 * a screen used with a class in front of you.
 *
 * The neighbouring day is merged by `slotsForDay`, the same function that
 * builds the current day, so a scheduled-but-unrecorded lesson and a recorded
 * one are indistinguishable here as they are there. Only one slot per side is
 * kept — the last lesson of the day before, the first of the day after — so
 * the strip stays a strip rather than becoming a timetable.
 */
function withNeighbours(
  slots: Slot[],
  entries: ScheduleEntry[],
  history: Session[],
  termStart: number | null,
  day: number,
): Slot[] {
  const slotsOn = (other: number): Slot[] =>
    slotsForDay(
      // Oldest first within the day, mirroring `sessionsForDay`: `history`
      // arrives newest-created first.
      history.filter((s) => s.date === other).reverse(),
      entriesForDay(entries, termStart, other),
      other,
    );

  const beforeDay = neighbourDay("before", day, entries, termStart, history);
  const afterDay = neighbourDay("after", day, entries, termStart, history);
  const before = beforeDay === null ? undefined : slotsOn(beforeDay).at(-1);
  const after = afterDay === null ? undefined : slotsOn(afterDay).at(0);

  return [...(before ? [before] : []), ...slots, ...(after ? [after] : [])];
}
