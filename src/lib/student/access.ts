import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";

/** For student pages: the student comes from the session, never from the request. */
export async function requireStudentAccess() {
  const supabase = await createClient();
  const access = await getCurrentStudentAccess(supabase);

  if (access.status === "unauthenticated") redirect("/login");
  // Admins and mentors have their own homes; "/" sends them there.
  if (access.status === "forbidden") redirect("/");
  if (access.status === "not-enrolled") redirect("/enrollment-required");
  if (access.status !== "allowed") redirect("/access-denied");

  return { studentId: access.studentId };
}
