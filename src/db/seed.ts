import { ATTENDANCE_VALUES } from "@domain/attendance";
import { avatarSvg, hasAvatar } from "@domain/avatar";
import { BEHAVIOUR_TYPES } from "@domain/behaviour";
import { addDays, nextDay } from "@domain/calendar";
import { defaultGradebookName } from "@domain/gradebook/naming";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { buildRoom, DEFAULT_TEMPLATE, type RoomTemplate } from "@domain/room-templates";
import { RUBRIC_LEVELS } from "@domain/rubric";
import { entriesForDay, type WeekCycle } from "@domain/schedule";
import { SUBJECT_COLORS } from "@domain/subject";
import { readTermStart, writeTermStart } from "@domain/term";
import { clearSeeded, hasBeenSeeded, markSeeded } from "@domain/workspaces";
import type { AppDatabase } from ".";
import { FIRST_NAMES, LAST_NAMES } from "./seed-names";

/**
 * Coprime to `LAST_NAMES.length` (357 = 3 × 7 × 17; 101 is prime), so striding
 * by it is a permutation of the pool: every surname is used once before any is
 * used twice.
 */
const SURNAME_STRIDE = 101;

import { startOfDay } from "./sessions";
import type {
  Assignment,
  AttendanceRecord,
  BehaviourEvent,
  CriterionLevel,
  Desk,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  Room,
  RubricTemplate,
  ScheduleEntry,
  SeatingPlan,
  Session,
  Student,
  StudentGroup,
} from "./types";
import { wipeWorkspace } from "./workspace";

/**
 * Demo data so a first-time visitor sees a working gradebook instead of an
 * empty shell. Offered exactly once per workspace: the marker is kept in the
 * workspace registry, so a wipe (or an import of a legitimately empty backup)
 * leaves the workspace empty instead of bringing the demo school back on the
 * next reload.
 *
 * The demo teacher teaches **éducation musicale**, which is why the school is
 * a whole collège rather than two classes: music is an hour a week for every
 * pupil in the building, so this teacher's roster IS the school — sixteen
 * classes, 360 pupils, two salles. That shape is what the app has to survive,
 * and a two-class demo never showed it.
 */

/** 6e through 3e, four classes each — a collège of 360. */
const LEVELS = ["6e", "5e", "4e", "3e"] as const;
const CLASS_LETTERS = ["A", "B", "C", "D"] as const;
/** Per letter, so every level holds 90 and the school holds exactly 360. */
const CLASS_SIZES = [24, 23, 22, 21];

/**
 * The appreciation a pupil gets, banded by the same aptitude that drives their
 * marks. Three bands rather than one string, because an appreciation that says
 * "Travail sérieux" under a 6/20 is the demo contradicting itself.
 */
const APPRECIATIONS = {
  strong: [
    "Très bonne oreille, chante juste et entraîne le groupe.",
    "Élève investi, moteur dans le projet musical.",
    "Travail sérieux et régulier. Continuez ainsi.",
  ],
  middle: [
    "Ensemble correct. Peut encore gagner en assurance à l'oral.",
    "Participation irrégulière, mais du sérieux quand il s'y met.",
    "Des progrès sur l'écoute. À confirmer au prochain trimestre.",
  ],
  weak: [
    "Doit se concentrer davantage pendant les séances.",
    "Participation insuffisante, bavardages fréquents.",
    "Matériel souvent oublié. Le travail est à reprendre.",
  ],
} as const;

/** Plausible journal text. Deliberately mundane — a log, not a lesson plan. */
const DEMO_DIARY = [
  "Premier cours : présentation du programme et test d'écoute. Groupe volontaire dans l'ensemble.",
  "Mise en place du chant de rentrée. Le refrain ne tient pas encore — reprendre par pupitre.",
  "Écoute du Boléro. Bonne attention, à réexploiter pour le travail sur le crescendo.",
];

/**
 * How far back the séance history may reach.
 *
 * The window starts at the rentrée, which is the honest answer — but a
 * workspace seeded in June would then generate every lesson since September,
 * some fifteen thousand attendance rows for a demo nobody asked to be
 * exhaustive. The cap only ever binds for a workspace created late; seeded in
 * the first weeks of term, which is when a demo is usually met, it does
 * nothing and the history genuinely starts at the rentrée.
 */
const MAX_HISTORY_DAYS = 60;

/**
 * The rentrée: 3 September of the current school year.
 *
 * A demo seeded in February belongs to the year that began the previous
 * September, so the month decides which one — otherwise the A/B parity anchor
 * would jump forward mid-year and every fortnightly lesson would swap weeks.
 */
function startOfSchoolYear(ms: number): number {
  const d = new Date(ms);
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return startOfDay(new Date(year, 8, 3).getTime());
}

/** Deterministic pseudo-random so the demo looks the same on every device. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Picks from `items` by cumulative weight; the last item is the fallback. */
function weightedPick<T extends string>(
  items: readonly T[],
  weights: readonly number[],
  roll: number,
): T {
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i];
    if (roll < acc) return items[i];
  }
  return items[items.length - 1];
}

/**
 * A mark out of `max`, from the pupil's aptitude plus a little noise.
 *
 * The noise matters: an aptitude that mapped straight onto every mark would
 * give each pupil the same score in every column, which reads as a bug rather
 * than as a pupil. It is small enough that the ordering survives it.
 */
function markFor(aptitude: number, max: number, noise: number): number {
  const base = 0.2 + aptitude * 0.72 + (noise - 0.5) * 0.16;
  const clamped = Math.min(1, Math.max(0, base));
  return Math.round(clamped * max * 2) / 2;
}

/** The days from `from` to `to` inclusive, oldest first, walking the calendar. */
function daysFrom(from: number, to: number): number[] {
  const days: number[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = nextDay(cursor);
  }
  return days;
}

export async function seedIfEmpty(db: AppDatabase, workspaceId: string): Promise<boolean> {
  if (hasBeenSeeded(workspaceId)) return false;
  // Marked before the emptiness check too, so a workspace that already held
  // data when this marker was introduced is never seeded on top of it.
  markSeeded(workspaceId);
  if ((await db.classes.count()) > 0) return false;

  const now = Date.now();
  const random = makeRandom(20260903);
  const id = () => crypto.randomUUID();

  // ---- the collège -------------------------------------------------------
  const classes = LEVELS.flatMap((level) =>
    CLASS_LETTERS.map((letter) => ({
      id: id(),
      name: `${level[0]}°${letter}`,
      level,
      createdAt: now,
      updatedAt: now,
    })),
  );

  // One subject: this teacher teaches one thing, to everybody.
  const subject = {
    id: id(),
    name: "Éducation musicale",
    color: SUBJECT_COLORS[6],
    createdAt: now,
    updatedAt: now,
  };
  const subjects = [subject];

  /**
   * One latent value per pupil, in [0, 1].
   *
   * Marks, behaviour, attendance and the appreciation all read from it, so a
   * struggling pupil is struggling CONSISTENTLY. Drawn independently per
   * surface, the demo would show a pupil failing the carnet while the
   * behaviour log called them exemplary, and neither would read as a person.
   */
  const aptitude = new Map<string, number>();

  const students: Student[] = [];
  classes.forEach((schoolClass, classIndex) => {
    const size = CLASS_SIZES[classIndex % CLASS_SIZES.length];
    for (let i = 0; i < size; i++) {
      const studentId = id();
      // Walks both pools out of step, so no two pupils in the school share a
      // full name even though the first-name pool is far smaller than the
      // roster.
      //
      // The surname STRIDES the pool rather than reading it in order, and that
      // is not decoration. Pupils are created class by class, so reading
      // straight through handed 6°A every surname beginning with A and 6°B
      // every one beginning with B — a roster no school has. It also parked
      // the three siblings the pool's length produces on the first three names
      // in the alphabet, where a reader meets all three at once. A stride
      // coprime to the pool length still visits every surname exactly once, so
      // nothing is lost and both giveaways go: each class draws from the whole
      // alphabet, and the pairs fall wherever the arithmetic puts them.
      const n = students.length;
      const block = Math.floor(n / LAST_NAMES.length);
      aptitude.set(studentId, random());
      students.push({
        id: studentId,
        classId: schoolClass.id,
        lastName: LAST_NAMES[(n * SURNAME_STRIDE) % LAST_NAMES.length],
        firstName: FIRST_NAMES[(n + block * 7) % FIRST_NAMES.length],
        // A drawing, not a photograph — see `@domain/avatar`. About a third of
        // the roster has none, which is both what mid-September looks like and
        // what keeps the initials fallback on screen.
        photo: hasAvatar(studentId)
          ? new Blob([avatarSvg(studentId)], { type: "image/svg+xml" })
          : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  // ---- carnets -----------------------------------------------------------
  const gradebooks: Gradebook[] = classes.map((schoolClass) => ({
    id: id(),
    classId: schoolClass.id,
    subjectId: subject.id,
    name: defaultGradebookName(subject.name, schoolClass.name),
    createdAt: now,
    updatedAt: now,
  }));

  const periods: Period[] = [];
  const columns: GradeColumn[] = [];
  const grades: Grade[] = [];

  for (const gradebook of gradebooks) {
    const gradebookPeriods = DEFAULT_PERIOD_NAMES.map((name, order) => ({
      id: id(),
      gradebookId: gradebook.id,
      name,
      order,
    }));
    periods.push(...gradebookPeriods);

    const firstPeriod = gradebookPeriods[0];
    const specs: Array<Pick<GradeColumn, "type" | "label" | "weight" | "max">> = [
      { type: "numeric", label: "Chant", weight: 1, max: 20 },
      { type: "numeric", label: "Écoute", weight: 1, max: 20 },
      // Created and deliberately left EMPTY: a column the teacher has set up
      // for later. It is what a carnet looks like in the first weeks, and it
      // exercises the unmarked-column path the other four never reach.
      { type: "numeric", label: "Projet musical", weight: 2, max: 20 },
      { type: "checkbox", label: "Matériel", weight: 1, max: 20 },
      { type: "text", label: "Appréciation", weight: 1, max: 20 },
    ];

    const gradebookColumns = specs.map((spec, order) => ({
      id: id(),
      gradebookId: gradebook.id,
      periodId: firstPeriod.id,
      order,
      date: now - (specs.length - order) * 24 * 60 * 60 * 1000,
      ...spec,
    }));
    columns.push(...gradebookColumns);

    const gradebookStudents = students.filter((s) => s.classId === gradebook.classId);
    for (const student of gradebookStudents) {
      const apt = aptitude.get(student.id) ?? 0.5;
      for (const column of gradebookColumns) {
        if (column.label === "Projet musical") continue;
        // Leave roughly one cell in eight empty, as a real carnet has holes.
        if (random() < 0.12) continue;

        if (column.type === "numeric") {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "numeric", value: markFor(apt, column.max, random()) },
            updatedAt: now,
          });
        } else if (column.type === "checkbox") {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            // The pupil who forgets their material is the pupil who struggles.
            value: { type: "checkbox", value: random() < 0.35 + apt * 0.6 },
            updatedAt: now,
          });
        } else if (column.type === "text") {
          const band = apt > 0.72 ? "strong" : apt < 0.3 ? "weak" : "middle";
          const options = APPRECIATIONS[band];
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: {
              type: "text",
              value: options[Math.floor(random() * options.length)] ?? options[0],
            },
            updatedAt: now,
          });
        }
      }
    }
  }

  // ---- rubric ------------------------------------------------------------
  const rubricTemplate: RubricTemplate = {
    id: id(),
    name: "Projet musical",
    criteria: ["Justesse", "Rythme", "Écoute", "Engagement"].map((label) => ({
      id: id(),
      label,
    })),
    createdAt: now,
    updatedAt: now,
  };

  const criterionLevels: CriterionLevel[] = [];

  for (const gradebook of gradebooks) {
    const gradebookPeriods = periods.filter((p) => p.gradebookId === gradebook.id);
    const firstPeriod = gradebookPeriods.sort((a, b) => a.order - b.order)[0];
    const existing = columns.filter((c) => c.gradebookId === gradebook.id);
    const rubricColumn: GradeColumn = {
      id: id(),
      gradebookId: gradebook.id,
      periodId: firstPeriod.id,
      type: "rubric",
      label: "Grille projet musical",
      weight: 1,
      max: 20,
      order: existing.length,
      // Inside the seeded history window, like every other column: a grille
      // happened on a day.
      date: now - 24 * 60 * 60 * 1000,
      // Fresh ids, never the template's: a level written against one column
      // must not be readable from another, and improving the template later
      // must not reach a grille already graded.
      criteria: rubricTemplate.criteria.map((c) => ({ id: id(), label: c.label })),
    };
    columns.push(rubricColumn);

    for (const student of students.filter((s) => s.classId === gradebook.classId)) {
      const apt = aptitude.get(student.id) ?? 0.5;
      for (const criterion of rubricColumn.criteria ?? []) {
        if (random() > 2 / 3) continue;
        const index = Math.min(
          RUBRIC_LEVELS.length - 1,
          Math.floor(apt * RUBRIC_LEVELS.length + (random() - 0.5)),
        );
        criterionLevels.push({
          columnId: rubricColumn.id,
          criterionId: criterion.id,
          studentId: student.id,
          level: RUBRIC_LEVELS[Math.max(0, index)],
          updatedAt: now,
        });
      }
    }
  }

  // ---- the salles --------------------------------------------------------
  //
  // TWO salles, eight classes each — because what the salle/plan split buys is
  // several classes at the SAME furniture with an arrangement each, and a demo
  // showing that once shows it as well as a demo showing it twice while
  // leaving /salles a grid of one card. Two also make the page do its job: a
  // teacher recognises 101 by its rows and 102 by its arc long before reading
  // either name, which is the whole argument for drawing each card from its
  // own desks, and a single seeded salle could never test it.
  //
  // Deliberately NOT one salle per class. Sixteen rooms of furniture nobody
  // shares is the arrangement the split exists to argue against, and it would
  // make every thumbnail identical.
  //
  // 101 is the grid the demo has always had; 102 is an arc of three bowed rows
  // of ten. `seatCount` for an arc is `perRow * rows`, so 30 is exact.
  const roomShapes: { name: string; template: RoomTemplate; levels: string[] }[] = [
    { name: "101", template: DEFAULT_TEMPLATE, levels: ["6e", "5e"] },
    { name: "102", template: { id: "arc", perRow: 10, rows: 3, curve: 3 }, levels: ["4e", "3e"] },
  ];

  const rooms: Room[] = [];
  const desks: Desk[] = [];
  /** Which salle a class is taught in, and the desks it may sit at. */
  const salleOf = new Map<string, { roomId: string; desks: Desk[] }>();

  for (const { name, template, levels } of roomShapes) {
    const shape = buildRoom(template);
    const roomId = id();
    rooms.push({
      id: roomId,
      name,
      width: shape.width,
      height: shape.height,
      createdAt: now,
      updatedAt: now,
    });
    const roomDesks: Desk[] = shape.positions.map((position) => ({
      id: id(),
      roomId,
      x: position.x,
      y: position.y,
    }));
    desks.push(...roomDesks);
    for (const schoolClass of classes) {
      if (levels.includes(schoolClass.level)) {
        salleOf.set(schoolClass.id, { roomId, desks: roomDesks });
      }
    }
  }

  const seatingPlans: SeatingPlan[] = [];
  const assignments: Assignment[] = [];
  for (const schoolClass of classes) {
    const salle = salleOf.get(schoolClass.id);
    // Every level is named in `roomShapes`, so a class with no salle means the
    // two lists have drifted apart — which would silently seat nobody rather
    // than fail.
    if (!salle) throw new Error(`no salle for ${schoolClass.name}`);
    const planId = id();
    seatingPlans.push({
      id: planId,
      classId: schoolClass.id,
      roomId: salle.roomId,
      updatedAt: now,
    });
    // Reading order, and only as far as the furniture goes: a class larger
    // than the salle leaves its tail in the rail, which is what a teacher
    // would see.
    students
      .filter((s) => s.classId === schoolClass.id)
      .slice(0, salle.desks.length)
      .forEach((student, i) => {
        assignments.push({ planId, deskId: salle.desks[i].id, studentId: student.id });
      });
  }

  // ---- the timetable -----------------------------------------------------
  //
  // One hour a week per class, which is what éducation musicale is, laid out
  // on a real collège's bell times rather than on the hour. That is the point
  // of the shape: M3 begins at 10h05 after the récréation and the afternoon
  // at 13h30, so a timetable is NOT a stack of whole hours, and a demo that
  // pretended otherwise never showed the grid a block it had to place between
  // two lines.
  //
  // Four entries run à la quinzaine, not one. Two of them — 5°D and 3°B —
  // share Tuesday afternoon on opposite weeks, which is what a teacher
  // splitting a group actually does and what makes the A/B mechanism visible
  // without anyone having to build it first.
  //
  // Two adjacencies are deliberate. Thursday's 4°B ends at 11h00 and 3°A
  // begins at 11h05: consecutive, not a clash, and the demo says so. And
  // mercredi après-midi is empty, as it is in every collège in France.
  //
  // Weekdays are ISO (1 = Monday); minutes are from midnight. `minutes` is
  // the lesson's length and defaults to the 55-minute hour — only the chorale
  // is longer.
  const scheduleShape: {
    className: string;
    weekday: number;
    start: number;
    cycle: WeekCycle;
    minutes?: number;
  }[] = [
    // Lundi — a full morning, a hole at 10h05, one lesson after lunch.
    { className: "6°A", weekday: 1, start: 8 * 60, cycle: "all" },
    { className: "6°B", weekday: 1, start: 9 * 60, cycle: "all" },
    { className: "5°C", weekday: 1, start: 11 * 60 + 5, cycle: "all" },
    { className: "4°D", weekday: 1, start: 13 * 60 + 30, cycle: "all" },
    // Mardi — and the shared slot at 14h30.
    { className: "5°A", weekday: 2, start: 9 * 60, cycle: "all" },
    { className: "5°B", weekday: 2, start: 10 * 60 + 5, cycle: "all" },
    { className: "5°D", weekday: 2, start: 14 * 60 + 30, cycle: "A" },
    { className: "3°B", weekday: 2, start: 14 * 60 + 30, cycle: "B" },
    // Mercredi — morning only.
    { className: "4°C", weekday: 3, start: 8 * 60, cycle: "all" },
    { className: "6°C", weekday: 3, start: 9 * 60, cycle: "all" },
    { className: "6°D", weekday: 3, start: 10 * 60 + 5, cycle: "all" },
    // Jeudi — 4°B runs into 3°A without a gap.
    { className: "4°A", weekday: 4, start: 9 * 60, cycle: "all" },
    { className: "4°B", weekday: 4, start: 10 * 60 + 5, cycle: "all" },
    { className: "3°A", weekday: 4, start: 11 * 60 + 5, cycle: "all" },
    // Vendredi — two troisièmes on alternating weeks, then the chorale.
    { className: "3°C", weekday: 5, start: 10 * 60 + 5, cycle: "A" },
    { className: "3°D", weekday: 5, start: 11 * 60 + 5, cycle: "B" },
    // The chorale, every week and nearly two hours of it: the one lesson in
    // the demo that is visibly longer than an hour.
    { className: "3°D", weekday: 5, start: 15 * 60 + 40, cycle: "all", minutes: 110 },
  ];

  const classByName = new Map(classes.map((c) => [c.name, c]));
  const scheduleEntries: ScheduleEntry[] = scheduleShape.map((entry) => {
    const schoolClass = classByName.get(entry.className);
    if (!schoolClass) throw new Error(`timetable names an unknown class: ${entry.className}`);
    return {
      id: id(),
      classId: schoolClass.id,
      subjectId: subject.id,
      weekday: entry.weekday,
      startMinute: entry.start,
      endMinute: entry.start + (entry.minutes ?? 55),
      weekCycle: entry.cycle,
      // The salle its class is actually taught in, not a single shared one:
      // a lesson names where it happens, and with two salles that is now a
      // fact the timetable can get wrong.
      roomId: salleOf.get(schoolClass.id)?.roomId,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Without an anchor the demo's A and B lessons would never appear, and the
  // feature would look broken rather than unconfigured. Seeded only if the
  // teacher has not already chosen one — their date always wins.
  const rentree = startOfSchoolYear(now);
  if (readTermStart() === null) writeTermStart(rentree);
  const termStart = readTermStart() ?? rentree;

  // ---- the séances actually taught ---------------------------------------
  //
  // A séance exists ONLY where a scheduled lesson genuinely fell on a day that
  // has already happened. The timetable predicts and never pre-creates, so a
  // class whose hour is on a weekday the term has not yet reached has no
  // séance at all — which is not a gap in the demo, it is the demo showing the
  // distinction the whole schedule design rests on.
  //
  // `entriesForDay` is the same function the class page and Aujourd'hui read
  // with, so what is seeded and what is displayed cannot disagree about A/B.
  const today = startOfDay(now);
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const firstDay = Math.max(rentree, earliest);

  const sessions: Session[] = [];
  const attendance: AttendanceRecord[] = [];
  const behaviourEvents: BehaviourEvent[] = [];

  for (const day of daysFrom(firstDay, today)) {
    for (const entry of entriesForDay(scheduleEntries, termStart, day)) {
      const classStudents = students.filter((s) => s.classId === entry.classId);
      if (classStudents.length === 0) continue;

      const session: Session = {
        id: id(),
        classId: entry.classId,
        date: day,
        startsAt: entry.startMinute,
        endsAt: entry.endMinute,
        subjectId: entry.subjectId,
        createdAt: day,
      };
      sessions.push(session);

      for (const student of classStudents) {
        const apt = aptitude.get(student.id) ?? 0.5;
        // The pupil who struggles is the pupil who is late and absent.
        const present = 0.8 + apt * 0.17;
        attendance.push({
          sessionId: session.id,
          studentId: student.id,
          value: weightedPick(
            ATTENDANCE_VALUES,
            [present, (1 - present) * 0.4, (1 - present) * 0.4, (1 - present) * 0.2],
            random(),
          ),
          updatedAt: now,
        });
      }

      // Four or five remarks a lesson, aimed by aptitude: green goes to the
      // strong, yellow and red to those who are struggling.
      const remarks = 4 + Math.floor(random() * 2);
      for (let i = 0; i < remarks; i++) {
        const student = classStudents[Math.floor(random() * classStudents.length)];
        const apt = aptitude.get(student.id) ?? 0.5;
        const type = weightedPick(
          BEHAVIOUR_TYPES,
          [0.1 + apt * 0.7, 0.45 - apt * 0.3, 0.35 - apt * 0.3, 0.1],
          random(),
        );
        behaviourEvents.push({
          id: id(),
          sessionId: session.id,
          studentId: student.id,
          classId: entry.classId,
          type,
          createdAt: day,
        });
      }
    }
  }

  // ---- groups ------------------------------------------------------------
  //
  // Two working groups on one class, splitting its roster in half, so the
  // feature is visible in the demo without touching all sixteen.
  const groupClass = classes[0];
  const groupClassStudents = students.filter((s) => s.classId === groupClass.id);
  const half = Math.ceil(groupClassStudents.length / 2);
  const studentGroups: StudentGroup[] = [
    {
      id: id(),
      classId: groupClass.id,
      name: "Pupitre 1",
      color: SUBJECT_COLORS[2],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      classId: groupClass.id,
      name: "Pupitre 2",
      color: SUBJECT_COLORS[3],
      createdAt: now,
      updatedAt: now,
    },
  ];
  const groupMembers: GroupMember[] = [
    ...groupClassStudents
      .slice(0, half)
      .map((student) => ({ groupId: studentGroups[0].id, studentId: student.id })),
    ...groupClassStudents
      .slice(half)
      .map((student) => ({ groupId: studentGroups[1].id, studentId: student.id })),
  ];

  // A few journal notes on lessons already taught, so the feature is visible
  // rather than being an empty calendar. Written straight onto real
  // `Session.note` fields — a note lives on the lesson it was written about
  // rather than on a day-keyed row of its own.
  sessions.slice(0, DEMO_DIARY.length).forEach((session, index) => {
    session.note = DEMO_DIARY[index];
  });

  await db.transaction(
    "rw",
    [
      db.classes,
      db.students,
      db.subjects,
      db.gradebooks,
      db.periods,
      db.columns,
      db.grades,
      db.sessions,
      db.attendance,
      db.behaviourEvents,
      db.rooms,
      db.desks,
      db.seatingPlans,
      db.assignments,
      db.rubricTemplates,
      db.criterionLevels,
      db.studentGroups,
      db.groupMembers,
      db.scheduleEntries,
    ],
    async () => {
      await db.classes.bulkAdd(classes);
      await db.subjects.bulkAdd(subjects);
      await db.students.bulkAdd(students);
      await db.gradebooks.bulkAdd(gradebooks);
      await db.periods.bulkAdd(periods);
      await db.columns.bulkAdd(columns);
      await db.grades.bulkPut(grades);
      await db.sessions.bulkAdd(sessions);
      await db.attendance.bulkPut(attendance);
      await db.behaviourEvents.bulkAdd(behaviourEvents);
      await db.rooms.bulkAdd(rooms);
      await db.desks.bulkAdd(desks);
      await db.seatingPlans.bulkAdd(seatingPlans);
      await db.assignments.bulkPut(assignments);
      await db.rubricTemplates.add(rubricTemplate);
      await db.criterionLevels.bulkPut(criterionLevels);
      await db.studentGroups.bulkAdd(studentGroups);
      await db.groupMembers.bulkPut(groupMembers);
      await db.scheduleEntries.bulkAdd(scheduleEntries);
    },
  );

  return true;
}

/**
 * Empty the workspace and lay the demo school down over it.
 *
 * `wipeWorkspace` alone leaves an empty shell, and `seedIfEmpty` alone
 * refuses a workspace already marked seeded — which every workspace that has
 * ever been used is. So the reset does all three in order, and the middle
 * step is the one that is easy to leave out: without `clearSeeded` this wipes
 * the teacher's school and then seeds NOTHING, which looks exactly like the
 * wipe they did not ask for. A test covers precisely that.
 *
 * Deliberately not a transaction across the two: `wipeWorkspace` and the seed
 * each own their own, and an interruption between them leaves an empty
 * workspace — recoverable by running the reset again, which is what an empty
 * workspace invites anyway.
 */
export async function resetToFixture(db: AppDatabase, workspaceId: string): Promise<void> {
  await wipeWorkspace(db);
  clearSeeded(workspaceId);
  await seedIfEmpty(db, workspaceId);
}
