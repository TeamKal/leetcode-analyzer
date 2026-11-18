"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  AuthMascot,
  type MascotHandle,
  type MascotMood,
} from "@/components/login/mascot/AuthMascot";
import { MascotLife } from "@/components/login/mascot/MascotLife";
import { WelcomeIntro } from "@/components/login/mascot/WelcomeIntro";
import { FitToHeight } from "@/components/login/FitToHeight";
import { LeftBackdrop } from "@/components/login/LeftBackdrop";
import { ProductDemo } from "@/components/login/ProductDemo";
import { RightPanelBackdrop } from "@/components/login/RightPanelBackdrop";
import { StrokeTitle } from "@/components/login/StrokeTitle";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialError?: string;
  /** Whether the welcome intro plays (decided on the server). */
  playIntro?: boolean;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.82-.07-1.6-.21-2.36H12v4.47h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.73Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.34v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62v-3.1H1.34a12 12 0 0 0 0 10.82l4.02-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.34 6.59l4.02 3.1A7.2 7.2 0 0 1 12 4.75Z"
      />
    </svg>
  );
}

export function LoginForm({ initialError, playIntro = false }: Props) {
  const [error, setError] = useState(initialError ?? "");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authAreaRef = useRef<HTMLElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const mascotControlRef = useRef<MascotHandle | null>(null);
  // Set by the intro and by the life controller's flights (null = normal).
  const [forcedMood, setForcedMood] = useState<MascotMood | null>(null);
  const [introDone, setIntroDone] = useState(!playIntro);
  const handleIntroDone = useCallback(() => setIntroDone(true), []);

  async function signInWithGoogle() {
    setError("");
    setIsSigningIn(true);

    try {
      const { error: signInError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        // Friendly text for visitors; the provider's raw message stays out of the UI.
        setError("We couldn't reach Google just now. Please try again.");
        setIsSigningIn(false);
      }
    } catch {
      setError("We couldn't reach Google just now. Please try again.");
      setIsSigningIn(false);
    }
  }

  return (
    <main className="ds min-h-screen bg-page font-sans text-ink antialiased flex flex-col md:grid md:grid-cols-[58fr_42fr] lg:grid-cols-[68fr_32fr]">
      <section
        aria-labelledby="product-title"
        className="relative order-last flex flex-col overflow-hidden bg-[#09090b] px-6 py-12 text-white md:order-none md:h-screen md:px-10 md:py-8 lg:px-16 xl:px-20"
      >
        <LeftBackdrop />
        {/* Product name: outlined (stroke) text that draws itself in once, after
            the welcome intro, centred at the top of the panel. The box has a
            fixed height, so nothing shifts while it draws. */}
        <div className="relative mx-auto w-full max-w-[900px]">
          <h1
            id="product-title"
            aria-label="Student Tracker"
            className="relative h-[clamp(76px,min(10vw,15vh),150px)] w-full shrink-0 text-white"
          >
            <StrokeTitle text="Student Tracker" start={introDone} />
          </h1>
          <p className="mt-2.5 text-center text-[14px] leading-6 text-zinc-400 md:truncate md:text-[15px]">
            Explain your solution on camera. AI scores it, your mentor grades it.
          </p>
        </div>
        {/* The demo supports the title: a narrower column, centred in the space
            that is left, with room on every side. */}
        <div className="relative mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col pt-7 md:pt-5">
          <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col">
            <FitToHeight>
              <ProductDemo />
            </FitToHeight>
          </div>
        </div>
      </section>

      <section
        ref={authAreaRef}
        aria-labelledby="login-title"
        className="relative flex flex-col items-center justify-center border-line bg-surface px-6 py-12 md:min-h-screen md:border-l"
      >
        <RightPanelBackdrop />
        <div className="relative w-full max-w-[320px]">
          <Logo className="mb-6 md:hidden" />
          <div
            ref={mascotRef}
            data-intro={playIntro ? "pending" : "off"}
            className="mx-auto mb-4 w-[116px] md:w-[156px]"
          >
            <AuthMascot
              targetRef={googleButtonRef}
              areaRef={authAreaRef}
              controlRef={mascotControlRef}
              mood={forcedMood ?? (isSigningIn ? "busy" : error ? "error" : "idle")}
              className="w-full"
            />
          </div>
          <h2
            id="login-title"
            className="text-[26px] font-semibold tracking-[-0.025em]"
          >
            Welcome
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in with Google to submit your solution video and see your
            feedback.
          </p>

          {error && (
            <div className="mt-5">
              <Alert>{error}</Alert>
            </div>
          )}

          <div ref={googleButtonRef} className="mt-6">
            <Button
              variant="primary"
              fullWidth
              onClick={() => void signInWithGoogle()}
              disabled={isSigningIn}
            >
              {isSigningIn ? (
                <Spinner />
              ) : (
                <span className="grid size-6 place-items-center rounded-full bg-white">
                  <GoogleIcon />
                </span>
              )}
              {isSigningIn ? "Opening Google…" : "Continue with Google"}
            </Button>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-muted">
            See how your information is used in our{" "}
            <Link
              href="/privacy"
              className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              privacy policy
            </Link>
            .
          </p>
        </div>
      </section>
      {playIntro && (
        <WelcomeIntro
          flyRef={mascotRef}
          onMood={setForcedMood}
          onDone={handleIntroDone}
        />
      )}
      <MascotLife
        flyRef={mascotRef}
        controlRef={mascotControlRef}
        buttonRef={googleButtonRef}
        active={introDone && !isSigningIn && !error}
        onMood={setForcedMood}
      />
    </main>
  );
}
