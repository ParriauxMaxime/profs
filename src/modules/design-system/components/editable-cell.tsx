import { ATTENDANCE_VALUES, type ColumnType } from "@domain/gradebook/column";
import { formatGradeValue, type GradeValue, parseGradeValue } from "@domain/gradebook/grade";
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
  const { t } = useTranslation();
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
          setDraft(value === undefined ? "" : rawText(value));
          setEditing(true);
        }}
      >
        {value === undefined ? (
          <span className="text-text-faint">—</span>
        ) : (
          formatGradeValue(value, type === "numeric" ? max : undefined)
        )}
      </button>
    );
  }

  const commit = () => {
    onChange(parseGradeValue(type, draft, type === "numeric" ? max : undefined));
    setEditing(false);
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
          skipBlurRef.current = true;
          commit();
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
function rawText(value: GradeValue): string {
  switch (value.type) {
    case "numeric":
      return String(value.value).replace(".", ",");
    case "checkbox":
      return value.value ? "true" : "false";
    default:
      return value.value;
  }
}
