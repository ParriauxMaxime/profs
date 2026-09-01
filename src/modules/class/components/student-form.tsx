import type { Student } from "@db";
import { useDb } from "@db/provider";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const schema = z.object({
  lastName: z.string().trim().min(1),
  firstName: z.string().trim(),
  notes: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export function StudentForm({
  classId,
  student,
  onDone,
}: {
  classId: string;
  student?: Student;
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

  const onSubmit = handleSubmit(async (values) => {
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
          <input className="field" {...register("lastName")} />
          {errors.lastName && (
            <span className="text-danger text-sm">{t("student.lastNameRequired")}</span>
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
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
