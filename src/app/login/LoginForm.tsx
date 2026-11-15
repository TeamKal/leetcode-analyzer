"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialError?: string;
};

export function LoginForm({ initialError }: Props) {
  const [error, setError] = useState(initialError ?? "");
  const [isSigningIn, setIsSigningIn] = useState(false);

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
        setError(signInError.message);
        setIsSigningIn(false);
      }
    } catch {
      setError("Google sign-in could not be started. Please try again.");
      setIsSigningIn(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">LOCAL AUDIO</p>
        <h1 id="login-title">Sign in</h1>
        <p className="login-copy">
          Continue to your video transcription workspace.
        </p>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="button button-primary login-button"
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={isSigningIn}
        >
          {isSigningIn ? "Connecting to Google…" : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}
