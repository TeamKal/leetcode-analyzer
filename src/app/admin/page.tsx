import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/ui/AppHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, Section, tableClasses } from "@/components/ui/Section";
import { MentorProvisioning } from "./MentorProvisioning";
import { StudentManagement, type AdminStudent } from "./StudentManagement";

const PAGE_SIZE = 1000;

type ClassRow = {
  id: string;
  name: string;
  mentor_id: string | null;
};

type MentorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type StudentRow = AdminStudent;

type DashboardClass = ClassRow & {
  mentor: MentorRow | null;
  studentCount: number;
};

async function fetchAllClasses(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const classes: ClassRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("classes")
      .select("id,name,mentor_id")
      .order("name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: null, error: true };

    const page = (data ?? []) as ClassRow[];
    classes.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: classes, error: false };
}

async function fetchAllMentors(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const mentors: MentorRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .eq("role", "mentor")
      .order("full_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: null, error: true };

    const page = (data ?? []) as MentorRow[];
    mentors.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: mentors, error: false };
}

async function fetchAllStudents(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const students: StudentRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("students")
      .select("id,class_id,user_id,full_name,google_email,leetcode_username")
      .order("full_name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: null, error: true };

    const page = (data ?? []) as StudentRow[];
    students.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: students, error: false };
}

export default async function AdminPage() {
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);

  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status !== "allowed" || access.role !== "admin") {
    redirect("/access-denied");
  }

  const [classResult, mentorResult, studentResult] = await Promise.all([
    fetchAllClasses(supabase),
    fetchAllMentors(supabase),
    fetchAllStudents(supabase),
  ]);

  const hasDataError =
    classResult.error || mentorResult.error || studentResult.error;
  let dashboardClasses: DashboardClass[] = [];
  let classesCount = 0;
  let mentorsCount = 0;
  const students = studentResult.data ?? [];
  const studentsCount = students.length;

  if (!hasDataError && classResult.data && mentorResult.data) {
    classesCount = classResult.data.length;
    mentorsCount = mentorResult.data.length;
    const mentorsById = new Map(
      mentorResult.data.map((mentor) => [mentor.id, mentor]),
    );
    const studentCountsByClass = new Map<string, number>();
    students.forEach((student) => {
      studentCountsByClass.set(
        student.class_id,
        (studentCountsByClass.get(student.class_id) ?? 0) + 1,
      );
    });

    dashboardClasses = classResult.data.map((classRow) => ({
      ...classRow,
      mentor: classRow.mentor_id
        ? (mentorsById.get(classRow.mentor_id) ?? null)
        : null,
      studentCount: studentCountsByClass.get(classRow.id) ?? 0,
    }));
  }

  const mentorClasses = new Map<string, string[]>();
  dashboardClasses.forEach((classRow) => {
    if (!classRow.mentor_id) return;
    mentorClasses.set(classRow.mentor_id, [
      ...(mentorClasses.get(classRow.mentor_id) ?? []),
      classRow.name,
    ]);
  });
  const mentors = mentorResult.data ?? [];

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader signOutAction={signOut} wide roleLabel="Administrator" />

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-8 sm:px-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Overview
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          A snapshot of classes, mentors and student enrollment.
        </p>

        <nav
          aria-label="Admin sections"
          className="mt-6 flex gap-1 overflow-x-auto border-b border-line"
        >
          {[
            ["#classes", "Classes"],
            ["#mentors", "Mentors"],
            ["#students", "Students"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-t-md px-3 py-2.5 text-[13px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-6">
          {hasDataError ? (
            <Alert>
              Dashboard data could not be loaded. Check your access and try
              again.
            </Alert>
          ) : (
            <>
              <section
                aria-label="Overview totals"
                className="grid gap-4 sm:grid-cols-3"
              >
                <Metric label="Total classes" value={classesCount} />
                <Metric label="Total mentors" value={mentorsCount} />
                <Metric label="Enrolled students" value={studentsCount} />
              </section>

              <Section
                id="classes"
                title="Classes"
                aside={
                  <Badge>
                    {classesCount} {classesCount === 1 ? "class" : "classes"}
                  </Badge>
                }
              >
                {dashboardClasses.length === 0 ? (
                  <EmptyState title="No classes yet">
                    Classes will appear here when they are created.
                  </EmptyState>
                ) : (
                  <div className={tableClasses.wrap}>
                    <table className={tableClasses.table}>
                      <thead>
                        <tr>
                          <th scope="col" className={tableClasses.th}>Class</th>
                          <th scope="col" className={tableClasses.th}>Mentor</th>
                          <th scope="col" className={tableClasses.th}>Students</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardClasses.map((classRow) => (
                          <tr key={classRow.id}>
                            <td className={`${tableClasses.td} font-medium text-ink`}>
                              {classRow.name}
                            </td>
                            <td className={tableClasses.td}>
                              {classRow.mentor ? (
                                <MentorName mentor={classRow.mentor} />
                              ) : (
                                <span className="text-faint">Unassigned</span>
                              )}
                            </td>
                            <td className={`${tableClasses.td} tabular-nums`}>
                              {classRow.studentCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              <Section
                id="mentors"
                title="Mentors"
                description="Give an existing Google account the mentor role for a class."
                aside={
                  <Badge>
                    {mentorsCount} {mentorsCount === 1 ? "mentor" : "mentors"}
                  </Badge>
                }
              >
                {mentors.length > 0 && (
                  <ul className="mb-6 divide-y divide-line rounded-lg border border-line">
                    {mentors.map((mentor) => (
                      <li
                        key={mentor.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <MentorName mentor={mentor} />
                        <span className="text-[13px] text-muted">
                          {mentorClasses.get(mentor.id)?.join(", ") ??
                            "No class yet"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <MentorProvisioning
                  classes={dashboardClasses.map(({ id, name }) => ({
                    id,
                    name,
                  }))}
                />
              </Section>

              <StudentManagement students={students} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {value}
      </p>
    </div>
  );
}

function MentorName({ mentor }: { mentor: MentorRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium text-ink">
        {mentor.full_name || mentor.email || "Mentor"}
      </span>
      {mentor.email && mentor.full_name && (
        <span className="text-[13px] text-muted">{mentor.email}</span>
      )}
    </span>
  );
}
