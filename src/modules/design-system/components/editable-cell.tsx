import { ATTENDANCE_VALUES, type ColumnType } from "@domain/gradebook/column";
import { formatDecimal } from "@domain/gradebook/decimal";
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
 */
export function EditableCell({
  type,
  max,
  value,
  onChange,
}: {
  type: ColumnType;
  max: number;
  value: GradeValue | undefined;
  onChange: (next: GradeValue | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Removing the focused input (Enter/Escape both flip `editing` off) fires a
  // native blur in the same commit, which would otherwise re-run — or wrongly
  // trigger — the blur handler's commit(). Set before the state flip, checked
  // and cleared at the top of onBlur.
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (type === "checkbox") {
    const checked = value?.type === "checkbox" ? value.value : false;
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange({ type: "checkbox", value: e.target.checked })}
      />
    );
  }

  if (type === "attendance") {
    const current = value?.type === "attendance" ? value.value : "";
    return (
      <select
        className="w-full bg-transparent"
        value={current}
        onChange={(e) => onChange(parseGradeValue("attendance", e.target.value))}
      >
        <option value="">—</option>
        {ATTENDANCE_VALUES.map((v) => (
          <option key={v} value={v}>
            {t(`gradebook.attendance.${v}`)}
          </option>
        ))}
      </select>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-left tabular-nums"
        onClick={() => {
          setDraft(value === undefined ? "" : rawText(value, locale));
          setEditing(true);
        }}
      >
        {value === undefined ? (
          <span className="text-text-faint">—</span>
        ) : (
          formatGradeValue(value, type === "numeric" ? max : undefined, locale)
        )}
      </button>
    );
  }

  // `parseGradeValue` returns null both for blank input (clear the cell) and
  // for invalid non-blank input (refuse it) — those must not be treated the
  // same way. Blank always deletes. Invalid input is refused: nothing is
  // written, the stored value is untouched, and the editor stays open with
  // the offending text still in it (returns false) instead of closing and
  // appearing to accept it.
  const commit = (): boolean => {
    if (isBlankInput(draft)) {
      onChange(null);
      setEditing(false);
      return true;
    }
    const parsed = parseGradeValue(type, draft, type === "numeric" ? max : undefined);
    if (parsed === null) return false;
    onChange(parsed);
    setEditing(false);
    return true;
  };

  return (
    <input
      ref={inputRef}
      className="w-full bg-transparent tabular-nums outline-none"
      inputMode={type === "numeric" ? "decimal" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const applied = commit();
          if (applied) skipBlurRef.current = true;
        }
        if (e.key === "Escape") {
          skipBlurRef.current = true;
          setEditing(false);
        }
      }}
    />
  );
}

/** The editable text behind a stored value — no "/20" suffix, no ✓/✗. */
function rawText(value: GradeValue, locale: string): string {
  switch (value.type) {
    case "numeric":
      return formatDecimal(value.value, locale);
    case "checkbox":
      return value.value ? "true" : "false";
    default:
      return value.value;
  }
}
