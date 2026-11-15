import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileAccess } from "@/lib/supabase/authorization";

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "oauth_callback_failed");
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToLogin(request);
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return redirectToLogin(request);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return redirectToLogin(request);
    }

    const access = await getProfileAccess(supabase, user);
    if (access.status === "allowed") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (access.status !== "student-unlinked") {
      return NextResponse.redirect(new URL("/access-denied", request.url));
    }

    let linkingFailed = false;
    try {
      const { error } = await supabase.rpc("link_student_account");
      linkingFailed = Boolean(error);
    } catch {
      linkingFailed = true;
    }

    const linkedAccess = await getProfileAccess(supabase, user);
    if (linkedAccess.status === "allowed" && linkedAccess.role === "student") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (linkedAccess.status === "student-unlinked") {
      const enrollmentUrl = new URL("/enrollment-required", request.url);
      if (linkingFailed) enrollmentUrl.searchParams.set("issue", "link");
      return NextResponse.redirect(enrollmentUrl);
    }

    return NextResponse.redirect(new URL("/access-denied", request.url));
  } catch {
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }
}
