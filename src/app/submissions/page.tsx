import { signOut } from "@/app/actions";
import { SubmissionsList } from "@/components/student/SubmissionsList";
import { Alert } from "@/components/ui/Alert";
import { AppHeader } from "@/components/ui/AppHeader";
import { requireStudentAccess } from "@/lib/student/access";
import { listMySubmissions } from "@/lib/student/submissions";

export default async function MySubmissionsPage() {
  const { studentId } = await requireStudentAccess();
  const rows = await listMySubmissions(studentId);

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        links={[{ href: "/", label: "Submit a solution" }]}
      />
      <main className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          My submissions
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          Follow each solution from AI score to your mentor&apos;s final grade.
        </p>

        <div className="mt-8">
          {rows === null ? (
            <Alert>Your submissions could not be loaded. Please try again.</Alert>
          ) : (
            <SubmissionsList rows={rows} />
          )}
        </div>
      </main>
    </div>
  );
}
