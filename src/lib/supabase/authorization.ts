import type { SupabaseClient, User } from "@supabase/supabase-js";

export type ApplicationAccess =
  | { status: "unauthenticated" }
  | { status: "allowed"; role: "admin" | "mentor" | "student"; user: User }
  | { status: "student-unlinked"; user: User }
  | { status: "profile-missing"; user: User }
  | { status: "unknown-role"; user: User }
  | { status: "error"; user?: User };

export async function getProfileAccess(
  supabase: SupabaseClient,
  user: User,
): Promise<ApplicationAccess> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return { status: "error", user };
    if (!profile) return { status: "profile-missing", user };

    if (profile.role === "admin" || profile.role === "mentor") {
      return { status: "allowed", role: profile.role, user };
    }
    if (profile.role !== "student") {
      return { status: "unknown-role", user };
    }

    const { data: linkedStudent, error: studentError } = await supabase
      .from("students")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (studentError) return { status: "error", user };
    if (!linkedStudent) return { status: "student-unlinked", user };

    return { status: "allowed", role: "student", user };
  } catch {
    return { status: "error", user };
  }
}

export async function getCurrentApplicationAccess(
  supabase: SupabaseClient,
): Promise<ApplicationAccess> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return { status: "unauthenticated" };
    return getProfileAccess(supabase, user);
  } catch {
    return { status: "unauthenticated" };
  }
}
