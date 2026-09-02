import { useDb } from "@db/provider";
import { MAX_STUDENTS_PER_CLASS, remainingCapacity } from "@domain/class-size";
import {
  type Delimiter,
  extractRoster,
  findDuplicates,
  parseCsv,
  type RosterRow,
  sniffDelimiter,
} from "@domain/gradebook/csv";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscape } from "../../shared/use-escape";

export function CsvImport({
  classId,
  existing,
  studentCount,
  onDone,
}: {
  classId: string;
  existing: RosterRow[];
  studentCount: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const db = useDb();

  const DELIMITER_LABELS: Record<Delimiter, string> = {
    ";": t("csv.delimiterSemicolon"),
    ",": t("csv.delimiterComma"),
    "\t": t("csv.delimiterTab"),
  };

  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState<Delimiter | null>(null);
  const [lastNameCol, setLastNameCol] = useState(0);
  const [firstNameCol, setFirstNameCol] = useState(1);
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscape(onDone);

  const effectiveDelimiter = delimiter ?? (text ? sniffDelimiter(text) : ",");

  const rows = useMemo(
    () => (text.trim() === "" ? [] : parseCsv(text, effectiveDelimiter)),
    [text, effectiveDelimiter],
  );

  const roster = useMemo(
    () => extractRoster(rows, { lastName: lastNameCol, firstName: firstNameCol, skipFirstRow }),
    [rows, lastNameCol, firstNameCol, skipFirstRow],
  );

  const duplicates = useMemo(() => new Set(findDuplicates(roster, existing)), [roster, existing]);

  const remaining = remainingCapacity(studentCount);
  const selectedCount = roster.length - excluded.size;
  const excess = Math.max(0, selectedCount - remaining);

  // Row indices only make sense relative to the current roster: clear the
  // exclusion set whenever roster recomputes (delimiter, mapping, header
  // toggle, new paste/file), so an unticked row never silently points at a
  // different student after the list shifts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roster is a reset trigger, not a value read in the body — any recompute must invalidate stale exclusion indices.
  useEffect(() => {
    setExcluded(new Set());
  }, [roster]);

  const columnCount = rows[0]?.length ?? 0;
  const columnOptions = Array.from({ length: columnCount }, (_, i) => i);

  /** Clearing the value is what lets the same filename be picked again after
   * the teacher has corrected the file — otherwise onChange never re-fires. */
  function resetFileInput(): void {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onFile(file: File): Promise<void> {
    setText(await file.text());
    setDelimiter(null);
    resetFileInput();
  }

  async function onImport(): Promise<void> {
    // The ceiling is enforced here as well as on the button, exactly as
    // `student-form` guards its submit handler: a disabled button is a
    // rendering, not a rule.
    if (excess > 0) return;
    const now = Date.now();
    const toAdd = roster
      .filter((_, index) => !excluded.has(index))
      .map((row) => ({
        id: crypto.randomUUID(),
        classId,
        lastName: row.lastName,
        firstName: row.firstName,
        createdAt: now,
        updatedAt: now,
      }));
    await db.students.bulkAdd(toAdd);
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border p-3">
      <h3 className="font-medium">{t("csv.title")}</h3>

      <textarea
        className="field font-mono text-sm"
        rows={5}
        placeholder={t("csv.pastePlaceholder")}
        // biome-ignore lint/a11y/noAutofocus: opens ready to paste — one-handed, mid-lesson, no spare tap to reach the field.
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          else resetFileInput();
        }}
      />

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.delimiter")}</span>
              <select
                className="field"
                value={effectiveDelimiter}
                onChange={(e) => setDelimiter(e.target.value as Delimiter)}
              >
                {(Object.keys(DELIMITER_LABELS) as Delimiter[]).map((d) => (
                  <option key={d} value={d}>
                    {DELIMITER_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.lastNameColumn")}</span>
              <select
                className="field"
                value={lastNameCol}
                onChange={(e) => setLastNameCol(Number(e.target.value))}
              >
                {columnOptions.map((i) => (
                  <option key={i} value={i}>
                    {t("csv.columnN", { n: i + 1 })} — {rows[0][i]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-text-muted">{t("csv.firstNameColumn")}</span>
              <select
                className="field"
                value={firstNameCol}
                onChange={(e) => setFirstNameCol(Number(e.target.value))}
              >
                {columnOptions.map((i) => (
                  <option key={i} value={i}>
                    {t("csv.columnN", { n: i + 1 })} — {rows[0][i]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 self-end">
              <input
                type="checkbox"
                checked={skipFirstRow}
                onChange={(e) => setSkipFirstRow(e.target.checked)}
              />
              <span className="text-sm">{t("csv.skipHeader")}</span>
            </label>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="px-2 py-1" />
                <th className="px-2 py-1">{t("student.lastName")}</th>
                <th className="px-2 py-1">{t("student.firstName")}</th>
                <th className="px-2 py-1">{t("csv.status")}</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row, index) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows can repeat name+name; index disambiguates and drives exclusion/duplicate lookups anyway
                  key={`${row.lastName}-${row.firstName}-${index}`}
                  className="border-border/50 border-b"
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={!excluded.has(index)}
                      onChange={(e) => {
                        const next = new Set(excluded);
                        if (e.target.checked) next.delete(index);
                        else next.add(index);
                        setExcluded(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">{row.lastName}</td>
                  <td className="px-2 py-1">{row.firstName}</td>
                  <td className="px-2 py-1">
                    {duplicates.has(index) ? (
                      <span className="text-danger">{t("csv.duplicate")}</span>
                    ) : (
                      <span className="text-success">{t("csv.new")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-sm text-text-muted">
            {t("csv.summary", {
              total: selectedCount,
              duplicates: duplicates.size,
            })}
            {" — "}
            {t("csv.capacity", { remaining })}
          </p>

          {excess > 0 && (
            <p role="alert" className="text-danger text-sm">
              {t("csv.overCapacity", { excess, max: MAX_STUDENTS_PER_CLASS })}
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={roster.length === 0 || roster.length === excluded.size || excess > 0}
          onClick={() => void onImport()}
        >
          {t("csv.import")}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
