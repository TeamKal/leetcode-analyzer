import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EVALUATION_RUBRIC } from "@/lib/evaluation/validator";
import {
  describeReviewFlag,
  formatScore,
  readCategoryScores,
  readStringList,
} from "@/lib/mentor/grading";

const CATEGORY_LABELS: Record<string, string> = {
  problem_understanding: "Problem understanding",
  approach: "Approach",
  reasoning: "Reasoning",
  edge_cases: "Edge cases",
  complexity: "Complexity",
  communication: "Communication",
};

export type EvaluationData = {
  overall_score: number | string;
  feedback: string;
  scores: unknown;
  strengths: unknown;
  improvements: unknown;
  review_flags: unknown;
};

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-2">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** The AI's provisional evaluation. The mentor's grade is the final one. */
export function EvaluationView({
  evaluation,
  forStudent = false,
}: {
  evaluation: EvaluationData;
  /** Students never see evidence quotes (they come from the transcript) or internal flags. */
  forStudent?: boolean;
}) {
  const categories = Object.keys(EVALUATION_RUBRIC);
  const scores = readCategoryScores(evaluation.scores, categories);
  const flags = forStudent ? [] : readStringList(evaluation.review_flags);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {formatScore(evaluation.overall_score)}
          <span className="text-lg font-medium text-faint"> / 10</span>
        </p>
        <Badge>Provisional AI score</Badge>
      </div>

      {flags.length > 0 && (
        <div className="rounded-lg border border-line bg-warning-soft p-4">
          <h3 className="text-[13px] font-semibold text-warning-text">
            Worth a closer look
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning-text">
            {flags.map((flag) => (
              <li key={flag}>{describeReviewFlag(flag)}</li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.feedback && (
        <p className="text-sm leading-7 text-ink-2">{evaluation.feedback}</p>
      )}

      {scores.length > 0 && (
        <ul className="space-y-5">
          {scores.map((entry) => {
            const max =
              EVALUATION_RUBRIC[entry.category as keyof typeof EVALUATION_RUBRIC] ?? 0;
            const label = CATEGORY_LABELS[entry.category] ?? entry.category;
            return (
              <li key={entry.category}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  <span className="text-sm tabular-nums text-ink-2">
                    {formatScore(entry.score)} / {max}
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  label={`${label} score`}
                  value={max > 0 ? (entry.score / max) * 100 : 0}
                />
                {entry.feedback && (
                  <p className="mt-2 text-sm leading-6 text-muted">{entry.feedback}</p>
                )}
                {!forStudent && entry.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {entry.evidence.map((quote) => (
                      <li
                        key={quote}
                        className="border-l-2 border-line-strong pl-3 text-[13px] italic leading-5 text-ink-2"
                      >
                        {quote}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Bullets title="Strengths" items={readStringList(evaluation.strengths)} />
        <Bullets title="To improve" items={readStringList(evaluation.improvements)} />
      </div>
    </div>
  );
}
