import { NextResponse } from "next/server";
import { reviewPhaseFromStatus } from "@/lib/submit/progress";
import { isUuid } from "@/lib/student/status";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStudentAccess } from "@/lib/supabase/student";

export const runtime = "nodejs";

/**
 * Where a student's own submission is in its AI review. Read-only. The student
 * comes from the session, the submission must be theirs, and the answer is only
 * a coarse phase: never the transcript, scores or anything else.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let studentId: string;
  try {
    const supabase = await createClient();
    const access = await getCurrentStudentAccess(supabase);
    if (access.status === "unauthenticated") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (access.status !== "allowed") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    studentId = access.studentId;
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  try {
    const admin = createAuthAdminClient();
    const { data, error } = await admin
      .from("submissions")
      .select("status")
      .eq("id", id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { phase: reviewPhaseFromStatus(data.status) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
