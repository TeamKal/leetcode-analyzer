/**
 * What a student sees while a submission is processed. Pure logic, no imports:
 * the stage model, a reducer, and the friendly captions, so every state can be
 * tested and the screen only has to draw it.
 *
 * It only knows what the backend can really tell us:
 *  - saving: the upload to private storage reports a real percentage;
 *  - submitting: one request that returns when the submission is accepted (no
 *    progress detail, so it is shown as "working", never as a percentage);
 *  - AI review: the submission's status, read from the backend: queued,
 *    being reviewed, scored (or failed);
 *  - done: only once the backend says the review is scored.
 * Nothing here estimates a percentage or marks a stage done early.
 */

export type StageId = "save" | "submit" | "review" | "done";
export type StageState = "pending" | "active" | "done" | "failed";

export const STAGES: readonly { id: StageId; label: string; hint: string }[] = [
  { id: "save", label: "Saving", hint: "Your recording" },
  { id: "submit", label: "Submitting", hint: "Your explanation" },
  { id: "review", label: "AI review", hint: "Reading and scoring" },
  { id: "done", label: "Done", hint: "All set" },
];

/** What the backend says about a submission that is being reviewed. */
export type ReviewPhase = "queued" | "reviewing" | "scored" | "graded" | "failed";

export function reviewPhaseFromStatus(status: unknown): ReviewPhase | null {
  switch (status) {
    case "pending_evaluation":
      return "queued";
    case "evaluating":
      return "reviewing";
    case "evaluated":
      return "scored";
    case "graded":
      return "graded";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

/** Reads a review phase out of an API response, or null if it is anything else. */
export function asReviewPhase(value: unknown): ReviewPhase | null {
  return value === "queued" ||
    value === "reviewing" ||
    value === "scored" ||
    value === "graded" ||
    value === "failed"
    ? value
    : null;
}

export type TrackerPhase =
  | "idle"
  | "saving"
  | "submitting"
  | "reviewing"
  | "complete"
  | "failed";

export type Tracker = {
  phase: TrackerPhase;
  /** A real percentage from the upload, only while saving. */
  uploadPercent: number | null;
  /** The backend's review status, only while reviewing. */
  review: ReviewPhase | null;
  /** True once the review has taken unusually long (the page stops promising). */
  slow: boolean;
  failedAt: StageId | null;
  failureMessage: string;
};

export const IDLE_TRACKER: Tracker = {
  phase: "idle",
  uploadPercent: null,
  review: null,
  slow: false,
  failedAt: null,
  failureMessage: "",
};

export type TrackerEvent =
  | { type: "start" }
  | { type: "progress"; percent: number }
  | { type: "saved" }
  | { type: "submitted" }
  | { type: "review"; phase: ReviewPhase }
  | { type: "slow" }
  | { type: "fail"; at: StageId; message: string }
  | { type: "reset" };

export const REVIEW_FAILED_MESSAGE =
  "The AI could not score this one. Your mentor can still review your recording.";

export function trackerReducer(tracker: Tracker, event: TrackerEvent): Tracker {
  switch (event.type) {
    case "start":
      return { ...IDLE_TRACKER, phase: "saving" };
    case "progress":
      if (tracker.phase !== "saving") return tracker;
      return {
        ...tracker,
        uploadPercent: Math.max(0, Math.min(100, Math.round(event.percent))),
      };
    case "saved":
      if (tracker.phase !== "saving") return tracker;
      return { ...tracker, phase: "submitting", uploadPercent: null };
    case "submitted":
      if (tracker.phase !== "submitting") return tracker;
      return { ...tracker, phase: "reviewing", review: null };
    case "review":
      if (tracker.phase !== "reviewing") return tracker;
      if (event.phase === "scored" || event.phase === "graded") {
        return { ...tracker, phase: "complete", review: event.phase, slow: false };
      }
      if (event.phase === "failed") {
        return {
          ...tracker,
          phase: "failed",
          review: "failed",
          failedAt: "review",
          failureMessage: REVIEW_FAILED_MESSAGE,
        };
      }
      return { ...tracker, review: event.phase };
    case "slow":
      return tracker.phase === "reviewing" ? { ...tracker, slow: true } : tracker;
    case "fail":
      return {
        ...tracker,
        phase: "failed",
        uploadPercent: null,
        failedAt: event.at,
        failureMessage: event.message,
      };
    case "reset":
      return IDLE_TRACKER;
  }
}

export const isBusy = (tracker: Tracker) =>
  tracker.phase === "saving" ||
  tracker.phase === "submitting" ||
  tracker.phase === "reviewing";

/** Whether the submit button may start a new run. */
export function canStart(
  tracker: Tracker,
  input: { hasLink: boolean; hasRecording: boolean },
) {
  return (
    input.hasLink &&
    input.hasRecording &&
    (tracker.phase === "idle" || tracker.phase === "failed")
  );
}

export type StageView = {
  id: StageId;
  label: string;
  hint: string;
  state: StageState;
};

/** The state of each stage, for the progress picture. */
export function stageViews(tracker: Tracker): StageView[] {
  const order = STAGES.map((stage) => stage.id);
  const activeIndex = (() => {
    switch (tracker.phase) {
      case "saving":
        return 0;
      case "submitting":
        return 1;
      case "reviewing":
        return 2;
      case "complete":
        return order.length; // everything is done
      case "failed":
        return tracker.failedAt ? order.indexOf(tracker.failedAt) : -1;
      default:
        return -1;
    }
  })();

  return STAGES.map((stage, index) => {
    let state: StageState = "pending";
    if (tracker.phase === "failed") {
      if (index < activeIndex) state = "done";
      else if (index === activeIndex) state = "failed";
    } else if (activeIndex >= 0) {
      if (index < activeIndex) state = "done";
      else if (index === activeIndex) state = "active";
    }
    return { ...stage, state };
  });
}

/** The one-line, friendly status under the progress picture. */
export function captionFor(tracker: Tracker): string {
  switch (tracker.phase) {
    case "idle":
      return "Ready when you are.";
    case "saving":
      return tracker.uploadPercent === null
        ? "Saving your recording…"
        : `Saving your recording… ${tracker.uploadPercent}%`;
    case "submitting":
      return "Submitting your explanation. This can take up to a minute.";
    case "reviewing":
      if (tracker.slow) {
        return "This is taking longer than usual. You can leave this page; your submission is safe and the result will appear in Submissions.";
      }
      if (tracker.review === "queued") {
        return "Received. Your explanation is waiting for its AI review.";
      }
      if (tracker.review === "reviewing") {
        return "Received. The AI is reading your explanation.";
      }
      return "Received. Waiting for the AI review to start.";
    case "complete":
      return "Your submission is in and the AI review is done.";
    case "failed":
      return tracker.failureMessage || "Something went wrong. Please try again.";
  }
}

/** How often to ask the backend about the review, and when to stop promising. */
export const POLL_INTERVAL_MS = 4000;
export const POLL_SLOW_AFTER_MS = 6 * 60 * 1000;
export const POLL_GIVE_UP_AFTER_MS = 30 * 60 * 1000;
