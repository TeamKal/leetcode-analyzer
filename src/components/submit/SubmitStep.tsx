"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { StepCard } from "@/components/ui/StepCard";

export type SubmissionFeedback = {
  status: "idle" | "pending" | "success" | "error";
  message: string;
};

export type ChecklistItem = { label: string; done: boolean };

type Props = {
  items: ChecklistItem[];
  canSubmit: boolean;
  feedback: SubmissionFeedback;
  onSubmit: () => void;
  onAnother: () => void;
};

function Check({ done }: { done: boolean }) {
  return done ? (
    <span
      aria-hidden="true"
      className="grid size-5 place-items-center rounded-full bg-success-soft text-success-text"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="size-5 rounded-full border border-line-strong"
    />
  );
}

/** Step 3: a last look, then submit. After submitting it becomes a confirmation. */
export function SubmitStep({
  items,
  canSubmit,
  feedback,
  onSubmit,
  onAnother,
}: Props) {
  if (feedback.status === "success") {
    return (
      <section
        aria-labelledby="submitted-title"
        className="rounded-xl border border-success-line bg-success-soft p-6 sm:p-8"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-success-text"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          </span>
          <div>
            <h2
              id="submitted-title"
              className="text-[19px] font-semibold tracking-[-0.02em] text-success-text"
            >
              Solution submitted
            </h2>
            <p
              role="status"
              aria-live="polite"
              className="mt-1.5 max-w-[46ch] text-sm leading-6 text-ink-2"
            >
              Nice work. We&apos;re scoring your explanation now. Your AI score
              is a first look, and your mentor gives the final grade. You can
              follow it on your submissions page.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/submissions" className={buttonClasses("primary")}>
                View my submissions
              </Link>
              <Button variant="secondary" onClick={onAnother}>
                Submit another solution
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const pending = feedback.status === "pending";

  return (
    <StepCard
      number={3}
      title="Review and submit"
      description="Make sure everything below is ready, then send it in."
      state={canSubmit ? "active" : "idle"}
    >
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-3 text-sm ${
              item.done ? "text-ink" : "text-muted"
            }`}
          >
            <Check done={item.done} />
            {item.label}
            <span className="sr-only">{item.done ? " (done)" : " (not yet)"}</span>
          </li>
        ))}
      </ul>

      {feedback.status === "error" && feedback.message && (
        <div className="mt-4">
          <Alert>{feedback.message}</Alert>
        </div>
      )}

      <div className="mt-5">
        <Button
          fullWidth
          disabled={!canSubmit || pending}
          onClick={onSubmit}
          aria-busy={pending}
        >
          {pending ? (
            <>
              <Spinner />
              Submitting…
            </>
          ) : (
            "Submit solution"
          )}
        </Button>
        <p className="mt-2 text-center text-xs text-faint">
          {pending
            ? "Hang on, we are turning your recording into text. This can take up to a minute."
            : "Your video is stored privately. Its audio is sent to Deepgram only to be transcribed for your mentor."}
        </p>
      </div>
    </StepCard>
  );
}
