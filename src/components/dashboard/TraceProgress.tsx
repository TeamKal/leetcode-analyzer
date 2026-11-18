import type { CSSProperties } from "react";
import {
  captionFor,
  stageViews,
  type StageState,
  type Tracker,
} from "@/lib/submit/progress";
import "./dashboard.css";

const STATE_WORDS: Record<StageState, string> = {
  pending: "not started",
  active: "in progress",
  done: "done",
  failed: "failed",
};

function Node({ state, number }: { state: StageState; number: number }) {
  if (state === "done") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m3.5 8.5 3 3 6-7" />
      </svg>
    );
  }
  if (state === "failed") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M8 3.5v5.2M8 12v.2" />
      </svg>
    );
  }
  if (state === "active") return <span className="tr-spin" />;
  return <span aria-hidden="true">{number}</span>;
}

/**
 * The submission's progress as a connected path of stages, like a trace: the
 * path fills in as each stage really finishes, the current stage has a ring that
 * breathes, a failed stage turns red, and a light travels along the path while a
 * stage is working without a real percentage (it never invents one). Only the
 * saving stage has a true percentage, and then the path itself fills with it.
 */
export function TraceProgress({
  tracker,
  hideCaption = false,
}: {
  tracker: Tracker;
  /** The success card says it all, so the caption can step aside. */
  hideCaption?: boolean;
}) {
  const stages = stageViews(tracker);
  const failed = tracker.phase === "failed";

  return (
    <div>
      <ol className="tr" aria-label="Submission progress">
        {stages.map((stage, index) => {
          const hasRealPercent = index === 0 && tracker.uploadPercent !== null;
          const fill =
            stage.state === "done"
              ? 1
              : stage.state === "active" && hasRealPercent
                ? (tracker.uploadPercent ?? 0) / 100
                : 0;
          const flowing = stage.state === "active" && !hasRealPercent;

          return (
            <li
              key={stage.id}
              className="tr-stage"
              data-state={stage.state}
              aria-current={stage.state === "active" ? "step" : undefined}
            >
              <span className="tr-node">
                <Node state={stage.state} number={index + 1} />
              </span>
              <span className="tr-text">
                <span className="tr-label">{stage.label}</span>
                <span className="tr-hint">{stage.hint}</span>
                <span className="sr-only">{STATE_WORDS[stage.state]}</span>
              </span>
              {index < stages.length - 1 && (
                <span
                  className="tr-link"
                  data-flowing={flowing ? "true" : "false"}
                  style={{ "--fill": fill } as CSSProperties}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {!hideCaption && (
        <p
          className="tr-caption"
          role="status"
          aria-live="polite"
          data-failed={failed ? "true" : "false"}
        >
          {captionFor(tracker)}
        </p>
      )}
    </div>
  );
}
