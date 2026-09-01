import type { AppDatabase, RubricScore, Student } from "@db";
import { clearScore, setScore } from "@db/rubrics";
import {
  levelDistribution,
  RUBRIC_LEVEL_COLORS,
  RUBRIC_LEVELS,
  type RubricCriterion,
  type RubricLevel,
  studentMean,
} from "@domain/rubric";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Chip } from "../design-system/components/primitives";
import { LevelButtons } from "./components/level-buttons";

function cellKey(criterionId: string, studentId: string): string {
  return `${criterionId}|${studentId}`;
}

/** Nearest whole level for colouring a continuous mean. Clamped to 1–4. */
function meanColor(mean: number): string {
  const rounded = Math.min(4, Math.max(1, Math.round(mean))) as RubricLevel;
  return RUBRIC_LEVEL_COLORS[rounded];
}

/**
 * The live scoring grid: phone-shape criterion-at-a-time entry below `md`,
 * the full pupil-by-criterion matrix at `md` and above, and the reporting
 * strip (means and distributions) beneath both.
 *
 * All writes go through `setScore`/`clearScore` in `@db/rubrics` — this
 * component holds no write logic of its own.
 */
export function RubricGrid({
  db,
  assessmentId,
  criteria,
  students,
  scores,
}: {
  db: AppDatabase;
  assessmentId: string;
  criteria: RubricCriterion[];
  students: Student[];
  scores: RubricScore[];
}) {
  const { t } = useTranslation();
  // Held as an id, never an index: if the criteria list changes underneath
  // (edited elsewhere, one deleted), an id that no longer exists must fall
  // back to the first criterion rather than point at whatever now sits at
  // that position.
  const [selectedCriterionId, setSelectedCriterionId] = useState<string | null>(null);

  const activeCriterion = criteria.find((c) => c.id === selectedCriterionId) ?? criteria[0] ?? null;
  const activeIndex = activeCriterion ? criteria.findIndex((c) => c.id === activeCriterion.id) : -1;

  const scoreMap = new Map<string, RubricLevel>(
    scores.map((s) => [cellKey(s.criterionId, s.studentId), s.level]),
  );

  async function handleChange(
    criterionId: string,
    studentId: string,
    next: RubricLevel | null,
  ): Promise<void> {
    if (next === null) {
      await clearScore(db, assessmentId, criterionId, studentId);
    } else {
      await setScore(db, assessmentId, criterionId, studentId, next);
    }
  }

  if (criteria.length === 0 || !activeCriterion) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Phone shape: one criterion at a time, a vertical list of pupils. */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center justify-between gap-2 rounded border border-border p-2">
          <button
            type="button"
            className="btn"
            aria-label={t("rubric.previousCriterion")}
            disabled={activeIndex <= 0}
            onClick={() => setSelectedCriterionId(criteria[activeIndex - 1]?.id ?? null)}
          >
            ←
          </button>
          <div className="text-center">
            <p className="font-medium">{activeCriterion.label}</p>
            <p className="text-text-muted text-xs">
              {activeIndex + 1}/{criteria.length}
            </p>
          </div>
          <button
            type="button"
            className="btn"
            aria-label={t("rubric.nextCriterion")}
            disabled={activeIndex >= criteria.length - 1}
            onClick={() => setSelectedCriterionId(criteria[activeIndex + 1]?.id ?? null)}
          >
            →
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {students.map((student) => (
            <li key={student.id} className="flex flex-col gap-2 rounded border border-border p-3">
              <span className="font-medium">
                {student.lastName} {student.firstName}
              </span>
              <LevelButtons
                value={scoreMap.get(cellKey(activeCriterion.id, student.id)) ?? null}
                onChange={(next) => void handleChange(activeCriterion.id, student.id, next)}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Desktop matrix: pupils down, criteria across, pinned name column. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border border-b text-left">
              <th className="sticky left-0 z-10 bg-bg px-3 py-2">{t("student.lastName")}</th>
              {criteria.map((criterion) => (
                <th key={criterion.id} className="min-w-56 px-3 py-2 text-center font-medium">
                  {criterion.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-border/50 border-b">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-bg px-3 py-2">
                  {student.lastName} {student.firstName}
                </td>
                {criteria.map((criterion) => (
                  <td key={criterion.id} className="px-2 py-2">
                    <LevelButtons
                      compact
                      value={scoreMap.get(cellKey(criterion.id, student.id)) ?? null}
                      onChange={(next) => void handleChange(criterion.id, student.id, next)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reporting: means and distributions never feed the gradebook. */}
      <div className="flex flex-col gap-4 rounded border border-border p-3">
        <p className="text-sm text-text-muted">{t("rubric.notInAverage")}</p>

        <div className="flex flex-col gap-2">
          <h3 className="font-medium text-sm">{t("rubric.mean")}</h3>
          <ul className="flex flex-wrap gap-2">
            {students.map((student) => {
              const mean = studentMean(scores, student.id);
              return (
                <li key={student.id}>
                  <Chip color={mean === null ? undefined : meanColor(mean)}>
                    {student.lastName} {student.firstName}
                    {": "}
                    {mean === null ? "—" : mean}
                  </Chip>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-medium text-sm">{t("rubric.distribution")}</h3>
          {criteria.map((criterion) => {
            const dist = levelDistribution(scores, criterion.id);
            const total = RUBRIC_LEVELS.reduce((sum, level) => sum + dist[level], 0);
            return (
              <div key={criterion.id} className="flex flex-col gap-1">
                <span className="text-sm">{criterion.label}</span>
                <div className="flex h-3 w-full overflow-hidden rounded-(--control-radius) border border-border">
                  {total > 0 &&
                    RUBRIC_LEVELS.map((level) =>
                      dist[level] > 0 ? (
                        <div
                          key={level}
                          title={`${t(`rubric.level.${level}`)}: ${dist[level]}`}
                          style={{
                            background: RUBRIC_LEVEL_COLORS[level],
                            width: `${(dist[level] / total) * 100}%`,
                          }}
                        />
                      ) : null,
                    )}
                </div>
                <div className="flex flex-wrap gap-3 text-text-muted text-xs">
                  {RUBRIC_LEVELS.map((level) => (
                    <span key={level}>
                      {level}: {dist[level]}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
