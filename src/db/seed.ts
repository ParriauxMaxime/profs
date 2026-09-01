import { ATTENDANCE_VALUES } from "@domain/attendance";
import { BEHAVIOUR_TYPES } from "@domain/behaviour";
import { defaultGradebookName } from "@domain/gradebook/naming";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { buildSeats, DEFAULT_COLS, DEFAULT_ROWS } from "@domain/seating";
import { SUBJECT_COLORS } from "@domain/subject";
import { hasBeenSeeded, markSeeded } from "@domain/workspaces";
import type { AppDatabase } from ".";
import { startOfDay } from "./sessions";
import type {
  AttendanceRecord,
  BehaviourEvent,
  Grade,
  Gradebook,
  GradeColumn,
  Period,
  Seat,
  SeatingLayout,
  Session,
  Student,
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
    seatingLayouts.push({
      id: layoutId,
      classId: schoolClass.id,
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      updatedAt: now,
    });
    const classSeats = buildSeats(layoutId, DEFAULT_ROWS, DEFAULT_COLS);
    classStudents.forEach((student, i) => {
      if (i < classSeats.length) classSeats[i].studentId = student.id;
    });
    seats.push(...classSeats);

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
    },
  );

  return true;
}
