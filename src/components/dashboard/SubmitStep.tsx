"use client";

import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { isBusy, type Tracker } from "@/lib/submit/progress";
import { isPageLocked } from "@/lib/student/lockedPages";
import { Magnet } from "./Magnet";
import { TraceProgress } from "./TraceProgress";
import "./dashboard.css";

type Props = {
  tracker: Tracker;
  /** The link and the recording are both ready. */
  ready: boolean;
  /** What is still missing, in plain words, while not ready. */
  missing: string[];
  canRetry: boolean;
  onSubmit: () => void;
  onAnother: () => void;
};

function SuccessCard({ onAnother }: { onAnother: () => void }) {
  return (
    <div
      role="status"
      className="mt-4 flex items-start gap-4 rounded-xl border border-success-line bg-success-soft p-5"
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-success-text"
      >
        <svg
          viewBox="0 0 16 16"
          className="ok-check size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-success-text">
          Submission successful
        </h3>
        <p className="mt-1 max-w-[52ch] text-sm leading-6 text-ink-2">
          Your recording and explanation were received. The AI review runs in the
          background, and your mentor will give the final grade.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {!isPageLocked("submissions") && (
            <Link href="/submissions" className={buttonClasses("primary", "sm")}>
              View in Submissions
            </Link>
          )}
          <Button
            variant={isPageLocked("submissions") ? "primary" : "secondary"}
            size="sm"
            onClick={onAnother}
          >
            Submit another
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 3: submit, and watch what is really happening. Before a run it shows the
 * button (enabled only when the link and the recording are ready). During a run
 * the button gives way to the progress path, so a second click is impossible.
 * Success appears once the server has accepted the submission (video saved,
 * transcript made). It does not wait for the AI review.
 */
export function SubmitStep({ tracker, ready, missing, canRetry, onSubmit, onAnother }: Props) {
  const running = isBusy(tracker);

  if (tracker.phase === "idle") {
    return (
      <div>
        <Magnet spark={ready} className="block">
          <Button size="md" fullWidth disabled={!ready} onClick={onSubmit} className="sm:h-12 sm:text-sm">
            Submit for review
          </Button>
        </Magnet>
        <p className="mt-3 text-[13px] leading-5 text-muted" aria-live="polite">
          {ready
            ? "You are ready. Your recording is saved privately when you submit."
            : `Still needed: ${missing.join(" and ").toLowerCase()}.`}
        </p>
      </div>
    );
  }

  return (
    <div aria-busy={running}>
      <TraceProgress tracker={tracker} hideCaption={tracker.phase === "complete"} />

      {tracker.phase === "complete" && <SuccessCard onAnother={onAnother} />}

      {tracker.phase === "failed" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canRetry ? (
            <Button onClick={onSubmit}>Try again</Button>
          ) : (
            <>
              {!isPageLocked("submissions") && (
                <Link href="/submissions" className={buttonClasses("primary", "sm")}>
                  View in Submissions
                </Link>
              )}
              <Button
                variant={isPageLocked("submissions") ? "primary" : "secondary"}
                size="sm"
                onClick={onAnother}
              >
                Submit another
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
