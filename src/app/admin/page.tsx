import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand" href="/" aria-label="Local Audio home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>local audio</span>
        </Link>
        <div className="topbar-actions">
          <span className="admin-identity">Administrator</span>
          <form action={signOut} className="signout-form">
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <p className="admin-nav-label">MANAGEMENT</p>
          <nav className="admin-nav" aria-label="Admin dashboard">
            <a className="admin-nav-link is-active" href="#overview">
              Overview
            </a>
            <a className="admin-nav-link" href="#classes">
              Classes
            </a>
            <span className="admin-nav-link is-upcoming" aria-disabled="true">
              Mentors <span>Coming soon</span>
            </span>
            <a className="admin-nav-link" href="#students">
              Students
            </a>
          </nav>
        </aside>

        <div className="admin-main">
          <section className="admin-heading" id="overview">
            <div>
              <p className="eyebrow">ADMINISTRATION</p>
              <h1>Overview</h1>
              <p className="admin-description">
                A snapshot of classes, mentors, and student enrollment.
              </p>
            </div>
          </section>

          {hasDataError ? (
            <DashboardError />
          ) : (
            <>
              <section className="admin-metrics" aria-label="Overview totals">
                <Metric label="Total classes" value={classesCount} />
                <Metric label="Total mentors" value={mentorsCount} />
                <Metric label="Enrolled students" value={studentsCount} />
              </section>

              <section className="admin-section" id="classes">
                <div className="admin-section-heading">
                  <div>
                    <p className="eyebrow">ORGANIZATION</p>
                    <h2>Classes</h2>
                  </div>
                  <span className="admin-count">
                    {classesCount} {classesCount === 1 ? "class" : "classes"}
                  </span>
                </div>

                {dashboardClasses.length === 0 ? (
                  <div className="admin-empty-state">
                    <p>No classes yet</p>
                    <span>Classes will appear here when they are created.</span>
                  </div>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th scope="col">Class</th>
                          <th scope="col">Mentor</th>
                          <th scope="col">Students</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardClasses.map((classRow) => (
                          <tr key={classRow.id}>
                            <td className="admin-class-name">
                              {classRow.name}
                            </td>
                            <td>
                              {classRow.mentor ? (
                                <span className="admin-mentor-cell">
                                  <strong>
                                    {classRow.mentor.full_name ||
                                      classRow.mentor.email ||
                                      "Mentor"}
                                  </strong>
                                  {classRow.mentor.email && (
                                    <span>{classRow.mentor.email}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="admin-muted">Unassigned</span>
                              )}
                            </td>
                            <td className="admin-student-count">
                              {classRow.studentCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <StudentManagement students={students} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DashboardError() {
  return (
    <div className="admin-error" role="alert">
      Dashboard data could not be loaded. Check your access and try again.
    </div>
  );
}
