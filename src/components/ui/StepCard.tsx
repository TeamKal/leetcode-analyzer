import { useId, type ReactNode } from "react";

export type StepState = "active" | "done" | "idle";

type StepCardProps = {
  number: number;
  title: string;
  description?: string;
  state: StepState;
  /** Small content on the right of the heading (a badge, a status). */
  aside?: ReactNode;
  children: ReactNode;
};

function Marker({ number, state }: { number: number; state: StepState }) {
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success-text"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums ${
        state === "active" ? "bg-ink text-surface" : "bg-sunken text-muted"
      }`}
    >
      {number}
    </span>
  );
}

/** One numbered step of the submit flow. */
export function StepCard({
  number,
  title,
  description,
  state,
  aside,
  children,
}: StepCardProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-xl border bg-surface p-5 shadow-card sm:p-6 ${
        state === "active" ? "border-line-strong" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Marker number={number} state={state} />
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-[17px] font-semibold leading-7 tracking-[-0.015em]"
            >
              <span className="sr-only">Step {number}: </span>
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm leading-6 text-muted">{description}</p>
            )}
          </div>
        </div>
        {aside && <div className="shrink-0 pt-0.5">{aside}</div>}
      </div>
      <div className="mt-5 sm:pl-10">{children}</div>
    </section>
  );
}
