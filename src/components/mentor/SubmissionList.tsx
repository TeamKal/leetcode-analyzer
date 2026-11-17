import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, tableClasses } from "@/components/ui/Section";
import {
  formatScore,
  GRADING_STATE_LABELS,
  type GradingState,
  type ListFilter,
} from "@/lib/mentor/grading";

export type SubmissionRow = {
  id: string;
  studentName: string;
  studentEmail: string;
  problemTitle: string;
  difficulty: string | null;
  state: GradingState;
  aiScore: number | null;
  finalScore: number | null;
  flagCount: number;
  submittedAt: string | null;
};

const STATE_TONE = {
  waiting: "neutral",
  needs_grading: "warning",
  graded: "success",
  failed: "danger",
} as const;

export function StateBadge({ state }: { state: GradingState }) {
  return <Badge tone={STATE_TONE[state]}>{GRADING_STATE_LABELS[state]}</Badge>;
}

export function formatSubmittedAt(value: string | null) {
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

const FILTERS: { id: ListFilter; label: string }[] = [
  { id: "needs", label: "Needs grading" },
  { id: "graded", label: "Graded" },
  { id: "all", label: "All" },
];

export function FilterTabs({
  active,
  counts,
}: {
  active: ListFilter;
  counts: Record<ListFilter, number>;
}) {
  return (
    <nav aria-label="Filter submissions" className="flex gap-1 border-b border-line">
      {FILTERS.map((filter) => {
        const selected = filter.id === active;
        return (
          <Link
            key={filter.id}
            href={filter.id === "needs" ? "/mentor" : `/mentor?show=${filter.id}`}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${
              selected
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {filter.label}
            <span className="ml-1.5 text-xs font-medium text-faint tabular-nums">
              {counts[filter.id]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

const EMPTY_COPY: Record<ListFilter, [string, string]> = {
  needs: ["Nothing to grade", "New submissions will show up here once the AI has scored them."],
  graded: ["No graded submissions yet", "Submissions you grade will be listed here."],
  all: ["No submissions yet", "Your students have not submitted anything yet."],
};

export function SubmissionList({
  rows,
  filter,
}: {
  rows: SubmissionRow[];
  filter: ListFilter;
}) {
  if (rows.length === 0) {
    const [title, body] = EMPTY_COPY[filter];
    return <EmptyState title={title}>{body}</EmptyState>;
  }

  return (
    <div className={tableClasses.wrap}>
      <table className={tableClasses.table}>
        <thead>
          <tr>
            <th scope="col" className={tableClasses.th}>Student</th>
            <th scope="col" className={tableClasses.th}>Problem</th>
            <th scope="col" className={tableClasses.th}>Status</th>
            <th scope="col" className={tableClasses.th}>AI score</th>
            <th scope="col" className={tableClasses.th}>Final</th>
            <th scope="col" className={tableClasses.th}>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={tableClasses.td}>
                <Link
                  href={`/mentor/submissions/${row.id}`}
                  className="flex flex-col rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="font-medium text-ink underline-offset-2 hover:underline">
                    {row.studentName || row.studentEmail}
                  </span>
                  {row.studentName && (
                    <span className="text-[13px] text-muted">{row.studentEmail}</span>
                  )}
                </Link>
              </td>
              <td className={tableClasses.td}>
                <span className="text-ink">{row.problemTitle}</span>
                {row.difficulty && (
                  <span className="ml-2 text-xs text-muted">{row.difficulty}</span>
                )}
              </td>
              <td className={tableClasses.td}>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <StateBadge state={row.state} />
                  {row.flagCount > 0 && (
                    <Badge tone="warning">
                      {row.flagCount} {row.flagCount === 1 ? "flag" : "flags"}
                    </Badge>
                  )}
                </span>
              </td>
              <td className={`${tableClasses.td} tabular-nums`}>
                {formatScore(row.aiScore)}
              </td>
              <td className={`${tableClasses.td} font-medium tabular-nums text-ink`}>
                {formatScore(row.finalScore)}
              </td>
              <td className={`${tableClasses.td} whitespace-nowrap`}>
                {formatSubmittedAt(row.submittedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
