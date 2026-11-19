import { redirect } from "next/navigation";
import { HomeWorkspace } from "@/components/dashboard/HomeWorkspace";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { hasProfileFlag } from "@/lib/flags/profileFlags";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Admins and mentors have their own homes; only students see the submit page.
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);
  if (access.status === "allowed") {
    if (access.role === "admin") redirect("/admin");
    if (access.role === "mentor") redirect("/mentor");
  }

  // Decided here, on the server, from the signed-in account. Only this yes/no
  // reaches the browser.
  const extras =
    access.status === "allowed" && access.role === "student"
      ? await hasProfileFlag(access.user.id, "ui_extras")
      : false;

  return <HomeWorkspace extras={extras} />;
}
