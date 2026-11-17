import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    intro?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { error, intro } = await searchParams;
  const initialError =
    error === "oauth_callback_failed"
      ? "We couldn't finish signing you in with Google. Please try again."
      : undefined;

  // The welcome intro plays once per browser session (a session cookie records
  // that it has played), never after a sign-in error, and can be replayed with
  // ?intro=1. Deciding on the server lets the page start fully black.
  const introSeen = (await cookies()).get("lca-intro-seen")?.value === "1";
  const playIntro = !initialError && (intro === "1" || !introSeen);

  return <LoginForm initialError={initialError} playIntro={playIntro} />;
}
