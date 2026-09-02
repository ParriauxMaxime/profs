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
  onDone,
}: {
  classId: string;
  student?: Student;
  studentCount: number;
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
    if (student) {
      await db.students.update(student.id, { ...values, updatedAt: now });
    } else {
      await db.students.add({
        id: crypto.randomUUID(),
        classId,
        lastName: values.lastName,
        firstName: values.firstName,
        notes: values.notes,
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
      <label className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">{t("student.notes")}</span>
        <textarea className="field" rows={2} {...register("notes")} />
      </label>
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
