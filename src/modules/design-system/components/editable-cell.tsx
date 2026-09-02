import type { ColumnType } from "@domain/gradebook/column";
import { formatDecimalExact } from "@domain/gradebook/decimal";
import {
  formatGradeValue,
  type GradeValue,
  isBlankInput,
  parseGradeValue,
} from "@domain/gradebook/grade";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One grid cell. Click (or focus + Enter) turns it into the editor its column
 * type calls for. Escape cancels, Enter and blur commit. `onChange(null)`
 * means "clear this cell".
 *
 * A note is independent of the mark: clearing one must never clear the
 * other, so they are committed through two separate callbacks
 * (`onChange` / `onNoteChange`) rather than folded into one write. An
 * annotated cell always carries the note in its `title` and accessible name
 * too — the corner marker is a hint, never the only way to reach it.
 */
export function EditableCell({
  type,
  max,
  value,
  note,
  onChange,
  onNoteChange,
}: {
  type: ColumnType;
  max: number;
  value: GradeValue | undefined;
  note?: string;
  /**
   * Awaited before `onNoteChange` runs when both change in the same commit,
   * so the two single-row writes land in order instead of racing to be the
   * row's last write.
   */
  onChange: (next: GradeValue | null) => Promise<void>;
  onNoteChange: (next: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Removing the focused input (Enter/Escape both flip `editing` off) fires a
  // native blur in the same commit, which would otherwise re-run — or wrongly
  // trigger — the blur handler's commit(). Set before the state flip, checked
  // and cleared at the top of onBlur.
  const skipBlurRef = useRef(false);
  const skipNoteBlurRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const hasNote = note !== undefined && note.length > 0;
  const noteTitle = hasNote ? t("gradebook.hasNote", { note }) : undefined;

  // A calculation column stores nothing — its value is derived on read by the
  // caller and handed in as `value`. Rendering it read-only here (no button,
  // no editor) is the only way to guarantee a teacher can never type into it
  // and produce a stored value the next render would silently discard.
  if (type === "calculation") {
    const text = value?.type === "numeric" ? formatGradeValue(value, undefined, locale) : null;
    return (
      <span
        className="tabular-nums text-text-muted"
        title={text === null ? t("gradebook.calcEmpty") : undefined}
      >
        {text ?? <span className="text-text-faint">—</span>}
      </span>
    );
  }

  function openEditor(): void {
    setDraft(value === undefined ? "" : rawText(value, locale));
    setNoteDraft(note ?? "");
    setEditing(true);
  }

  async function commitNote(): Promise<void> {
    const trimmed = noteDraft.trim();
    if (trimmed !== (note ?? "")) await onNoteChange(trimmed);
  }

  if (type === "checkbox") {
    const checked = value?.type === "checkbox" ? value.value : false;
    return (
      <div className="relative flex items-center justify-center gap-1" title={noteTitle}>
        <input
          type="checkbox"
          aria-label={hasNote ? noteTitle : undefined}
          checked={checked}
          onChange={(e) => onChange({ type: "checkbox", value: e.target.checked })}
        />
        {hasNote && <NoteMarker />}
        <button
          type="button"
          className="text-text-faint text-xs hover:text-accent"
          onClick={openEditor}
        >
          {t("gradebook.note")}
        </button>
        {editing && (
          <div className="absolute top-full left-0 z-10 mt-1 w-40 rounded border border-border bg-bg p-2 shadow">
            <input
              ref={inputRef}
              className="w-full bg-transparent text-xs outline-none"
              placeholder={t("gradebook.notePlaceholder")}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                if (skipNoteBlurRef.current) {
                  skipNoteBlurRef.current = false;
                  return;
                }
                void commitNote();
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  skipNoteBlurRef.current = true;
                  void commitNote();
                  setEditing(false);
                }
                if (e.key === "Escape") {
                  skipNoteBlurRef.current = true;
                  setEditing(false);
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  if (!editing) {
    const valueText =
      value === undefined
        ? ""
        : formatGradeValue(value, type === "numeric" ? max : undefined, locale);
    return (
      <button
        type="button"
        className="relative w-full text-left tabular-nums"
        title={noteTitle}
        aria-label={hasNote ? [valueText, noteTitle].filter(Boolean).join(" — ") : undefined}
        onClick={openEditor}
      >
        {hasNote && <NoteMarker />}
        {value === undefined ? <span className="text-text-faint">—</span> : valueText}
      </button>
    );
  }

  // `parseGradeValue` returns null both for blank input (clear the cell) and
  // for invalid non-blank input (refuse it) — those must not be treated the
  // same way. Blank always deletes. Invalid input is refused: nothing is
  // written, the stored value is untouched, and the editor stays open with
  // the offending text still in it (returns false) instead of closing and
  // appearing to accept it.
  //
  // The value write is awaited before the note write starts: both are single-
  // row `put`s on the same grade row, and firing them concurrently would let
  // whichever lands second silently drop what the other just wrote.
  const commit = async (): Promise<boolean> => {
    if (isBlankInput(draft)) {
      await onChange(null);
    } else {
      const parsed = parseGradeValue(type, draft, type === "numeric" ? max : undefined);
      if (parsed === null) return false;
      await onChange(parsed);
    }
    const trimmedNote = noteDraft.trim();
    if (trimmedNote !== (note ?? "")) await onNoteChange(trimmedNote);
    setEditing(false);
    return true;
  };

  return (
    // Focus moving between the value and note fields must not count as
    // leaving the cell — only a blur that lands outside this wrapper commits.
    <fieldset
      className="m-0 flex flex-col gap-1 border-0 p-0"
      onBlur={(e) => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        void commit();
      }}
    >
      <input
        ref={inputRef}
        className="w-full bg-transparent tabular-nums outline-none"
        inputMode={type === "numeric" ? "decimal" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // A committed Enter closes the editor, which unmounts this whole
            // wrapper and fires the container blur above for the same
            // reason — skip that one, this call is already committing.
            skipBlurRef.current = true;
            void commit().then((applied) => {
              if (!applied) skipBlurRef.current = false;
            });
          }
          if (e.key === "Escape") {
            skipBlurRef.current = true;
            setEditing(false);
          }
        }}
      />
      <input
        className="w-full bg-transparent text-text-muted text-xs outline-none placeholder:text-text-faint"
        placeholder={t("gradebook.notePlaceholder")}
        aria-label={t("gradebook.note")}
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            skipBlurRef.current = true;
            void commit().then((applied) => {
              if (!applied) skipBlurRef.current = false;
            });
          }
          if (e.key === "Escape") {
            skipBlurRef.current = true;
            setEditing(false);
          }
        }}
      />
    </fieldset>
  );
}

/** The small corner marker on an annotated cell. Never the only signal — see `title`/`aria-label` on the caller. */
function NoteMarker() {
  return (
    <span
      aria-hidden="true"
      className="-translate-y-1/2 absolute top-0 right-0 h-1.5 w-1.5 translate-x-1/2 rounded-full bg-accent"
    />
  );
}

/**
 * The editable text behind a stored value — no "/20" suffix, no ✓/✗, and the
 * full stored precision: seeding the editor with the rounded display would
 * make an untouched commit rewrite 13.456 as 13.46.
 */
function rawText(value: GradeValue, locale: string): string {
  switch (value.type) {
    case "numeric":
      return formatDecimalExact(value.value, locale);
    case "checkbox":
      return value.value ? "true" : "false";
    default:
      return value.value;
  }
}
