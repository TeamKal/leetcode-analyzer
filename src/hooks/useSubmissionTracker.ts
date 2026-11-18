"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";
import {
  asReviewPhase,
  IDLE_TRACKER,
  POLL_GIVE_UP_AFTER_MS,
  POLL_INTERVAL_MS,
  POLL_SLOW_AFTER_MS,
  trackerReducer,
} from "@/lib/submit/progress";

type StartInput = {
  /** The LeetCode submission link, already checked. */
  href: string;
  /** The recorded video. */
  video: Blob;
};

const SUBMIT_FALLBACK = "The solution could not be submitted. Please try again.";
const OFFLINE_SUBMIT =
  "Could not reach the submission service. Your recording is saved, so you can try again.";

/** Waits, but stops early (and says so) when the run is cancelled. */
function sleep(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs the real submission and reports honestly where it is:
 *  1. saves the recording to private storage (a real upload percentage),
 *  2. submits it (one request; no percentage),
 *  3. follows the submission's review status until the backend says it is scored.
 * A second click while a run is going does nothing. A retry after a failed
 * submit reuses the recording that is already saved. Everything stops when the
 * page is left.
 */
export function useSubmissionTracker() {
  const [tracker, dispatch] = useReducer(trackerReducer, IDLE_TRACKER);
  const controllerRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  // The video that is already saved, so a retry does not upload it again.
  const savedRef = useRef<{ video: Blob; objectKey: string } | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const follow = useCallback(
    async (submissionId: string | null, signal: AbortSignal) => {
      if (!submissionId) {
        // We cannot follow it; say so instead of pretending.
        dispatch({ type: "slow" });
        return;
      }

      const startedAt = Date.now();
      let markedSlow = false;
      while (!signal.aborted) {
        try {
          const response = await fetch(`/api/submissions/${submissionId}/status`, {
            cache: "no-store",
            signal,
          });
          if (response.ok) {
            const body = (await response.json().catch(() => null)) as {
              phase?: unknown;
            } | null;
            const phase = asReviewPhase(body?.phase);
            if (phase) {
              dispatch({ type: "review", phase });
              if (phase === "scored" || phase === "graded" || phase === "failed") {
                return;
              }
            }
          }
        } catch {
          // A dropped connection is not a failed review: keep trying.
          if (signal.aborted) return;
        }

        const waited = Date.now() - startedAt;
        if (!markedSlow && waited > POLL_SLOW_AFTER_MS) {
          markedSlow = true;
          dispatch({ type: "slow" });
        }
        if (waited > POLL_GIVE_UP_AFTER_MS) return;
        if (!(await sleep(POLL_INTERVAL_MS, signal))) return;
      }
    },
    [],
  );

  const start = useCallback(
    async ({ href, video }: StartInput) => {
      if (runningRef.current) return; // never two runs at once
      runningRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      dispatch({ type: "start" });

      try {
        // 1. Save the recording (unless it is already saved from an earlier try).
        let objectKey = savedRef.current?.video === video ? savedRef.current.objectKey : null;
        if (!objectKey) {
          try {
            const file =
              video instanceof File
                ? video
                : new File([video], "recording.webm", {
                    type: video.type || "video/webm",
                  });
            objectKey = await uploadVideoToR2(file, (percent) =>
              dispatch({ type: "progress", percent }),
            );
            savedRef.current = { video, objectKey };
          } catch (error) {
            if (signal.aborted) return;
            dispatch({
              type: "fail",
              at: "save",
              message:
                error instanceof Error && error.message
                  ? error.message
                  : "The recording could not be saved. Please try again.",
            });
            return;
          }
        }
        if (signal.aborted) return;
        dispatch({ type: "saved" });

        // 2. Submit it.
        let submissionId: string | null = null;
        try {
          const response = await fetch("/api/submissions/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leetcodeSubmissionUrl: href, videoObjectKey: objectKey }),
            signal,
          });
          const body = (await response.json().catch(() => null)) as {
            submitted?: unknown;
            submissionId?: unknown;
            message?: unknown;
          } | null;
          if (!response.ok || body?.submitted !== true) {
            dispatch({
              type: "fail",
              at: "submit",
              message: typeof body?.message === "string" ? body.message : SUBMIT_FALLBACK,
            });
            return;
          }
          submissionId = typeof body.submissionId === "string" ? body.submissionId : null;
        } catch {
          if (signal.aborted) return;
          dispatch({ type: "fail", at: "submit", message: OFFLINE_SUBMIT });
          return;
        }
        if (signal.aborted) return;
        dispatch({ type: "submitted" });

        // 3. Follow the review until the backend says it is done.
        await follow(submissionId, signal);
      } finally {
        runningRef.current = false;
      }
    },
    [follow],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    runningRef.current = false;
    savedRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  /** A failed save or submit can be tried again; a failed review cannot (a mentor can look at it). */
  const canRetry = tracker.phase === "failed" && tracker.failedAt !== "review";

  return { tracker, start, reset, canRetry };
}
