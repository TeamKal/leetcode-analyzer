"use server";

import { revalidatePath } from "next/cache";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { parseStudentInput, UUID_PATTERN } from "@/lib/students/validate";

const CLASS_ID = "1f9511be-187d-47f8-83aa-2fa62d0783fb";

async function getAdminClient() {
  try {
    const supabase = await createClient();
    const access = await getCurrentApplicationAccess(supabase);

    if (access.status !== "allowed" || access.role !== "admin") return null;
    return supabase;
  } catch {
    return null;
  }
}

export async function enrollStudent(input: unknown) {
  const supabase = await getAdminClient();
  if (!supabase) return { ok: false as const, error: "unauthorized" as const };

  const parsed = parseStudentInput(input);
  if (!parsed) {
    return { ok: false as const, error: "invalid_input" as const };
  }
  const {
    fullName: normalizedName,
    googleEmail: normalizedEmail,
    leetcodeUsername: normalizedLeetcodeUsername,
  } = parsed;

  try {
    const { error } = await supabase.rpc("enroll_student", {
      p_class_id: CLASS_ID,
      p_full_name: normalizedName,
      p_google_email: normalizedEmail,
      p_leetcode_username: normalizedLeetcodeUsername,
    });

    if (error) {
      return { ok: false as const, error: "enrollment_failed" as const };
    }

    revalidatePath("/admin");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "enrollment_failed" as const };
  }
}

export async function removeStudent(studentId: unknown) {
  const supabase = await getAdminClient();
  if (!supabase) return { ok: false as const, error: "unauthorized" as const };

  if (typeof studentId !== "string" || !UUID_PATTERN.test(studentId)) {
    return { ok: false as const, error: "invalid_input" as const };
  }

  try {
    const { data: student, error: lookupError } = await supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();

    if (lookupError) {
      return { ok: false as const, error: "removal_failed" as const };
    }
    if (!student) {
      return { ok: false as const, error: "student_not_found" as const };
    }

    const { data, error } = await supabase.rpc("remove_student", {
      p_student_id: student.id,
    });
    if (error || data === false) {
      return { ok: false as const, error: "removal_blocked" as const };
    }

    revalidatePath("/admin");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "removal_failed" as const };
  }
}
