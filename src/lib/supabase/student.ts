import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";

export type StudentAccess =
  | { status: "allowed"; studentId: string; userId: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "not-enrolled" }
  | { status: "error" };

export async function getCurrentStudentAccess(
  supabase: SupabaseClient,
): Promise<StudentAccess> {
  const access = await getCurrentApplicationAccess(supabase);
  if (access.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (access.status !== "allowed" || access.role !== "student") {
    return { status: "forbidden" };
  }

  try {
    const { data: student, error } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", access.user.id)
      .maybeSingle();

    if (error) return { status: "error" };
    if (!student) return { status: "not-enrolled" };

    return {
      status: "allowed",
      studentId: student.id,
      userId: access.user.id,
    };
  } catch {
    return { status: "error" };
  }
}
