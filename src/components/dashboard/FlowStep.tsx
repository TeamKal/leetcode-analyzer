"use client";

import type { PointerEvent, ReactNode } from "react";
import "./dashboard.css";

export type FlowStepState = "active" | "done" | "upcoming";

type Props = {
  number: number;
  title: string;
  description: string;
  state: FlowStepState;
  /** The last step has no line running down from it. */
  last?: boolean;
  /** Small content on the right of the heading (a status chip). */
  aside?: ReactNode;
  children: ReactNode;
};

/** Moves the soft light on a card's border to the pointer (mouse and pen only). */
function spotlight(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === "touch") return;
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--sx", `${event.clientX - rect.left}px`);
  el.style.setProperty("--sy", `${event.clientY - rect.top}px`);
  el.style.setProperty("--lit", "1");
}

/**
 * One of the three connected steps: a numbered node on a rail (the line fills in
 * lilac once the step is done) and a card beside it.
 */
export function FlowStep({
  number,
  title,
  description,
  state,
  last = false,
  aside,
  children,
}: Props) {
  const headingId = `flow-step-${number}`;
  return (
    <li className="fs" data-state={state} data-last={last ? "true" : "false"}>
      <div className="fs-rail" aria-hidden="true">
        <span className="fs-node">
          {state === "done" ? (
            <svg
              viewBox="0 0 16 16"
              className="fs-check size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          ) : (
            number
          )}
        </span>
        <span className="fs-line" />
      </div>

      <section
        aria-labelledby={headingId}
        className="fs-card"
        onPointerMove={spotlight}
        onPointerLeave={(event) => event.currentTarget.style.setProperty("--lit", "0")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-[17px] font-semibold tracking-[-0.02em] text-ink"
            >
              <span className="sr-only">Step {number}: </span>
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          </div>
          {aside}
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </li>
  );
}
