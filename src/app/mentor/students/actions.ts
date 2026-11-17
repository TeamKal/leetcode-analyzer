"use server";

import { revalidatePath } from "next/cache";
import { parseStudentInput, UUID_PATTERN } from "@/lib/students/validate";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

/** The signed-in mentor, from the session. Admins are allowed too. */
async function getMentorContext() {
  try {
    const supabase = await createClient();
    const access = await getCurrentApplicationAccess(supabase);
    if (
      access.status !== "allowed" ||
      (access.role !== "mentor" && access.role !== "admin")
    ) {
      return null;
    }
    return { supabase, userId: access.user.id, role: access.role };
  } catch {
    return null;
  }
}

/** Adds a student to one of the signed-in mentor's own classes. The database re-checks this. */
export async function enrollMyStudent(input: unknown) {
  const context = await getMentorContext();
  if (!context) return { ok: false as const, error: "unauthorized" };

  const parsed = parseStudentInput(input);
  const classId = (input as { classId?: unknown } | null)?.classId;
  if (!parsed || typeof classId !== "string" || !UUID_PATTERN.test(classId)) {
    return { ok: false as const, error: "invalid_input" };
  }

  try {
    // The class must be one this mentor owns (admins may use any class).
    let query = context.supabase.from("classes").select("id").eq("id", classId);
    if (context.role === "mentor") query = query.eq("mentor_id", context.userId);
    const { data: classRow, error: classError } = await query.maybeSingle();
    if (classError || !classRow) {
      return { ok: false as const, error: "unauthorized" };
    }

    const { error } = await context.supabase.rpc("enroll_student", {
      p_class_id: classRow.id,
      p_full_name: parsed.fullName,
      p_google_email: parsed.googleEmail,
      p_leetcode_username: parsed.leetcodeUsername,
    });
    if (error) return { ok: false as const, error: "enrollment_failed" };

    revalidatePath("/mentor/students");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "enrollment_failed" };
  }
}

/** Removes a student from the mentor's class, if they have no submissions. */
export async function removeMyStudent(studentId: unknown) {
  const context = await getMentorContext();
  if (!context) return { ok: false as const, error: "unauthorized" };

  if (typeof studentId !== "string" || !UUID_PATTERN.test(studentId)) {
    return { ok: false as const, error: "invalid_input" };
  }

  try {
    // Row-level security only shows students in this mentor's classes.
    const { data: student, error: lookupError } = await context.supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();
    if (lookupError) return { ok: false as const, error: "removal_failed" };
    if (!student) return { ok: false as const, error: "student_not_found" };

    const { error } = await context.supabase.rpc("remove_student", {
      p_student_id: student.id,
    });
    if (error) return { ok: false as const, error: "removal_blocked" };

    revalidatePath("/mentor/students");
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "removal_failed" };
  }
}
