import type { Grade } from "@db";
import { gradeKey } from "@db";
import { setGradeNote } from "@db/grades";
import { useDb } from "@db/provider";
import { formatGradeValue, isBlankInput, parseGradeValue } from "@domain/gradebook/grade";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { NumberPad } from "../design-system/components/number-pad";
import { PupilName } from "../design-system/components/pupil-name";

export function EntryPage({ gradebookId, columnId }: { gradebookId: string; columnId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  // Started by the note field's blur, so a Suivant tap (which blurs the note
  // field a beat before its own click fires) can await the write already in
  // flight instead of racing it: the note and the mark are two independent
  // rows-worth of `put`, and the value commit must never land first and wipe
  // a note that was typed but hasn't reached IndexedDB yet.
  const pendingNoteWrite = useRef<Promise<void> | null>(null);
  // Escape reverts the note draft, which fires a native blur in the same
  // gesture — set before the state flip so the blur handler skips its
  // commit instead of writing the value Escape just discarded.
  const skipNoteBlurRef = useRef(false);
  // True for the duration of an in-flight commit's IndexedDB write. While
  // true, Suivant, the roster rows and the keypad are all disabled so a
  // second tap cannot advance `index` again before the first commit's
  // `setDraft(null)` has landed — that race silently skipped a student and
  // dropped keystrokes (see the entry-mode fix report).
  const [isCommitting, setIsCommitting] = useState(false);

  const data = useLiveQuery(async () => {
    const column = await db.columns.get(columnId);
    if (!column) return null;
    // The column must belong to the gradebook in the URL. Without this,
    // /gradebooks/<B>/entry/<column-of-A> would render B's roster against A's
    // column and write grade rows keyed to a pair that no grid ever reads.
    if (column.gradebookId !== gradebookId) return null;
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [students, grades] = await Promise.all([
      db.students.where("classId").equals(gradebook.classId).sortBy("lastName"),
      db.grades.where("columnId").equals(columnId).toArray(),
    ]);
    return { column, students, grades };
  }, [db, gradebookId, columnId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const { column, students } = data;
  const byStudent = new Map<string, Grade>(data.grades.map((g) => [g.studentId, g]));
  const current = students[index];
  const isNumeric = column.type === "numeric";

  // Commits the draft for the student CURRENTLY on screen, then clears it.
  // Callers must await this before changing `index`, so a draft typed for
  // student A can never be applied against student B — see the awaited
  // call sites below. `isCommitting` is set for the duration so re-entrant
  // taps (Suivant, roster rows, keypad) are inert until this settles.
  //
  // Returns false when the draft was refused: non-blank input that failed
  // validation (invalid text, or a numeric value above the column's max).
  // A refusal writes nothing, deletes nothing — the stored value is left
  // untouched — and the draft stays on screen for the teacher to fix.
  // Blank input always means "clear this cell" and always succeeds.
  async function commit(): Promise<boolean> {
    if (!current) return true;
    // Flush the note draft unconditionally — relying on the note field's own
    // blur to have already done it would leave a typed-but-never-blurred
    // note stuck in state and bleeding into the next student once `index`
    // changes, since this component instance is never remounted between
    // pupils.
    commitNote();
    if (pendingNoteWrite.current) {
      await pendingNoteWrite.current;
      pendingNoteWrite.current = null;
    }
    if (draft === null) return true;
    const blank = isBlankInput(draft);
    const parsed = blank
      ? null
      : parseGradeValue(column.type, draft, isNumeric ? column.max : undefined);
    if (!blank && parsed === null) return false;
    setIsCommitting(true);
    try {
      // Re-read rather than trust the render-time snapshot: the note flush
      // just above may have just written a note-only row into existence, and
      // a `put` here must carry it forward, never clobber it.
      const existing = await db.grades.get(gradeKey(gradebookId, columnId, current.id));
      if (parsed === null) {
        if (existing?.note !== undefined) {
          const { value: _dropped, ...rest } = existing;
          await db.grades.put({ ...rest, updatedAt: Date.now() });
        } else {
          await db.grades.delete(gradeKey(gradebookId, columnId, current.id));
        }
      } else {
        await db.grades.put({
          ...existing,
          gradebookId,
          columnId,
          studentId: current.id,
          value: parsed,
          updatedAt: Date.now(),
        });
      }
      setDraft(null);
      return true;
    } finally {
      setIsCommitting(false);
    }
  }

  // Fires on the note field's blur. Kept separate from `commit()` (the mark)
  // so typing a note never competes with the digit-tap loop: nothing here
  // blocks NumberPad, and `commit()` above only waits for this write when a
  // student change is about to touch the same row.
  function commitNote(): void {
    if (!current || noteDraft === null) return;
    const value = noteDraft;
    const studentId = current.id;
    setNoteDraft(null);
    pendingNoteWrite.current = setGradeNote(db, gradebookId, columnId, studentId, value);
  }

  async function next(): Promise<void> {
    if (isCommitting) return;
    const applied = await commit();
    if (!applied) return;
    setIndex((i) => Math.min(i + 1, students.length - 1));
  }

  async function jumpTo(i: number): Promise<void> {
    if (isCommitting) return;
    const applied = await commit();
    if (!applied) return;
    setIndex(i);
  }

  const stored = current ? byStudent.get(current.id)?.value : undefined;
  const shown =
    draft !== null
      ? draft
      : stored === undefined
        ? ""
        : formatGradeValue(stored, isNumeric ? column.max : undefined, i18n.language);

  const storedNote = current ? byStudent.get(current.id)?.note : undefined;
  const shownNote = noteDraft !== null ? noteDraft : (storedNote ?? "");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link to={Router.Gradebook({ gradebookId })} className="text-accent">
          ← {t("entry.backToGrid")}
        </Link>
        <span className="text-sm text-text-muted">
          {index + 1}/{students.length}
        </span>
      </div>

      <div className="rounded border border-border p-3 text-center">
        <p className="font-medium">{column.label}</p>
        <p className="text-sm text-text-muted">
          {t("gradebook.coef", { weight: column.weight })} — /{column.max}
        </p>
      </div>

      {current ? (
        <>
          {isNumeric ? (
            <>
              <div className="rounded border border-border p-4 text-center">
                <p className="font-semibold text-lg">
                  <PupilName student={current} />
                </p>
                <p className="mt-2 font-bold text-3xl tabular-nums">
                  {shown === "" ? <span className="text-text-faint">—</span> : shown}
                </p>
              </div>

              <NumberPad
                disabled={isCommitting}
                onDigit={(digit) => {
                  if (isCommitting) return;
                  setDraft((d) => (d ?? "") + digit);
                }}
                onDecimal={() => {
                  if (isCommitting) return;
                  setDraft((d) => ((d ?? "").includes(",") ? d : `${d ?? ""},`));
                }}
                onBackspace={() => {
                  if (isCommitting) return;
                  setDraft((d) => (d ?? "").slice(0, -1));
                }}
                onNext={() => void next()}
              />

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-muted">{t("gradebook.note")}</span>
                <input
                  className="field"
                  placeholder={t("gradebook.notePlaceholder")}
                  value={shownNote}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => {
                    if (skipNoteBlurRef.current) {
                      skipNoteBlurRef.current = false;
                      return;
                    }
                    commitNote();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      skipNoteBlurRef.current = true;
                      setNoteDraft(null);
                      e.currentTarget.blur();
                    }
                  }}
                />
              </label>
            </>
          ) : null}

          <ul className="flex flex-col gap-1 text-sm">
            {students.map((student, i) => (
              <li key={student.id}>
                <button
                  type="button"
                  disabled={isCommitting}
                  className={[
                    "flex w-full justify-between rounded px-2 py-1 text-left",
                    i === index ? "bg-bg-hover font-medium" : "",
                  ].join(" ")}
                  onClick={() => void jumpTo(i)}
                >
                  <span>
                    <PupilName student={student} />
                  </span>
                  <span className="tabular-nums text-text-muted">
                    {(() => {
                      const value = byStudent.get(student.id)?.value;
                      if (value === undefined) return "—";
                      return formatGradeValue(value, undefined, i18n.language);
                    })()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-text-muted">{t("class.noStudents")}</p>
      )}
    </div>
  );
}
