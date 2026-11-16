import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getProfileAccess } from "@/lib/supabase/authorization";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"];

function redirectWithAuthCookies(response: NextResponse, destination: URL) {
  const redirectResponse = NextResponse.redirect(destination);

  response.cookies
    .getAll()
    .forEach((cookie) => redirectResponse.cookies.set(cookie));
  for (const name of CACHE_HEADERS) {
    const value = response.headers.get(name);
    if (value) redirectResponse.headers.set(name, value);
  }

  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/api/cron/evaluation" ||
    pathname === "/api/cron/video-cleanup"
  ) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  const isLoginPage = pathname === "/login";
  const isAuthCallback =
    pathname === "/auth/callback" || pathname.startsWith("/auth/callback/");
  const isAccessDeniedPage = pathname === "/access-denied";

  let user = null;
  try {
    const {
      data: { user: authenticatedUser },
    } = await supabase.auth.getUser();
    user = authenticatedUser;
  } catch {
    user = null;
  }

  if (!user) {
    if (isLoginPage || isAuthCallback) return supabaseResponse;
    return redirectWithAuthCookies(
      supabaseResponse,
      new URL("/login", request.url),
    );
  }

  if (isAuthCallback || isAccessDeniedPage) return supabaseResponse;

  const access = await getProfileAccess(supabase, user);
  if (isLoginPage) {
    if (access.status === "allowed") {
      return redirectWithAuthCookies(
        supabaseResponse,
        new URL("/", request.url),
      );
    }
    return redirectWithAuthCookies(
      supabaseResponse,
      new URL(
        access.status === "student-unlinked"
          ? "/enrollment-required"
          : "/access-denied",
        request.url,
      ),
    );
  }

  if (access.status === "allowed") return supabaseResponse;
  if (access.status === "student-unlinked") {
    if (pathname === "/enrollment-required") return supabaseResponse;
    return redirectWithAuthCookies(
      supabaseResponse,
      new URL("/enrollment-required", request.url),
    );
  }

  return redirectWithAuthCookies(
    supabaseResponse,
    new URL("/access-denied", request.url),
  );
}

export const config = {
  matcher: ["/((?!_next/|.*\\.[^/]+$).*)"],
};
