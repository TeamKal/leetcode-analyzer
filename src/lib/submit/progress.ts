/**
 * What a student sees while a submission is sent. Pure logic, no imports: the
 * stage model, a reducer, and the friendly captions, so every state can be
 * tested and the screen only has to draw it.
 *
 * It only knows what the backend can really tell us:
 *  - saving: the upload to private storage reports a real percentage;
 *  - submitting: one request that returns once the video is saved, the
 *    transcript is made and the submission is accepted (no progress detail, so
 *    it is shown as "working", never as a percentage);
 *  - done: as soon as that request succeeds. The AI review runs afterwards in
 *    the background, so the student never waits for it.
 * Nothing here estimates a percentage or marks a stage done early.
 */

export type StageId = "save" | "submit" | "done";
export type StageState = "pending" | "active" | "done" | "failed";

export const STAGES: readonly { id: StageId; label: string; hint: string }[] = [
  { id: "save", label: "Saving", hint: "Your recording" },
  { id: "submit", label: "Submitting", hint: "Your explanation" },
  { id: "done", label: "Done", hint: "Submission successful" },
];

/** What the backend says about a submission's review (used by the status route). */
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

export type TrackerPhase = "idle" | "saving" | "submitting" | "complete" | "failed";

export type Tracker = {
  phase: TrackerPhase;
  /** A real percentage from the upload, only while saving. */
  uploadPercent: number | null;
  failedAt: StageId | null;
  failureMessage: string;
};

export const IDLE_TRACKER: Tracker = {
  phase: "idle",
  uploadPercent: null,
  failedAt: null,
  failureMessage: "",
};

export type TrackerEvent =
  | { type: "start" }
  | { type: "progress"; percent: number }
  | { type: "saved" }
  | { type: "submitted" }
  | { type: "fail"; at: StageId; message: string }
  | { type: "reset" };

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
      // The server has the video and the transcript and has queued the review.
      if (tracker.phase !== "submitting") return tracker;
      return { ...tracker, phase: "complete" };
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
  tracker.phase === "saving" || tracker.phase === "submitting";

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
    case "complete":
      return "Submission successful.";
    case "failed":
      return tracker.failureMessage || "Something went wrong. Please try again.";
  }
}
