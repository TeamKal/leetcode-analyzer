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
const COOLDOWN_MS = 1200;
const IDLE_MIN_MS = 2200;
const IDLE_SPREAD_MS = 2800;
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/**
 * Extra mascot expressions, for accounts the SERVER has allowed (`enabled` comes
 * from a server component; this hook never decides that itself). When it is
 * false nothing is downloaded or run and the mascot is exactly the normal one.
 *
 * When it is true the expressions module is loaded on demand and a few gentle
 * triggers play them: after a click, after resting the pointer on the mascot,
 * and every few seconds while idle (mostly the heart). They never play while the tab is hidden or while
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
    let lastAt = 0;
    let hoverTimer = 0;

    const run = (name: ExtraName, force = false) => {
      if (document.hidden || quietRef.current) return;
      const now = performance.now();
      if (!force && now - lastAt < COOLDOWN_MS) return;
      lastAt = now;
      controlRef.current?.extra(name);
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

    // Every few seconds, so the mascot is never just standing there. The first
    // one waits until the welcome flight has landed.
    const idle = (extra = 0) => {
      later(() => {
        run(pick(IDLE_CHOICES));
        idle();
      }, extra + IDLE_MIN_MS + Math.random() * IDLE_SPREAD_MS);
    };
    idle(1500);

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
