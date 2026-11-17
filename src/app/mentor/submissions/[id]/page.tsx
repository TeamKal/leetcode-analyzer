import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/actions";
import { EvaluationView, type EvaluationData } from "@/components/mentor/EvaluationView";
import { GradeForm } from "@/components/mentor/GradeForm";
import { RetryEvaluation } from "@/components/mentor/RetryEvaluation";
import { formatSubmittedAt, StateBadge } from "@/components/mentor/SubmissionList";
import { Alert } from "@/components/ui/Alert";
import { AppHeader } from "@/components/ui/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/ui/Section";
import { requireMentorAccess } from "@/lib/mentor/access";
import {
  describeFailureReason,
  firstOf,
  formatScore,
  getGradingState,
} from "@/lib/mentor/grading";
import { createStudentVideoReadUrl } from "@/lib/r2/presignRead";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Embedded<T> = T | T[] | null;
type Row = {
  id: string;
  student_id: string;
  status: string;
  leetcode_submission_url: string;
  video_object_key: string;
  video_deleted_at: string | null;
  transcript: string | null;
  submitted_at: string | null;
  students: Embedded<{ full_name: string; google_email: string }>;
  problems: Embedded<{ title: string; difficulty: string | null }>;
  evaluations: Embedded<EvaluationData>;
  mentor_grades: Embedded<{ final_score: number | string; feedback: string | null; graded_at: string }>;
  evaluation_jobs: Embedded<{ id: string; status: string; last_error: string | null }>;
};

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase, role } = await requireMentorAccess();

  // Row-level security hides submissions from other mentors' classes.
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id,student_id,status,leetcode_submission_url,video_object_key,video_deleted_at,transcript,submitted_at,students(full_name,google_email),problems(title,difficulty),evaluations(overall_score,feedback,scores,strengths,improvements,review_flags),mentor_grades(final_score,feedback,graded_at),evaluation_jobs(id,status,last_error)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <Shell role={role}>
        <Alert>This submission could not be loaded. Please try again.</Alert>
      </Shell>
    );
  }
  if (!data) notFound();

  const row = data as unknown as Row;
  const state = getGradingState(row.status);
  if (!state) notFound();

  const student = firstOf(row.students);
  const problem = firstOf(row.problems);
  const evaluation = firstOf(row.evaluations);
  const grade = firstOf(row.mentor_grades);
  const job = firstOf(row.evaluation_jobs);

  // A short-lived private link, only while the video still exists.
  let videoUrl: string | null = null;
  if (!row.video_deleted_at && row.video_object_key) {
    try {
      videoUrl = await createStudentVideoReadUrl(
        row.student_id,
        row.video_object_key,
      );
    } catch {
      videoUrl = null;
    }
  }

  return (
    <Shell role={role}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">
            {student?.full_name || student?.google_email || "Student"}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {problem?.title ?? "Unknown problem"}
            {problem?.difficulty ? ` · ${problem.difficulty}` : ""} · Submitted{" "}
            {formatSubmittedAt(row.submitted_at)}
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section id="video" title="Video explanation">
            {videoUrl ? (
              <video
                controls
                preload="metadata"
                src={videoUrl}
                className="aspect-video w-full rounded-lg bg-black"
              />
            ) : (
              <Alert tone="info">
                {row.video_deleted_at
                  ? "The video was removed after the retention period. The transcript and grade are kept."
                  : "The video could not be loaded right now."}
              </Alert>
            )}
            {isHttpUrl(row.leetcode_submission_url) && (
              <p className="mt-3 text-[13px]">
                <a
                  href={row.leetcode_submission_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink underline underline-offset-2"
                >
                  Open the LeetCode link
                </a>
              </p>
            )}
          </Section>

          <Section id="transcript" title="Transcript">
            {row.transcript ? (
              <p className="whitespace-pre-wrap text-sm leading-7 text-ink-2">
                {row.transcript}
              </p>
            ) : (
              <p className="text-sm text-muted">There is no transcript.</p>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            id="ai"
            title="AI evaluation"
            description="A first look from the AI. It does not decide the final grade."
          >
            {evaluation ? (
              <EvaluationView evaluation={evaluation} />
            ) : (
              state === "failed" ? (
                <RetryEvaluation
                  submissionId={row.id}
                  reason={describeFailureReason(job?.last_error)}
                />
              ) : (
                <Alert tone="info">
                  The AI has not finished scoring this submission yet.
                </Alert>
              )
            )}
          </Section>

          <Section
            id="grade"
            title="Your grade"
            aside={grade ? <Badge tone="success">Final</Badge> : undefined}
          >
            {grade ? (
              <div>
                <p className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                  {formatScore(grade.final_score)}
                  <span className="text-lg font-medium text-faint"> / 10</span>
                </p>
                {grade.feedback && (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink-2">
                    {grade.feedback}
                  </p>
                )}
                <p className="mt-4 text-xs text-muted">
                  Graded {formatSubmittedAt(grade.graded_at)}. The grade is
                  final.
                </p>
              </div>
            ) : state === "needs_grading" ? (
              <GradeForm
                submissionId={row.id}
                suggestedScore={evaluation ? Number(evaluation.overall_score) : null}
              />
            ) : (
              <Alert tone="info">
                This submission can be graded once the AI evaluation is done.
              </Alert>
            )}
          </Section>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  role,
  children,
}: {
  role: "admin" | "mentor";
  children: React.ReactNode;
}) {
  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        wide
        roleLabel={role === "admin" ? "Administrator" : "Mentor"}
      />
      <main className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-6 sm:px-6">
        <Link
          href="/mentor"
          className="mb-4 inline-block rounded-md text-[13px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ← All submissions
        </Link>
        {children}
      </main>
    </div>
  );
}
