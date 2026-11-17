"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryEvaluation } from "@/app/mentor/submissions/[id]/retry";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

/** Shows why the AI evaluation failed and lets the mentor run it again. */
export function RetryEvaluation({
  submissionId,
  reason,
}: {
  submissionId: string;
  reason: string;
}) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState("");

  async function handleRetry() {
    setError("");
    setIsRetrying(true);
    try {
      const result = await retryEvaluation(submissionId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("The evaluation could not be restarted. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">Why it failed</h3>
        <p className="mt-1.5 text-sm leading-6 text-ink-2">{reason}</p>
      </div>
      {error && (
        <div aria-live="polite">
          <Alert>{error}</Alert>
        </div>
      )}
      <Button
        variant="secondary"
        onClick={() => void handleRetry()}
        disabled={isRetrying}
        aria-busy={isRetrying}
      >
        {isRetrying ? "Restarting…" : "Try the AI evaluation again"}
      </Button>
      <p className="text-xs text-muted">
        It is queued and usually finishes within a minute or two. A submission
        can be graded once the AI evaluation is done.
      </p>
    </div>
  );
}
