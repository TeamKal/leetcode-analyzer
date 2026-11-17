import "server-only";

import { redirect } from "next/navigation";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

/** For mentor pages: the role and user come from the session, never from the request. */
export async function requireMentorAccess() {
  const supabase = await createClient();
  const access = await getCurrentApplicationAccess(supabase);

  if (access.status === "unauthenticated") redirect("/login");
  if (
    access.status !== "allowed" ||
    (access.role !== "mentor" && access.role !== "admin")
  ) {
    redirect("/access-denied");
  }

  return { supabase, user: access.user, role: access.role };
}
