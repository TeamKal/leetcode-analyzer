"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";
import { IDLE_TRACKER, trackerReducer } from "@/lib/submit/progress";

type StartInput = {
  /** The LeetCode submission link, already checked. */
  href: string;
  /** The recorded video. */
  video: Blob;
};

const SUBMIT_FALLBACK = "The solution could not be submitted. Please try again.";
const OFFLINE_SUBMIT =
  "Could not reach the submission service. Your recording is saved, so you can try again.";

/**
 * Runs the real submission and reports honestly where it is:
 *  1. saves the recording to private storage (a real upload percentage),
 *  2. submits it (one request; no percentage),
 *  3. shows success as soon as the server has accepted it (video saved, transcript
 *     made, review queued). The AI review runs later and is never waited for.
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
        try {
          const response = await fetch("/api/submissions/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leetcodeSubmissionUrl: href, videoObjectKey: objectKey }),
            signal,
          });
          const body = (await response.json().catch(() => null)) as {
            submitted?: unknown;
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
        } catch {
          if (signal.aborted) return;
          dispatch({ type: "fail", at: "submit", message: OFFLINE_SUBMIT });
          return;
        }
        if (signal.aborted) return;
        // 3. The server has everything it needs: that is success.
        dispatch({ type: "submitted" });
      } finally {
        runningRef.current = false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    runningRef.current = false;
    savedRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  /** A failed save or submit can be tried again. */
  const canRetry = tracker.phase === "failed";

  return { tracker, start, reset, canRetry };
}
