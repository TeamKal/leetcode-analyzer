"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MascotHandle } from "@/components/login/mascot/AuthMascot";
import type {
  ExtraName,
  MascotExtrasModule,
} from "@/components/login/mascot/extras/types";

// The heart is the signature move, so it comes up most; the rest keep it fresh.
const IDLE_CHOICES: ExtraName[] = [
  "heart",
  "heart",
  "heart",
  "heart",
  "wink",
  "wink",
  "shy",
  "blush",
  "giggle",
  "starry",
  "dreamy",
];
// Gaps are measured from the END of one expression to the START of the next.
const GAP_MIN_MS = 600;
const GAP_SPREAD_MS = 1600;
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/**
 * Extra mascot expressions, for accounts the SERVER has allowed (`enabled` comes
 * from a server component; this hook never decides that itself). When it is
 * false nothing is downloaded or run and the mascot is exactly the normal one.
 *
 * When it is true the expressions module is loaded on demand and a few gentle
 * triggers play them: after a click, after resting the pointer on the mascot,
 * and back to back while idle with only a short gap (mostly the heart). They never play while the tab is hidden or while
 * a submission is running or has failed (`quietRef`), and they keep a cooldown.
 */
export function useMascotExtras(
  enabled: boolean,
  controlRef: RefObject<MascotHandle | null>,
  targetRef: RefObject<HTMLElement | null>,
  quietRef: RefObject<boolean>,
) {
  const [loaded, setLoaded] = useState<MascotExtrasModule | null>(null);
  const playRef = useRef<((name: ExtraName) => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import("@/components/login/mascot/extras")
      .then((mod) => {
        if (!cancelled) setLoaded(mod.default);
      })
      .catch(() => undefined); // never break the page over a cosmetic extra
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const extras = enabled ? loaded : null;

  useEffect(() => {
    if (!extras) return;
    const target = targetRef.current;
    if (!target) return;

    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    let busyUntil = 0;
    let hoverTimer = 0;

    /** Plays one; returns how long it lasts, or 0 if it did not play. */
    const run = (name: ExtraName, force = false) => {
      if (document.hidden || quietRef.current) return 0;
      const now = performance.now();
      if (!force && now < busyUntil + GAP_MIN_MS) return 0;
      const ms = extras.durations[name];
      busyUntil = now + ms;
      controlRef.current?.extra(name, ms);
      return ms;
    };
    playRef.current = (name) => run(name, true);

    const onClick = () => {
      // Right after the normal celebration (1.5 s) has finished.
      later(() => run("heart", true), 1550);
    };
    const onEnter = () => {
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => run("shy"), 700);
    };
    const onLeave = () => window.clearTimeout(hoverTimer);

    // Back to back with only a short breather, so the mascot is never just
    // standing there. The first one waits until the welcome flight has landed.
    const idle = (wait: number) => {
      later(() => {
        const played = run(pick(IDLE_CHOICES));
        // Next one starts a short gap after this one ENDS (or soon, if skipped).
        idle(played ? played + GAP_MIN_MS + Math.random() * GAP_SPREAD_MS : 1500);
      }, wait);
    };
    idle(3500);

    target.addEventListener("click", onClick);
    target.addEventListener("pointerenter", onEnter);
    target.addEventListener("pointerleave", onLeave);

    return () => {
      playRef.current = null;
      window.clearTimeout(hoverTimer);
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      target.removeEventListener("click", onClick);
      target.removeEventListener("pointerenter", onEnter);
      target.removeEventListener("pointerleave", onLeave);
    };
  }, [extras, controlRef, targetRef, quietRef]);

  /** Plays one now (still respects hidden tab and quiet). A no-op when not allowed. */
  const play = useCallback((name: ExtraName) => {
    playRef.current?.(name);
  }, []);

  return { extras, play };
}
