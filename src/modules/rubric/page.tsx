import type { RubricAssessment } from "@db";
import { deleteRubricAssessment } from "@db/cascade";
import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { AssessmentForm } from "./components/assessment-form";

/** How many distinct pupils have at least one level recorded on an assessment. */
function scoredCount(
  scores: { assessmentId: string; studentId: string }[],
  assessmentId: string,
): number {
  return new Set(scores.filter((s) => s.assessmentId === assessmentId).map((s) => s.studentId))
    .size;
}

/** How many level cells an assessment has recorded — what a delete destroys. */
function levelCount(scores: { assessmentId: string }[], assessmentId: string): number {
  return scores.filter((s) => s.assessmentId === assessmentId).length;
}

/**
 * The list of rubric assessments for one gradebook, newest first.
 *
 * An explicit `null` distinguishes "no such gradebook" from "still loading" —
 * `useLiveQuery` returns `undefined` for both, same as `ClassPage`.
 */
export function RubricsPage({ gradebookId }: { gradebookId: string }) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const [creating, setCreating] = useState(false);
  const locale = i18n.language;

  const data = useLiveQuery(async () => {
    const gradebook = await db.gradebooks.get(gradebookId);
    if (!gradebook) return null;
    const [periods, templates, assessments] = await Promise.all([
      db.periods.where("gradebookId").equals(gradebookId).sortBy("order"),
      db.rubricTemplates.toArray(),
      db.rubricAssessments.where("gradebookId").equals(gradebookId).sortBy("date"),
    ]);
    const assessmentIds = assessments.map((a) => a.id);
    const scores =
      assessmentIds.length > 0
        ? await db.rubricScores.where("assessmentId").anyOf(assessmentIds).toArray()
        : [];
    // Newest first: `sortBy` above gives ascending order.
    return { periods, templates, assessments: [...assessments].reverse(), scores };
  }, [db, gradebookId]);

  if (data === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (data === null) return <p className="text-text-muted">{t("gradebook.notFound")}</p>;

  const activePeriodId = data.periods[0]?.id ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("rubric.assessments")}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          {t("rubric.newAssessment")}
        </button>
      </div>

      {creating && (
        <AssessmentForm
          gradebookId={gradebookId}
          periods={data.periods}
          activePeriodId={activePeriodId}
          templates={data.templates}
          onDone={() => setCreating(false)}
        />
      )}

      {data.assessments.length === 0 ? (
        <p className="text-text-muted">{t("rubric.noAssessments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.assessments.map((assessment: RubricAssessment) => {
            const count = scoredCount(data.scores, assessment.id);
            return (
              <li
                key={assessment.id}
                className="flex flex-wrap items-center gap-3 rounded border border-border px-3 py-2 text-sm"
              >
                <Link
                  to={Router.Rubric({ gradebookId, assessmentId: assessment.id })}
                  className="flex grow flex-wrap items-center gap-3 hover:text-accent"
                >
                  <span className="font-medium">{assessment.name}</span>
                  <span className="text-text-muted">
                    {new Date(assessment.date).toLocaleDateString(locale)}
                  </span>
                  <span className="text-text-muted">
                    {t("rubric.criterionCount", { count: assessment.criteria.length })}
                  </span>
                  <span className="text-text-muted">{t("rubric.scoredCount", { count })}</span>
                </Link>
                <ConfirmButton
                  danger
                  variant="link"
                  label={t("common.delete")}
                  confirmLabel={t("rubric.confirmDeleteAssessment", {
                    count: levelCount(data.scores, assessment.id),
                  })}
                  onConfirm={() => deleteRubricAssessment(db, assessment.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One assessment's shell: name, date and its criteria.
 *
 * The live scoring grid (Task 7) renders inside this page — the routing and
 * not-found handling live here so that route has always resolved to
 * something, even before the grid exists.
 */
export function RubricAssessmentPage({
  gradebookId,
  assessmentId,
}: {
  gradebookId: string;
  assessmentId: string;
}) {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const locale = i18n.language;

  const assessment = useLiveQuery(async () => {
    const found = await db.rubricAssessments.get(assessmentId);
    if (!found || found.gradebookId !== gradebookId) return null;
    return found;
  }, [db, gradebookId, assessmentId]);

  if (assessment === undefined) return <p className="text-text-muted">{t("common.loading")}</p>;
  if (assessment === null) return <p className="text-text-muted">{t("rubric.notFound")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold text-lg">{assessment.name}</h2>
        <span className="text-sm text-text-muted">
          {new Date(assessment.date).toLocaleDateString(locale)}
        </span>
      </div>

      {assessment.criteria.length === 0 ? (
        <p className="text-text-muted">{t("rubric.noCriteria")}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {assessment.criteria.map((criterion) => (
            <li key={criterion.id}>{criterion.label}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
