import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Section";
import { formatScore } from "@/lib/mentor/grading";
import {
  STUDENT_STATUS_LABELS,
  type StudentStatus,
} from "@/lib/student/status";
import type { StudentSubmission } from "@/lib/student/submissions";

const TONE = {
  scoring: "neutral",
  awaiting_mentor: "warning",
  graded: "success",
  failed: "danger",
} as const;

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return <Badge tone={TONE[status]}>{STUDENT_STATUS_LABELS[status]}</Badge>;
}

export function formatDate(value: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The student's own submissions, newest first. */
export function SubmissionsList({ rows }: { rows: StudentSubmission[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState title="No submissions yet">
        <span className="block">Record an explanation of a problem you solved.</span>
        <Link href="/" className={`${buttonClasses("primary")} mt-4`}>
          Submit a solution
        </Link>
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/submissions/${row.id}`}
            className="block rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">
                  {row.problemTitle}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {row.difficulty ? `${row.difficulty} · ` : ""}Submitted{" "}
                  {formatDate(row.submittedAt)}
                </p>
              </div>
              <StudentStatusBadge status={row.status} />
            </div>

            <dl className="mt-4 flex gap-8 text-sm">
              <div>
                <dt className="text-xs text-muted">AI score</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink">
                  {row.aiScore === null ? "–" : `${formatScore(row.aiScore)} / 10`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Final grade</dt>
                <dd className="mt-0.5 font-medium tabular-nums text-ink">
                  {row.finalScore === null
                    ? "Not graded yet"
                    : `${formatScore(row.finalScore)} / 10`}
                </dd>
              </div>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
