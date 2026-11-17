import { redirect } from "next/navigation";
import { SubmitWorkspace } from "@/components/submit/SubmitWorkspace";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Mentors have their own home; everyone else keeps the submit page.
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);
  if (access.status === "allowed" && access.role === "mentor") {
    redirect("/mentor");
  }

  return <SubmitWorkspace />;
}
