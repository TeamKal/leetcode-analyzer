import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/actions";
import { EvaluationView } from "@/components/mentor/EvaluationView";
import {
  formatDate,
  StudentStatusBadge,
} from "@/components/student/SubmissionsList";
import { Alert } from "@/components/ui/Alert";
import { AppHeader } from "@/components/ui/AppHeader";
import { Badge } from "@/components/ui/Badge";
import { Section } from "@/components/ui/Section";
import { formatScore } from "@/lib/mentor/grading";
import { requireStudentAccess } from "@/lib/student/access";
import { isUuid, STUDENT_STATUS_HINTS } from "@/lib/student/status";
import { getMySubmission } from "@/lib/student/submissions";

export default async function MySubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const { studentId } = await requireStudentAccess();
  const submission = await getMySubmission(studentId, id);
  if (submission === undefined) notFound();

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        links={[{ href: "/", label: "Submit a solution" }]}
      />
      <main className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-6 sm:px-6">
        <Link
          href="/submissions"
          className="mb-4 inline-block rounded-md text-[13px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ← My submissions
        </Link>

        {submission === null ? (
          <Alert>This submission could not be loaded. Please try again.</Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-[26px] font-semibold tracking-[-0.03em] sm:text-[30px]">
                  {submission.problemTitle}
                </h1>
                <p className="mt-1 text-[15px] text-muted">
                  {submission.difficulty ? `${submission.difficulty} · ` : ""}
                  Submitted {formatDate(submission.submittedAt)}
                </p>
              </div>
              <StudentStatusBadge status={submission.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              {STUDENT_STATUS_HINTS[submission.status]}
            </p>

            <div className="mt-6 space-y-6">
              <Section
                id="grade"
                title="Final grade"
                aside={
                  submission.grade ? <Badge tone="success">From your mentor</Badge> : undefined
                }
              >
                {submission.grade ? (
                  <div>
                    <p className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                      {formatScore(submission.grade.finalScore)}
                      <span className="text-lg font-medium text-faint"> / 10</span>
                    </p>
                    {submission.grade.feedback && (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink-2">
                        {submission.grade.feedback}
                      </p>
                    )}
                    <p className="mt-4 text-xs text-muted">
                      Graded {formatDate(submission.grade.gradedAt)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Your mentor has not graded this yet.
                  </p>
                )}
              </Section>

              <Section
                id="ai"
                title="AI feedback"
                description="A first look from the AI. Your mentor's grade is the final one."
              >
                {submission.evaluation ? (
                  <EvaluationView evaluation={submission.evaluation} forStudent />
                ) : (
                  <p className="text-sm text-muted">
                    {submission.status === "failed"
                      ? "The AI could not score this submission."
                      : "The AI score will appear here in a minute or two."}
                  </p>
                )}
              </Section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
