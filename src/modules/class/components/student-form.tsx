import type { Student } from "@db";
import { useDb } from "@db/provider";
import { MAX_STUDENTS_PER_CLASS, remainingCapacity } from "@domain/class-size";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useEscape } from "../../shared/use-escape";

const schema = z.object({
  lastName: z.string().trim().min(1),
  firstName: z.string().trim(),
  notes: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function StudentForm({
  classId,
  student,
  studentCount,
  showNotes = true,
  onDone,
}: {
  classId: string;
  student?: Student;
  studentCount: number;
  /**
   * Whether this form owns the pupil's notes, as it does on the roster and
   * on the class page.
   *
   * The pupil page passes false, because its header keeps a notes field
   * permanently open beside this form. Two editors of one fact on one screen
   * is the duplication this app refuses everywhere else, and the second one
   * was worse than redundant: react-hook-form captures its defaults at mount,
   * so an accommodation typed into the header while this form sat open was
   * written back to whatever the notes had been when the form opened — with
   * no warning, on the field that carries PAP, PPRE and tiers-temps.
   *
   * Hidden means ABSENT from the write, not written blank. The captured
   * default is still sitting in the form's values; leaving `notes` out of the
   * update is what keeps it from reaching the row.
   */
  showNotes?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lastName: student?.lastName ?? "",
      firstName: student?.firstName ?? "",
      notes: student?.notes ?? "",
    },
  });

  useEscape(onDone);

  // Only an ADD can breach the ceiling. Editing an existing pupil must stay
  // possible in a class that is already at or over it — otherwise a teacher
  // who imported an over-sized roster could no longer correct a name in it.
  const full = student === undefined && remainingCapacity(studentCount) === 0;

  const onSubmit = handleSubmit(async (values) => {
    if (full) return;
    const now = Date.now();
    // Blank stores as absent, never as "". That is the husk `writeGrade` and
    // `setSessionNote` both refuse, and `setStudentNotes` — the other writer
    // of this very field — already stored it this way, so a note cleared here
    // and a note cleared from a card read the same afterwards.
    const notes = showNotes ? values.notes || undefined : undefined;
    if (student) {
      await db.students.update(student.id, {
        lastName: values.lastName,
        firstName: values.firstName,
        ...(showNotes ? { notes } : {}),
        updatedAt: now,
      });
    } else {
      await db.students.add({
        id: crypto.randomUUID(),
        classId,
        lastName: values.lastName,
        firstName: values.firstName,
        notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("student.lastName")}</span>
          <input
            className="field"
            // biome-ignore lint/a11y/noAutofocus: opens ready to type — one-handed, mid-lesson, no spare tap to reach the field.
            autoFocus
            aria-invalid={errors.lastName ? true : undefined}
            {...register("lastName")}
          />
          {errors.lastName && (
            <span role="alert" className="text-danger text-sm">
              {t("student.lastNameRequired")}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("student.firstName")}</span>
          <input className="field" {...register("firstName")} />
        </label>
      </div>
      {showNotes && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("student.notes")}</span>
          <textarea className="field" rows={2} {...register("notes")} />
        </label>
      )}
      {full && (
        <p role="alert" className="text-danger text-sm">
          {t("class.rosterFull", { max: MAX_STUDENTS_PER_CLASS })}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting || full}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
