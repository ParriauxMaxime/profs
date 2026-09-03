import { ATTENDANCE_VALUES } from "@domain/attendance";
import { BEHAVIOUR_TYPES } from "@domain/behaviour";
import { defaultGradebookName } from "@domain/gradebook/naming";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { buildRoom, DEFAULT_TEMPLATE } from "@domain/room-templates";
import { RUBRIC_LEVELS } from "@domain/rubric";
import type { WeekCycle } from "@domain/schedule";
import { SUBJECT_COLORS } from "@domain/subject";
import { readTermStart, writeTermStart } from "@domain/term";
import { hasBeenSeeded, markSeeded } from "@domain/workspaces";
import type { AppDatabase } from ".";
import { startOfDay } from "./sessions";
import type {
  AttendanceRecord,
  BehaviourEvent,
  DiaryEntry,
  Grade,
  Gradebook,
  GradeColumn,
  GroupMember,
  Period,
  RubricAssessment,
  RubricScore,
  RubricTemplate,
  ScheduleEntry,
  Seat,
  SeatingLayout,
  Session,
  Student,
  StudentGroup,
} from "./types";

/**
 * Demo data so a first-time visitor sees a working gradebook instead of an
 * empty shell. Offered exactly once per workspace: the marker is kept in the
 * workspace registry, so a wipe (or an import of a legitimately empty backup)
 * leaves the workspace empty instead of bringing the demo school back on the
 * next reload.
 */

const LAST_NAMES = [
  "Bernard",
  "Dubois",
  "Durand",
  "Fontaine",
  "Garnier",
  "Girard",
  "Lambert",
  "Leroy",
  "Martin",
  "Mercier",
  "Moreau",
  "Morel",
  "Nguyen",
  "Petit",
  "Robert",
  "Rousseau",
  "Roux",
  "Simon",
  "Thomas",
  "Vincent",
  "Blanc",
  "Chevalier",
  "Faure",
  "Perrin",
];

const FIRST_NAMES = [
  "Adam",
  "Alice",
  "Camille",
  "Chloé",
  "Élise",
  "Emma",
  "Gabriel",
  "Hugo",
  "Inès",
  "Jade",
  "Jules",
  "Léa",
  "Léo",
  "Louis",
  "Lucas",
  "Maël",
  "Manon",
  "Marie",
  "Nathan",
  "Noah",
  "Rania",
  "Sacha",
  "Théo",
  "Zoé",
];

/**
 * The 1 September on or before `ms` — the start of the school year the demo
 * data sits in. Derived rather than hard-coded so the demo still makes sense
 * whenever it is first opened.
 */
function startOfSeptember(ms: number): number {
  const d = new Date(ms);
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return startOfDay(new Date(year, 8, 1).getTime());
}

/**
 * The first day of `ms`'s month falling on `weekday` (ISO, 1 = Monday).
 *
 * Walks a day at a time rather than computing an offset: the arithmetic is
 * trivial to get wrong at a month boundary, and the demo is the first thing
 * anyone sees.
 */
function firstWeekdayOfMonth(ms: number, weekday: number): number {
  const d = new Date(ms);
  const cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  for (let i = 0; i < 7; i += 1) {
    const iso = cursor.getDay() === 0 ? 7 : cursor.getDay();
    if (iso === weekday) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return startOfDay(cursor.getTime());
}

/** Plausible journal text. Deliberately mundane — a log, not a lesson plan. */
const DEMO_DIARY = [
  "Fin du chapitre sur les fractions. Beaucoup de mal sur la mise au même dénominateur — reprendre en début d'heure la prochaine fois.",
  "Correction du contrôle. Bonne moyenne mais l'exercice 3 est passé à la trappe, à refaire autrement l'an prochain.",
  "Travail en groupes. Ça a bien marché, garder cette organisation pour la suite du chapitre.",
];

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

/** The `count` most recent weekdays at or before `fromMs`, oldest first. */
function lastWeekdays(count: number, fromMs: number): number[] {
  const days: number[] = [];
  let cursor = startOfDay(fromMs);
  while (days.length < count) {
    const weekday = new Date(cursor).getDay();
    if (weekday !== 0 && weekday !== 6) days.unshift(cursor);
    cursor -= 24 * 60 * 60 * 1000;
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
  const random = makeRandom(20260901);
  const id = () => crypto.randomUUID();

  const classes = [
    { id: id(), name: "3°B", level: "3e", createdAt: now, updatedAt: now },
    { id: id(), name: "5°A", level: "5e", createdAt: now, updatedAt: now },
  ];
  const sizes = [24, 22];

  const subjects = [
    { id: id(), name: "Mathématiques", color: SUBJECT_COLORS[0], createdAt: now, updatedAt: now },
    { id: id(), name: "Français", color: SUBJECT_COLORS[1], createdAt: now, updatedAt: now },
  ];

  const students: Student[] = [];
  classes.forEach((schoolClass, classIndex) => {
    for (let i = 0; i < sizes[classIndex]; i++) {
      students.push({
        id: id(),
        classId: schoolClass.id,
        lastName: LAST_NAMES[(i + classIndex * 7) % LAST_NAMES.length],
        firstName: FIRST_NAMES[(i * 5 + classIndex * 3) % FIRST_NAMES.length],
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  const gradebooks: Gradebook[] = classes.map((schoolClass, index) => ({
    id: id(),
    classId: schoolClass.id,
    subjectId: subjects[index].id,
    name: defaultGradebookName(subjects[index].name, schoolClass.name),
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

    // Five columns, all in Trimestre 1, exercising three of the five column
    // types (numeric, checkbox, text); letter and icon are not exercised.
    const firstPeriod = gradebookPeriods[0];
    const specs: Array<Pick<GradeColumn, "type" | "label" | "weight" | "max">> = [
      { type: "numeric", label: "DS 1", weight: 2, max: 20 },
      { type: "numeric", label: "DS 2", weight: 2, max: 20 },
      { type: "numeric", label: "Interro", weight: 1, max: 10 },
      { type: "checkbox", label: "Devoir rendu", weight: 1, max: 20 },
      { type: "text", label: "Appréciation", weight: 1, max: 20 },
    ];

    const gradebookColumns = specs.map((spec, order) => ({
      id: id(),
      gradebookId: gradebook.id,
      periodId: firstPeriod.id,
      order,
      date: now - (specs.length - order) * 7 * 24 * 60 * 60 * 1000,
      ...spec,
    }));
    columns.push(...gradebookColumns);

    const gradebookStudents = students.filter((s) => s.classId === gradebook.classId);
    for (const student of gradebookStudents) {
      for (const column of gradebookColumns) {
        // Leave roughly one cell in six empty, as a real gradebook has holes.
        if (random() < 0.17) continue;

        if (column.type === "numeric") {
          const mark = Math.round(random() * column.max * 2) / 2;
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "numeric", value: mark },
            updatedAt: now,
          });
        } else if (column.type === "checkbox") {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "checkbox", value: random() > 0.2 },
            updatedAt: now,
          });
        } else if (column.type === "text" && random() > 0.6) {
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "text", value: "Travail sérieux, continuez." },
            updatedAt: now,
          });
        }
      }
    }
  }

  // One reusable rubric template, and one assessment per gradebook built
  // from it. Levels are given to roughly two thirds of pupils per criterion
  // — a partially filled grid is a more honest demo than a complete one.
  const rubricTemplate: RubricTemplate = {
    id: id(),
    name: "Exposé oral",
    criteria: ["Clarté", "Contenu", "Support", "Interaction"].map((label) => ({
      id: id(),
      label,
    })),
    createdAt: now,
    updatedAt: now,
  };

  const rubricAssessments: RubricAssessment[] = [];
  const rubricScores: RubricScore[] = [];

  for (const gradebook of gradebooks) {
    const gradebookPeriods = periods.filter((p) => p.gradebookId === gradebook.id);
    const firstPeriod = gradebookPeriods[0];
    const assessment: RubricAssessment = {
      id: id(),
      gradebookId: gradebook.id,
      periodId: firstPeriod.id,
      name: "Exposé oral",
      date: now,
      criteria: rubricTemplate.criteria.map((c) => ({ id: id(), label: c.label })),
      createdAt: now,
      updatedAt: now,
    };
    rubricAssessments.push(assessment);

    const gradebookStudents = students.filter((s) => s.classId === gradebook.classId);
    for (const student of gradebookStudents) {
      for (const criterion of assessment.criteria) {
        if (random() > 2 / 3) continue;
        const level = RUBRIC_LEVELS[Math.floor(random() * RUBRIC_LEVELS.length)];
        rubricScores.push({
          assessmentId: assessment.id,
          criterionId: criterion.id,
          studentId: student.id,
          level,
          updatedAt: now,
        });
      }
    }
  }

  // Classroom data: a seating plan, three lessons, attendance for each and a
  // scattering of behaviour events. No photo is ever seeded here — a
  // fabricated Blob would be a fabricated photograph of a fictional child.
  const seatingLayouts: SeatingLayout[] = [];
  const seats: Seat[] = [];
  const sessions: Session[] = [];
  const attendance: AttendanceRecord[] = [];
  const behaviourEvents: BehaviourEvent[] = [];

  const weekdays = lastWeekdays(3, now);

  for (const schoolClass of classes) {
    const classStudents = students.filter((s) => s.classId === schoolClass.id);

    const layoutId = id();
    const shape = buildRoom(DEFAULT_TEMPLATE);
    seatingLayouts.push({
      id: layoutId,
      classId: schoolClass.id,
      width: shape.width,
      height: shape.height,
      updatedAt: now,
    });
    shape.positions.forEach((position, i) => {
      seats.push({
        id: id(),
        layoutId,
        x: position.x,
        y: position.y,
        studentId: classStudents[i]?.id ?? null,
      });
    });

    const classSessions = weekdays.map((date) => ({
      id: id(),
      classId: schoolClass.id,
      date,
      createdAt: date,
    }));
    sessions.push(...classSessions);

    for (const session of classSessions) {
      for (const student of classStudents) {
        // Mostly present, a scattering of the rest.
        const value = weightedPick(ATTENDANCE_VALUES, [0.87, 0.05, 0.05, 0.03], random());
        attendance.push({
          sessionId: session.id,
          studentId: student.id,
          value,
          updatedAt: now,
        });
      }
    }

    // Roughly a dozen behaviour events per class, skewed toward green/yellow.
    for (let i = 0; i < 12; i++) {
      const session = classSessions[Math.floor(random() * classSessions.length)];
      const student = classStudents[Math.floor(random() * classStudents.length)];
      const type = weightedPick(BEHAVIOUR_TYPES, [0.4, 0.35, 0.15, 0.1], random());
      behaviourEvents.push({
        id: id(),
        sessionId: session.id,
        studentId: student.id,
        classId: schoolClass.id,
        type,
        createdAt: session.date,
      });
    }
  }

  // Two working groups on one class, splitting its roster in half, so the
  // feature is visible in the demo without touching every class.
  const groupClass = classes[0];
  const groupClassStudents = students.filter((s) => s.classId === groupClass.id);
  const half = Math.ceil(groupClassStudents.length / 2);
  const studentGroups: StudentGroup[] = [
    {
      id: id(),
      classId: groupClass.id,
      name: "Groupe A",
      color: SUBJECT_COLORS[2],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: id(),
      classId: groupClass.id,
      name: "Groupe B",
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

  // A plausible week: 3°B four times, 5°A three, with one lesson on each
  // alternating cycle so the A/B mechanism is visible in the demo rather than
  // being something a teacher has to build before they can see it work.
  // Weekdays are ISO (1 = Monday); minutes are from midnight.
  const scheduleShape: {
    classIndex: number;
    weekday: number;
    start: number;
    end: number;
    cycle: WeekCycle;
    room: string;
  }[] = [
    { classIndex: 0, weekday: 1, start: 8 * 60, end: 9 * 60, cycle: "all", room: "B12" },
    { classIndex: 0, weekday: 2, start: 10 * 60, end: 11 * 60, cycle: "all", room: "B12" },
    { classIndex: 0, weekday: 4, start: 14 * 60, end: 15 * 60, cycle: "A", room: "B14" },
    { classIndex: 0, weekday: 4, start: 14 * 60, end: 15 * 60, cycle: "B", room: "Labo" },
    { classIndex: 1, weekday: 1, start: 9 * 60, end: 10 * 60, cycle: "all", room: "A03" },
    { classIndex: 1, weekday: 3, start: 11 * 60, end: 12 * 60, cycle: "all", room: "A03" },
    { classIndex: 1, weekday: 5, start: 8 * 60, end: 9 * 60, cycle: "B", room: "A03" },
  ];
  const scheduleEntries: ScheduleEntry[] = scheduleShape.map((shape) => ({
    id: id(),
    classId: classes[shape.classIndex].id,
    subjectId: subjects[shape.classIndex].id,
    gradebookId: gradebooks[shape.classIndex].id,
    weekday: shape.weekday,
    startMinute: shape.start,
    endMinute: shape.end,
    weekCycle: shape.cycle,
    room: shape.room,
    createdAt: now,
    updatedAt: now,
  }));

  // Without an anchor the demo's A and B lessons would never appear, and the
  // feature would look broken rather than unconfigured. Seeded only if the
  // teacher has not already chosen one — their date always wins.
  if (readTermStart() === null) {
    writeTermStart(startOfSeptember(now));
  }

  // A handful of journal entries on lessons already in the past, so the
  // feature is visible in the demo rather than being an empty calendar.
  // Placed on real lesson days inside the CURRENT month, which is the window
  // the agenda opens on. Counting backwards from today put them in August —
  // before the term start and outside the default view, so the demo showed an
  // empty journal while three entries sat in the database.
  const demoLessons = scheduleEntries.filter((entry) => entry.weekCycle === "all").slice(0, 3);
  const diaryEntries: DiaryEntry[] = demoLessons.map((entry, index) => ({
    classId: entry.classId,
    date: firstWeekdayOfMonth(now, entry.weekday),
    text: DEMO_DIARY[index % DEMO_DIARY.length],
    createdAt: now,
    updatedAt: now,
  }));

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
      db.seatingLayouts,
      db.seats,
      db.rubricTemplates,
      db.rubricAssessments,
      db.rubricScores,
      db.studentGroups,
      db.groupMembers,
      db.scheduleEntries,
      db.diaryEntries,
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
      await db.seatingLayouts.bulkAdd(seatingLayouts);
      await db.seats.bulkPut(seats);
      await db.rubricTemplates.add(rubricTemplate);
      await db.rubricAssessments.bulkAdd(rubricAssessments);
      await db.rubricScores.bulkPut(rubricScores);
      await db.studentGroups.bulkAdd(studentGroups);
      await db.groupMembers.bulkPut(groupMembers);
      await db.scheduleEntries.bulkAdd(scheduleEntries);
      await db.diaryEntries.bulkPut(diaryEntries);
    },
  );

  return true;
}
