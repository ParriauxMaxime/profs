import type { SchoolClass } from "@db";
import { useDb } from "@db/provider";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1),
  level: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Creates a class from the dashboard, renames one from the class page.
 *
 * Bound to a record when editing, so every call site must give it a `key` that
 * changes with the class — react-hook-form reads `defaultValues` once, at
 * mount.
 */
export function ClassForm({
  schoolClass,
  onDone,
}: {
  schoolClass?: SchoolClass;
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
    defaultValues: { name: schoolClass?.name ?? "", level: schoolClass?.level ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const now = Date.now();
    // An empty level is dropped rather than stored as "": the field is
    // optional in the row type, and a blank string would print as a stray
    // separator wherever the level is shown beside the name.
    const level = values.level.length > 0 ? values.level : undefined;
    if (schoolClass) {
      await db.classes.update(schoolClass.id, { name: values.name, level, updatedAt: now });
    } else {
      await db.classes.add({
        id: crypto.randomUUID(),
        name: values.name,
        level,
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
          <span className="text-sm text-text-muted">{t("class.name")}</span>
          <input className="field" placeholder={t("class.namePlaceholder")} {...register("name")} />
          {errors.name && <span className="text-danger text-sm">{t("class.nameRequired")}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("class.level")}</span>
          <input
            className="field"
            placeholder={t("class.levelPlaceholder")}
            {...register("level")}
          />
        </label>
      </div>
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
