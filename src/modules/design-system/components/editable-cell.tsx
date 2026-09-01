import { ATTENDANCE_VALUES, type ColumnType } from "@domain/gradebook/column";
import { formatGradeValue, type GradeValue, parseGradeValue } from "@domain/gradebook/grade";
import { useEffect, useRef, useState } from "react";

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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
            {v}
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
    onChange(parseGradeValue(type, draft));
    setEditing(false);
  };

  return (
    <input
      ref={inputRef}
      className="w-full bg-transparent tabular-nums outline-none"
      inputMode={type === "numeric" ? "decimal" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
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
