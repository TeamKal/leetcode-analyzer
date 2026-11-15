import { notFound, redirect } from "next/navigation";
import { getCurrentStudentAccess } from "@/lib/supabase/student";
import { createClient } from "@/lib/supabase/server";
import { R2TestForm } from "./R2TestForm";

export default async function R2TestPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const supabase = await createClient();
  const access = await getCurrentStudentAccess(supabase);

  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status !== "allowed") {
    redirect("/access-denied");
  }

  return (
    <main className="login-page">
      <section
        className="login-panel r2-test-panel"
        aria-labelledby="r2-test-title"
      >
        <p className="eyebrow">TEMPORARY DEVELOPMENT TEST</p>
        <h1 id="r2-test-title">Private video upload</h1>
        <p className="login-copy">
          Upload and verify a video in private storage. This test does not
          create a submission or save a transcript.
        </p>
        <R2TestForm />
      </section>
    </main>
  );
}
