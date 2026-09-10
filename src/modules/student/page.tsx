import { useDb } from "@db/provider";
import { sessionsForClass } from "@db/sessions";
import { neighbours, studentSequence } from "@domain/student-list";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { BehaviourBlock } from "./components/behaviour-block";
import { CarnetSection } from "./components/carnet-section";
import { PresenceBlock } from "./components/presence-block";
import { StudentHeader } from "./components/student-header";

/**
 * One pupil, across time.
 *
 * Every other surface in this app is class-major (the grid, the roster) or
 * séance-major (the card, the register). This is the transpose: one child, every
 * carnet, every lesson — the shape a conseil de classe needs, which is the
 * moment this page is built for.
 *
 * The page loads the PUPIL once — the pupil, their class, their classmates and
 * their séances — and hands that down, the way `ClassPage` does: a child that
 * re-fetched any of those would flash "Chargement…" over a pupil already on
 * screen every time something changed. Carnets are a narrower case: each
 * `CarnetSection` runs its own live query, scoped to one gradebook, and that
 * is deliberate rather than a gap — see its own docstring for why re-querying
 * there is still safe.
 */
export function StudentPage({
  studentId,
  q,
  classe,
  groupe,
  sort,
  dir,
}: {
  studentId: string;
  q?: string;
  classe?: string;
  groupe?: string;
  sort?: string;
  dir?: string;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const listParams = { q, classe, groupe, sort, dir };

  // An explicit null distinguishes "no such pupil" from "still loading":
  // useLiveQuery gives undefined for both, and the page would otherwise sit on
  // "Chargement…" forever for a pupil who has been deleted.
  const student = useLiveQuery(
    async () => (await db.students.get(studentId)) ?? null,
    [db, studentId],
  );

  const schoolClass = useLiveQuery(
    async () => (student ? ((await db.classes.get(student.classId)) ?? null) : null),
    [db, student],
  );

  const sessions = useLiveQuery(
    async () => (student ? await sessionsForClass(db, student.classId) : []),
    [db, student],
  );

  const classmates = useLiveQuery(
    async () =>
      student ? await db.students.where("classId").equals(student.classId).toArray() : [],
    [db, student],
  );

  // The set the arrows walk. `classe` may name another class entirely — a
  // teacher stepping through an unfiltered /students — so the candidates are
  // every pupil in the workspace, narrowed by the params rather than by this
  // pupil's class.
  const sequence = useLiveQuery(async () => {
    const [students, classes] = await Promise.all([
      db.students.orderBy("lastName").toArray(),
      db.classes.toArray(),
    ]);
    const names = new Map(classes.map((c) => [c.id, c.name]));
    // Only loaded when a group is actually named: the arrows walk the list the
    // teacher arrived from, and most arrivals name no group at all.
    const groups = groupe === undefined ? [] : await db.studentGroups.toArray();
    const memberships = groupe === undefined ? [] : await db.groupMembers.toArray();
    return studentSequence(
      students.map((s) => ({ ...s, classLabel: names.get(s.classId) ?? "" })),
      groups,
      memberships,
      { q, classe, groupe, sort, dir },
    );
  }, [db, q, classe, groupe, sort, dir]);

  const carnets = useLiveQuery(async () => {
    if (!student) return [];
    const gradebooks = await db.gradebooks.where("classId").equals(student.classId).toArray();
    const subjects = await db.subjects.toArray();
    return gradebooks.map((gradebook) => ({
      gradebook,
      subject: subjects.find((s) => s.id === gradebook.subjectId),
    }));
  }, [db, student]);

  if (
    student === undefined ||
    schoolClass === undefined ||
    sessions === undefined ||
    classmates === undefined ||
    sequence === undefined ||
    carnets === undefined
  ) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (student === null) return <p className="text-text-muted">{t("student.notFound")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <StudentHeader
        student={student}
        schoolClass={schoolClass}
        studentCount={classmates.length}
        listParams={listParams}
        position={neighbours(sequence, student.id)}
      />

      {carnets.length === 0 ? (
        <p className="text-sm text-text-faint">{t("student.noCarnets")}</p>
      ) : (
        carnets.map(({ gradebook, subject }) => (
          <CarnetSection
            key={gradebook.id}
            gradebook={gradebook}
            subject={subject}
            student={student}
          />
        ))
      )}

      <PresenceBlock student={student} sessions={sessions} />

      <BehaviourBlock student={student} sessions={sessions} />
    </div>
  );
}
