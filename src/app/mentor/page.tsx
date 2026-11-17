import { signOut } from "@/app/actions";
import {
  FilterTabs,
  SubmissionList,
  type SubmissionRow,
} from "@/components/mentor/SubmissionList";
import { MentorNav } from "@/components/mentor/MentorNav";
import { Alert } from "@/components/ui/Alert";
import { AppHeader } from "@/components/ui/AppHeader";
import { requireMentorAccess } from "@/lib/mentor/access";
import {
  firstOf,
  getGradingState,
  matchesFilter,
  MENTOR_VISIBLE_STATUSES,
  parseListFilter,
  readStringList,
  type ListFilter,
} from "@/lib/mentor/grading";

const MAX_ROWS = 300;

type Embedded<T> = T | T[] | null;
type RawRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  students: Embedded<{ full_name: string; google_email: string }>;
  problems: Embedded<{ title: string; difficulty: string | null }>;
  evaluations: Embedded<{ overall_score: number | string; review_flags: unknown }>;
  mentor_grades: Embedded<{ final_score: number | string }>;
};

export default async function MentorPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { supabase, role } = await requireMentorAccess();
  const filter = parseListFilter((await searchParams).show);

  // Row-level security limits this to the signed-in mentor's own classes.
  const { data, error } = await supabase
    .from("submissions")
    .select(
      "id,status,submitted_at,students(full_name,google_email),problems(title,difficulty),evaluations(overall_score,review_flags),mentor_grades(final_score)",
    )
    .in("status", [...MENTOR_VISIBLE_STATUSES])
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  const all: SubmissionRow[] = [];
  for (const raw of (data ?? []) as unknown as RawRow[]) {
    const state = getGradingState(raw.status);
    if (!state) continue;
    const student = firstOf(raw.students);
    const problem = firstOf(raw.problems);
    const evaluation = firstOf(raw.evaluations);
    const grade = firstOf(raw.mentor_grades);
    all.push({
      id: raw.id,
      studentName: student?.full_name ?? "",
      studentEmail: student?.google_email ?? "",
      problemTitle: problem?.title ?? "Unknown problem",
      difficulty: problem?.difficulty ?? null,
      state,
      aiScore: evaluation ? Number(evaluation.overall_score) : null,
      finalScore: grade ? Number(grade.final_score) : null,
      flagCount: evaluation ? readStringList(evaluation.review_flags).length : 0,
      submittedAt: raw.submitted_at,
    });
  }

  const counts: Record<ListFilter, number> = {
    needs: all.filter((row) => matchesFilter(row.state, "needs")).length,
    graded: all.filter((row) => matchesFilter(row.state, "graded")).length,
    all: all.length,
  };
  const rows = all.filter((row) => matchesFilter(row.state, filter));

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        wide
        roleLabel={role === "admin" ? "Administrator" : "Mentor"}
      />
      <main className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-8 sm:px-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Submissions
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          Review how your students explained their solutions. The AI score is a
          first look; your grade is the final one.
        </p>

        <MentorNav active="submissions" />

        <div className="mt-6 space-y-5">
          {error ? (
            <Alert>Submissions could not be loaded. Please try again.</Alert>
          ) : (
            <>
              <FilterTabs active={filter} counts={counts} />
              <SubmissionList rows={rows} filter={filter} />
              {data && data.length >= MAX_ROWS && (
                <p className="text-xs text-muted">
                  Showing the {MAX_ROWS} most recent submissions.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
