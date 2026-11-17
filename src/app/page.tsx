import { redirect } from "next/navigation";
import { SubmitWorkspace } from "@/components/submit/SubmitWorkspace";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Admins and mentors have their own homes; only students see the submit page.
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);
  if (access.status === "allowed") {
    if (access.role === "admin") redirect("/admin");
    if (access.role === "mentor") redirect("/mentor");
  }

  return <SubmitWorkspace />;
}
