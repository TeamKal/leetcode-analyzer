import { redirect } from "next/navigation";
import { HomeWorkspace } from "@/components/dashboard/HomeWorkspace";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { canRunFinale } from "@/lib/flags/blockedServer";
import { getMascotMode } from "@/lib/flags/profileFlags";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  // Admins and mentors have their own homes; only students see the submit page.
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);
  if (access.status === "allowed") {
    if (access.role === "admin") redirect("/admin");
    if (access.role === "mentor") redirect("/mentor");
  }

  // Decided here, on the server, from the signed-in account. Only this one
  // word ("off", "heart" or "full") reaches the browser.
  const extras =
    access.status === "allowed" && access.role === "student"
      ? await getMascotMode(access.user.id, "ui_extras")
      : "off";

  // Only the accounts you listed can run the finale at all.
  const finale =
    access.status === "allowed" && access.role === "student"
      ? await canRunFinale(access.user.id)
      : false;

  return <HomeWorkspace extras={extras} finale={finale} />;
}
