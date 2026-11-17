import { signOut } from "@/app/actions";
import { StudentManagement, type AdminStudent } from "@/app/admin/StudentManagement";
import { MentorNav } from "@/components/mentor/MentorNav";
import { Alert } from "@/components/ui/Alert";
import { AppHeader } from "@/components/ui/AppHeader";
import { EmptyState } from "@/components/ui/Section";
import { requireMentorAccess } from "@/lib/mentor/access";
import { enrollMyStudent, removeMyStudent } from "./actions";

export default async function MentorStudentsPage() {
  const { supabase, user, role } = await requireMentorAccess();

  // Mentors only see their own classes and students (row-level security),
  // and the filter below keeps an admin's view to their own classes too.
  let classQuery = supabase.from("classes").select("id,name").order("name");
  if (role === "mentor") classQuery = classQuery.eq("mentor_id", user.id);

  const [classResult, studentResult] = await Promise.all([
    classQuery,
    supabase
      .from("students")
      .select("id,class_id,user_id,full_name,google_email,leetcode_username")
      .order("full_name")
      .order("id")
      .limit(1000),
  ]);

  const classes = classResult.data ?? [];
  const classIds = new Set(classes.map((classRow) => classRow.id));
  const students = ((studentResult.data ?? []) as AdminStudent[]).filter(
    (student) => classIds.has(student.class_id),
  );
  const hasError = Boolean(classResult.error || studentResult.error);

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        wide
        roleLabel={role === "admin" ? "Administrator" : "Mentor"}
      />
      <main className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-8 sm:px-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Students
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          Add the students in your class. They sign in with the Google account
          you enter here.
        </p>

        <MentorNav active="students" />

        <div className="mt-6">
          {hasError ? (
            <Alert>Students could not be loaded. Please try again.</Alert>
          ) : classes.length === 0 ? (
            <EmptyState title="No class assigned yet">
              Ask an administrator to assign a class to you, then you can add
              students here.
            </EmptyState>
          ) : (
            <StudentManagement
              students={students}
              classes={classes}
              onEnroll={enrollMyStudent}
              onRemove={removeMyStudent}
            />
          )}
        </div>
      </main>
    </div>
  );
}
