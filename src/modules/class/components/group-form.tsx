import type { Student, StudentGroup } from "@db";
import { saveGroup, setGroupMembers } from "@db/groups";
import { useDb } from "@db/provider";
import { normaliseGroupName } from "@domain/group";
import { DEFAULT_SUBJECT_COLOR, SUBJECT_COLORS } from "@domain/subject";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";
import { useEscape } from "../../shared/use-escape";

/**
 * Creates a group, or renames/recolours one and edits its membership.
 *
 * Bound to a record when editing, so the caller must give it a `key` that
 * changes with the group — its state is only ever seeded at mount.
 *
 * The only write logic here is calling `saveGroup` and `setGroupMembers`:
 * both live in `src/db/groups.ts` so they stay unit-tested and this form
 * never puts or deletes a row itself.
 */
export function GroupForm({
  classId,
  students,
  group,
  memberIds,
  onDone,
}: {
  classId: string;
  /** Every pupil in the class, to pick membership from. */
  students: Student[];
  group?: StudentGroup;
  /** The group's current membership. Ignored when creating. */
  memberIds?: string[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<string>(group?.color ?? DEFAULT_SUBJECT_COLOR);
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds ?? []));
  const [error, setError] = useState<string | null>(null);

  useEscape(onDone);

  function toggleMember(studentId: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function save(): Promise<void> {
    if (normaliseGroupName(name).length === 0) {
      setError(t("group.nameRequired"));
      return;
    }
    setError(null);

    const groupId = await saveGroup(db, { groupId: group?.id, classId, name, color });
    await setGroupMembers(db, groupId, [...selected]);
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-3 rounded border border-border p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-text-muted">{t("group.name")}</span>
          <input
            className="field"
            placeholder={t("group.namePlaceholder")}
            // biome-ignore lint/a11y/noAutofocus: opens ready to type — one-handed, mid-lesson, no spare tap to reach the field.
            autoFocus
            value={name}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm text-text-muted">{t("group.color")}</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={color === swatch}
              className={`h-8 w-8 rounded-full border-2 ${
                color === swatch ? "border-text" : "border-transparent"
              }`}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-sm text-text-muted">{t("group.members")}</legend>
        {students.length === 0 ? (
          <p className="text-text-faint text-sm">{t("class.noStudents")}</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded border border-border p-1">
            {students.map((student) => (
              <label
                key={student.id}
                className="flex min-h-(--control-min) items-center gap-2 rounded px-2 text-sm hover:bg-bg-hover"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={selected.has(student.id)}
                  onChange={() => toggleMember(student.id)}
                />
                <PupilName student={student} />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">
          {t("common.save")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
