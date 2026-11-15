import { redirect } from "next/navigation";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { MentorTestForm } from "./MentorTestForm";

export default async function MentorTestPage() {
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);

  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status !== "allowed" || access.role !== "admin") {
    redirect("/access-denied");
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="mentor-test-title">
        <p className="eyebrow">ADMIN TEST</p>
        <h1 id="mentor-test-title">Mentor provisioning</h1>
        <p className="login-copy">
          Find an existing Google account, then assign it to a class as a
          mentor.
        </p>
        <MentorTestForm />
      </section>
    </main>
  );
}
