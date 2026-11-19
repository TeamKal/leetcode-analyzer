"use client";

import { useEffect, useRef, useState } from "react";
import { cornersAreTransparent, shouldBlockKey } from "@/lib/ui/overlayLock";
import "./effects.css";

const SRC = "/success-celebration.webm";
/** The clip is about 7 s; this is only a safety net so nobody can be stuck. */
const MAX_PLAY_MS = 14000;
/** If it is still not ready this long after success, skip it. */
const START_WAIT_MS = 4000;
const FADE_MS = 280;

type Support = "checking" | "ready" | "unsupported";
type Phase = "hidden" | "playing" | "leaving";

type Props = {
  /** Start loading the clip (while the submission is being sent). */
  preload: boolean;
  /** The submission succeeded: play it now. */
  play: boolean;
  /** Called once when it has played (or was skipped). */
  onFinish: () => void;
  /** True while the overlay is up, so the page behind can be made inert. */
  onBlockedChange: (blocked: boolean) => void;
};

/**
 * Plays the celebration clip (a transparent WebM) in the centre of the screen
 * after a successful submission. While it plays, nothing behind it can be
 * clicked, focused, typed into or scrolled. It always ends: when the clip ends,
 * on any error, if it cannot start in time, or at the safety limit. It is
 * skipped (and the page carries on as normal) when the person prefers reduced
 * motion or the browser cannot show the clip's transparency.
 */
export function SuccessVideo({ preload, play, onFinish, onBlockedChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishRef = useRef(onFinish);
  const blockedRef = useRef(onBlockedChange);
  const leaveTimerRef = useRef(0);
  const [support, setSupport] = useState<Support>("checking");
  const [phase, setPhase] = useState<Phase>("hidden");

  useEffect(() => {
    finishRef.current = onFinish;
    blockedRef.current = onBlockedChange;
  });

  // Never leave a finish timer running after the component is gone.
  useEffect(() => () => window.clearTimeout(leaveTimerRef.current), []);

  // While loading: can this browser show the clip's transparency? Draw the first
  // frame to a tiny canvas and look at its corners (a browser without alpha
  // support paints them opaque).
  useEffect(() => {
    if (!preload) return;
    const video = videoRef.current;
    if (!video) return;
    const check = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return setSupport("unsupported");
        ctx.drawImage(video, 0, 0, 32, 32);
        const { data } = ctx.getImageData(0, 0, 32, 32);
        setSupport(cornersAreTransparent(data, 32, 32) ? "ready" : "unsupported");
      } catch {
        setSupport("unsupported");
      }
    };
    const fail = () => setSupport("unsupported");
    if (video.readyState >= 2) check();
    else video.addEventListener("loadeddata", check, { once: true });
    video.addEventListener("error", fail, { once: true });
    return () => {
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("error", fail);
    };
  }, [preload]);

  // Start (or skip) when the submission succeeds.
  useEffect(() => {
    if (!play) {
      setPhase("hidden");
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || support === "unsupported") {
      finishRef.current();
      return;
    }
    if (support === "checking") {
      const timer = window.setTimeout(() => finishRef.current(), START_WAIT_MS);
      return () => window.clearTimeout(timer);
    }
    const video = videoRef.current;
    if (!video) {
      finishRef.current();
      return;
    }
    setPhase("playing");
    video.currentTime = 0;
    video.muted = false;
    void video
      .play()
      .catch(() => {
        // Sound may be blocked by the browser: play it silently instead.
        video.muted = true;
        return video.play();
      })
      .catch(() => finishRef.current());
  }, [play, support]);

  // While it is up: block every way of interacting with the page behind it.
  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    blockedRef.current(true);

    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onKey = (event: KeyboardEvent) => {
      if (shouldBlockKey(event)) stop(event);
    };
    const options = { capture: true, passive: false } as const;
    window.addEventListener("keydown", onKey, options);
    window.addEventListener("keyup", onKey, options);
    window.addEventListener("wheel", stop, options);
    window.addEventListener("touchmove", stop, options);
    window.addEventListener("contextmenu", stop, options);

    // The finish timer lives in a ref: this effect ends the moment the phase
    // becomes "leaving", and that must not cancel the finish.
    const leave = () => {
      setPhase((current) => (current === "playing" ? "leaving" : current));
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = window.setTimeout(() => finishRef.current(), FADE_MS);
    };
    video?.addEventListener("ended", leave, { once: true });
    video?.addEventListener("error", leave, { once: true });
    const watchdog = window.setTimeout(leave, MAX_PLAY_MS);

    return () => {
      window.removeEventListener("keydown", onKey, options);
      window.removeEventListener("keyup", onKey, options);
      window.removeEventListener("wheel", stop, options);
      window.removeEventListener("touchmove", stop, options);
      window.removeEventListener("contextmenu", stop, options);
      video?.removeEventListener("ended", leave);
      video?.removeEventListener("error", leave);
      window.clearTimeout(watchdog);
      blockedRef.current(false);
      video?.pause();
    };
  }, [phase === "playing"]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!preload && phase === "hidden") return null;

  return (
    <div
      className="sv-overlay"
      data-state={phase}
      role={phase === "hidden" ? undefined : "status"}
      onClickCapture={(event) => event.preventDefault()}
    >
      {phase !== "hidden" && <span className="sr-only">Submission successful</span>}
      <video
        ref={videoRef}
        className="sv-video"
        src={SRC}
        preload="auto"
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noremoteplayback"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
