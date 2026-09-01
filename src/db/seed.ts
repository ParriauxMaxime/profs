import { defaultGradebookName } from "@domain/gradebook/naming";
import { DEFAULT_PERIOD_NAMES } from "@domain/gradebook/period";
import { SUBJECT_COLORS } from "@domain/subject";
import { hasBeenSeeded, markSeeded } from "@domain/workspaces";
import type { AppDatabase } from ".";
import type { Grade, Gradebook, GradeColumn, Period, Student } from "./types";

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

    // Six columns, all in Trimestre 1, exercising five of the six column types.
    const firstPeriod = gradebookPeriods[0];
    const specs: Array<Pick<GradeColumn, "type" | "label" | "weight" | "max">> = [
      { type: "numeric", label: "DS 1", weight: 2, max: 20 },
      { type: "numeric", label: "DS 2", weight: 2, max: 20 },
      { type: "numeric", label: "Interro", weight: 1, max: 10 },
      { type: "checkbox", label: "Devoir rendu", weight: 1, max: 20 },
      { type: "attendance", label: "Présence", weight: 1, max: 20 },
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
        } else if (column.type === "attendance") {
          const roll = random();
          const value = roll > 0.9 ? "absent" : roll > 0.82 ? "late" : "present";
          grades.push({
            gradebookId: gradebook.id,
            columnId: column.id,
            studentId: student.id,
            value: { type: "attendance", value },
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

  await db.transaction(
    "rw",
    [db.classes, db.students, db.subjects, db.gradebooks, db.periods, db.columns, db.grades],
    async () => {
      await db.classes.bulkAdd(classes);
      await db.subjects.bulkAdd(subjects);
      await db.students.bulkAdd(students);
      await db.gradebooks.bulkAdd(gradebooks);
      await db.periods.bulkAdd(periods);
      await db.columns.bulkAdd(columns);
      await db.grades.bulkPut(grades);
    },
  );

  return true;
}
