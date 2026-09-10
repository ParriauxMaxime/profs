import type { CriterionLevel, GradeColumn, Student } from "@db";
import { clearLevel, setLevel } from "@db/criterion-levels";
import { useDb } from "@db/provider";
import { formatDecimal } from "@domain/gradebook/decimal";
import { RUBRIC_LEVEL_COLORS, type RubricLevel, rubricCell } from "@domain/rubric";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PupilName } from "../design-system/components/pupil-name";
import { LevelButtons } from "./components/level-buttons";

/** Nearest whole level for colouring a continuous mean. Clamped to 1–4. */
function meanColor(mean: number): string {
  return RUBRIC_LEVEL_COLORS[Math.min(4, Math.max(1, Math.round(mean))) as RubricLevel];
}

/**
 * One rubric cell in the carnet: what the pupil's grille says, and the way in.
 *
 * The closed cell never shows a mean until every critère is in — see
 * `rubricCell`. Open, it is that pupil's critères and nothing else; the class
 * matrix lives behind the column header, exactly as fast entry does for a
 * numeric column.
 */
export function RubricCellButton({
  column,
  levels,
  student,
}: {
  column: GradeColumn;
  /** Every level on THIS column, for every pupil — filtered here. */
  levels: CriterionLevel[];
  student: Student;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [open, setOpen] = useState(false);
  const criteria = column.criteria ?? [];
  const cell = rubricCell(levels, criteria, student.id);

  const byCriterion = new Map<string, RubricLevel>(
    levels.filter((row) => row.studentId === student.id).map((row) => [row.criterionId, row.level]),
  );

  async function write(criterionId: string, next: RubricLevel | null): Promise<void> {
    if (next === null) {
      await clearLevel(db, column.id, criterionId, student.id);
      return;
    }
    await setLevel(db, column.id, criterionId, student.id, next);
  }

  // One branch on `cell.state` drives both strings together, so the title
  // (sighted, on hover) and the accessible name (always, for a screen
  // reader — `aria-label` replaces the rendered content, it does not
  // supplement it) can never disagree about which state they describe.
  const name = `${student.lastName} ${student.firstName}`;
  let title: string;
  let ariaLabel: string;
  if (cell.state === "complete") {
    const mean = formatDecimal(cell.mean, i18n.language);
    title = t("rubric.cellComplete", { mean });
    ariaLabel = t("rubric.openComplete", { name, mean });
  } else if (cell.state === "partial") {
    title = t("rubric.cellPartial", { scored: cell.scored, total: cell.total });
    ariaLabel = t("rubric.openPartial", { name, scored: cell.scored, total: cell.total });
  } else {
    title = t("rubric.cellEmpty");
    ariaLabel = t("rubric.openEmpty", { name });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="min-h-11 min-w-11 tabular-nums"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {cell.state === "empty" && <span className="text-text-faint">—</span>}
        {cell.state === "partial" && (
          <span className="text-sm text-text-muted">
            {cell.scored}/{cell.total}
          </span>
        )}
        {cell.state === "complete" && (
          <span className="inline-flex items-center gap-1 font-medium">
            <span
              aria-hidden="true"
              className="inline-block size-2 rounded-full"
              style={{ background: meanColor(cell.mean) }}
            />
            {formatDecimal(cell.mean, i18n.language)}
          </span>
        )}
      </button>

      {open && (
        <div className="flex w-56 flex-col gap-2 rounded border border-border bg-bg p-2 text-left">
          <PupilName student={student} format="surname" />
          {criteria.map((criterion) => (
            <div key={criterion.id} className="flex flex-col gap-1">
              <span className="text-text-muted text-xs">{criterion.label}</span>
              <LevelButtons
                compact
                value={byCriterion.get(criterion.id) ?? null}
                onChange={(next) => void write(criterion.id, next)}
              />
            </div>
          ))}
          <button type="button" className="btn self-end" onClick={() => setOpen(false)}>
            {t("rubric.closePanel")}
          </button>
        </div>
      )}
    </div>
  );
}
