"use client";

import { useEffect, type RefObject } from "react";
import type { MascotExpression, MascotHandle, MascotMood } from "./AuthMascot";

/**
 * The mascot's "life": a persistent behaviour system that runs after the intro.
 * Every 5-10 seconds it starts one noticeable activity (look around, head tilt,
 * a curious brow, a bounce, a stretch or yawn, a wink, a happy wiggle, a thinking
 * pose, or an exploration flight to a real element on the page). Activities never
 * overlap: one runner awaits one activity at a time, and each ends in a known
 * resting state.
 *
 * States (see `data-life` on the wrapper): idle -> acting | exploring -> returning
 * -> idle. Exploration flights move the same mascot wrapper with a transform (like
 * the intro), then bring it back to its exact home. It is aborted and sent home
 * straight away when the visitor approaches the Google button, the tab is hidden,
 * the window is resized or scrolled, or sign-in starts. A watchdog and a
 * synchronous "snap home" mean it can never stay away.
 *
 * Reduced motion: this system does not run at all.
 */

type Phase = "idle" | "acting" | "exploring" | "returning";
type Kind =
  | "look"
  | "tilt"
  | "curious"
  | "bounce"
  | "stretch"
  | "wink"
  | "wiggle"
  | "think"
  | "startled"
  | "explore";

type LifeProps = {
  /** The mascot's wrapper (moved with a transform while exploring). */
  flyRef: RefObject<HTMLElement | null>;
  controlRef: RefObject<MascotHandle | null>;
  /** The Google button wrapper: approaching it ends any activity. */
  buttonRef: RefObject<HTMLElement | null>;
  /** True once the intro is over and nothing else owns the mascot. */
  active: boolean;
  onMood: (mood: MascotMood | null) => void;
};

const TARGET_SELECTORS = [
  "#product-title",
  '[data-demo="url"]',
  '[data-demo="identify"]',
  '[data-demo="drop"]',
  '[data-demo="generate"]',
  '[data-demo="submit"]',
  '[data-demo^="row-"]',
  '[data-demo="mentor"]',
  ".pd-meter",
  "#login-title",
  "[data-explore]",
];

const EXPLORE_SCALE = 0.62;
const EXPLORE_WATCHDOG_MS = 9000;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const abortError = () => new DOMException("aborted", "AbortError");
const isAbort = (e: unknown) =>
  e instanceof DOMException && e.name === "AbortError";

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const onAbort = () => {
      window.clearTimeout(id);
      reject(abortError());
    };
    const id = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function tween(ms: number, apply: (t: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const start = performance.now();
    let raf = 0;
    const onAbort = () => {
      cancelAnimationFrame(raf);
      reject(abortError());
    };
    const step = (now: number) => {
      const t = clamp01((now - start) / ms);
      apply(t);
      if (t >= 1) {
        signal.removeEventListener("abort", onAbort);
        resolve();
      } else {
        raf = requestAnimationFrame(step);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    raf = requestAnimationFrame(step);
  });
}

export function MascotLife({
  flyRef,
  controlRef,
  buttonRef,
  active,
  onMood,
}: LifeProps) {
  useEffect(() => {
    if (!active) return;
    const el = flyRef.current;
    const btn = buttonRef.current;
    if (!el || !btn) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const life = new AbortController(); // ends the whole system
    let runAbort = new AbortController(); // ends the current activity
    let homeFlight: AbortController | null = null; // ends the flight back home
    let phase: Phase = "idle";
    let engaged = false;
    let lastKind: Kind | null = null;
    let lastExploreAt = performance.now();
    let lastTarget: Element | null = null;
    let watchdog = 0;
    const pose = { x: 0, y: 0, s: 1, rot: 0, sx: 1, sy: 1 };

    const ctl = () => controlRef.current;
    const setPhase = (p: Phase) => {
      phase = p;
      el.dataset.life = p;
    };
    setPhase("idle");

    const apply = () => {
      const rest =
        pose.x === 0 &&
        pose.y === 0 &&
        pose.s === 1 &&
        pose.rot === 0 &&
        pose.sx === 1 &&
        pose.sy === 1;
      el.style.transform = rest
        ? ""
        : `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rot}deg) scale(${pose.s * pose.sx}, ${pose.s * pose.sy})`;
    };

    /** Instantly back home, in every circumstance. Safe to call any time. */
    const snapHome = () => {
      window.clearTimeout(watchdog);
      homeFlight?.abort(); // a flight back home must not undo the snap
      pose.x = 0;
      pose.y = 0;
      pose.s = 1;
      pose.rot = 0;
      pose.sx = 1;
      pose.sy = 1;
      apply();
      el.dataset.intro = "off";
      ctl()?.clearExpression();
      ctl()?.clearLook();
      onMood(null);
      setPhase("idle");
    };

    /** The mascot's resting centre, independent of any transform now applied. */
    const home = () => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - pose.x,
        y: r.top + r.height / 2 - pose.y,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
    };

    const faceCentre = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.5 };
    };

    /** A point somewhere around the mascot, inside the viewport. */
    const pointAround = (min: number, max: number) => {
      const c = faceCentre();
      const angle = rand(0, Math.PI * 2);
      const radius = rand(min, max);
      return {
        x: Math.min(window.innerWidth - 8, Math.max(8, c.x + Math.cos(angle) * radius)),
        y: Math.min(window.innerHeight - 8, Math.max(8, c.y + Math.sin(angle) * radius)),
      };
    };

    /** A smooth, curved flight of the wrapper from its pose to `to`. */
    const fly = async (
      to: { x: number; y: number; s: number },
      ms: number,
      signal: AbortSignal,
    ) => {
      const from = { ...pose };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      let nx = -dy / dist;
      let ny = dx / dist;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const bow = dist * rand(0.14, 0.24);
      const cx = (from.x + to.x) / 2 + nx * bow;
      const cy = (from.y + to.y) / 2 + ny * bow;
      const dirSign = dx >= 0 ? 1 : -1;
      await tween(
        ms,
        (k) => {
          const e = easeInOut(k);
          const u = 1 - e;
          pose.x = u * u * from.x + 2 * u * e * cx + e * e * to.x;
          pose.y = u * u * from.y + 2 * u * e * cy + e * e * to.y;
          pose.s = lerp(from.s, to.s, e);
          pose.rot = dirSign * 13 * Math.sin(Math.PI * k);
          pose.sy = 1 + 0.05 * Math.sin(Math.PI * k);
          pose.sx = 1 - 0.03 * Math.sin(Math.PI * k);
          apply();
        },
        signal,
      );
      pose.x = to.x;
      pose.y = to.y;
      pose.s = to.s;
      pose.rot = 0;
      pose.sx = 1;
      pose.sy = 1;
      apply();
    };

    /** Fly back to the exact resting position (not abortable except by cleanup). */
    const returnHome = async (ms: number) => {
      setPhase("returning");
      onMood("fly");
      homeFlight = new AbortController();
      try {
        await fly({ x: 0, y: 0, s: 1 }, ms, homeFlight.signal);
      } finally {
        homeFlight = null;
        snapHome();
      }
    };

    const visibleTargets = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const h = home();
      const seen = new Set<Element>();
      const out: { el: Element; rect: DOMRect }[] = [];
      for (const selector of TARGET_SELECTORS) {
        document.querySelectorAll(selector).forEach((node) => {
          if (seen.has(node) || el.contains(node)) return;
          seen.add(node);
          const rect = node.getBoundingClientRect();
          if (rect.width < 40 || rect.height < 12) return;
          if (rect.width > vw * 0.6 && rect.height > vh * 0.5) return;
          if (rect.bottom < 16 || rect.top > vh - 16) return;
          if (rect.right < 16 || rect.left > vw - 16) return;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          if (Math.hypot(cx - h.x, cy - h.y) < 140) return; // make it a real trip
          out.push({ el: node, rect });
        });
      }
      return out;
    };

    /** A spot beside the target where the small mascot hovers without covering it. */
    const spotFor = (rect: DOMRect) => {
      const h = home();
      const mw = h.w * EXPLORE_SCALE;
      const mh = h.h * EXPLORE_SCALE;
      const gap = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const candidates = [
        { x: rect.right + gap + mw / 2, y: cy },
        { x: rect.left - gap - mw / 2, y: cy },
        { x: cx, y: rect.top - gap - mh / 2 },
        { x: cx, y: rect.bottom + gap + mh / 2 },
      ].filter(
        (c) =>
          c.x - mw / 2 >= 8 &&
          c.x + mw / 2 <= vw - 8 &&
          c.y - mh / 2 >= 8 &&
          c.y + mh / 2 <= vh - 8,
      );
      const options = candidates.length
        ? candidates
        : [
            {
              x: Math.min(vw - mw / 2 - 8, Math.max(mw / 2 + 8, cx)),
              y: Math.min(vh - mh / 2 - 8, Math.max(mh / 2 + 8, rect.top - gap - mh / 2)),
            },
          ];
      const spot = pick(options);
      return { x: spot.x - h.x, y: spot.y - h.y, s: EXPLORE_SCALE };
    };

    // Activities -------------------------------------------------------------
    const smallActivities: Record<
      Exclude<Kind, "explore">,
      (signal: AbortSignal) => Promise<void>
    > = {
      async look(signal) {
        const glances = pick([2, 3, 3]);
        for (let i = 0; i < glances; i++) {
          const p = pointAround(220, 520);
          ctl()?.lookAt(p.x, p.y, rand(800, 1300));
          if (Math.random() < 0.5) ctl()?.tilt(rand(-7, 7), 900);
          await sleep(rand(900, 1400), signal);
        }
        ctl()?.clearLook();
      },
      async tilt(signal) {
        const sign = Math.random() < 0.5 ? -1 : 1;
        ctl()?.tilt(sign * rand(5, 9), 1100);
        ctl()?.sway(sign * rand(3, 7), 1100);
        if (Math.random() < 0.5) ctl()?.express("curious", 1000);
        await sleep(1400, signal);
      },
      async curious(signal) {
        const p = pointAround(240, 480);
        ctl()?.express("curious", 1500);
        ctl()?.lookAt(p.x, p.y, 1300);
        await sleep(1800, signal);
        ctl()?.clearLook();
      },
      async bounce(signal) {
        ctl()?.express("happy", 1000);
        ctl()?.bounce(rand(110, 190));
        await sleep(450, signal);
        if (Math.random() < 0.45) ctl()?.bounce(105);
        await sleep(800, signal);
      },
      async stretch(signal) {
        ctl()?.stretch();
        if (Math.random() < 0.55) ctl()?.express("sleepy", 1400);
        await sleep(1600, signal);
      },
      async wink(signal) {
        ctl()?.express("playful", 950);
        ctl()?.tilt(rand(-6, 6), 900);
        await sleep(1200, signal);
      },
      async wiggle(signal) {
        ctl()?.express("happy", 1250);
        ctl()?.wiggle();
        ctl()?.bounce(100);
        await sleep(1450, signal);
      },
      async think(signal) {
        const c = faceCentre();
        const up = {
          x: c.x + pick([-1, 1]) * rand(160, 320),
          y: Math.max(8, c.y - rand(160, 300)),
        };
        ctl()?.express("thinking", 1900);
        ctl()?.lookAt(up.x, up.y, 1800);
        await sleep(2200, signal);
        ctl()?.clearLook();
      },
      async startled(signal) {
        const p = pointAround(300, 620);
        ctl()?.lookAt(p.x, p.y, 1300);
        await sleep(350, signal);
        ctl()?.express(pick<MascotExpression>(["surprised", "shocked"]), 1000);
        await sleep(1500, signal);
        ctl()?.clearLook();
      },
    };

    const explore = async (signal: AbortSignal) => {
      const targets = visibleTargets().filter((t) => t.el !== lastTarget);
      const target = pick(targets.length ? targets : visibleTargets());
      if (!target) {
        await smallActivities.look(signal);
        return;
      }
      lastTarget = target.el;
      lastExploreAt = performance.now();
      const cx = target.rect.left + target.rect.width / 2;
      const cy = target.rect.top + target.rect.height / 2;

      watchdog = window.setTimeout(() => {
        // Never stay away: abort the activity and snap home.
        runAbort.abort();
        snapHome();
      }, EXPLORE_WATCHDOG_MS);

      try {
        // 1. Notice something and crouch a little before taking off.
        ctl()?.lookAt(cx, cy, 900);
        ctl()?.express("curious", 650);
        await tween(
          300,
          (k) => {
            pose.sy = 1 - 0.1 * Math.sin(Math.PI * k * 0.5);
            pose.sx = 1 + 0.06 * Math.sin(Math.PI * k * 0.5);
            apply();
          },
          signal,
        );

        // 2. Fly over to it.
        el.dataset.intro = "roam";
        const spot = spotFor(target.rect);
        const dist = Math.hypot(spot.x, spot.y);
        onMood("fly");
        await fly(spot, Math.min(1400, 700 + dist * 0.8), signal);
        onMood(null);

        // 3. Discover it: a surprised / shocked / curious reaction.
        const first = pick<MascotExpression>([
          "surprised",
          "shocked",
          "curious",
          "surprised",
        ]);
        const dwell = rand(1600, 2600);
        const here = faceCentre();
        ctl()?.lookAt(cx, cy, dwell + 300);
        ctl()?.express(first, dwell * 0.55);
        ctl()?.tilt(Math.sign(cx - here.x || 1) * rand(4, 8), dwell * 0.6);
        await sleep(dwell * 0.55, signal);

        // 4. Inspect it a little longer, then react.
        ctl()?.express(pick<MascotExpression>(["thinking", "happy", "curious"]), dwell * 0.5);
        await sleep(dwell * 0.5, signal);
      } finally {
        window.clearTimeout(watchdog);
        ctl()?.clearLook();
        // 5. Fly back to the exact resting spot (quickly if interrupted).
        if (pose.x !== 0 || pose.y !== 0 || pose.s !== 1) {
          const quick = signal.aborted;
          const dist = Math.hypot(pose.x, pose.y);
          await returnHome(quick ? 420 : Math.min(1300, 650 + dist * 0.7)).catch(
            () => undefined,
          );
        } else {
          snapHome();
        }
        pose.sx = 1;
        pose.sy = 1;
      }
    };

    // Scheduling -------------------------------------------------------------
    const choose = (): Kind => {
      const sinceExplore = performance.now() - lastExploreAt;
      if (sinceExplore > 34000 && visibleTargets().length) return "explore";
      const weights: [Kind, number][] = [
        ["look", 18],
        ["tilt", 14],
        ["curious", 14],
        ["bounce", 11],
        ["stretch", 8],
        ["wink", 8],
        ["wiggle", 9],
        ["think", 8],
        ["startled", 8],
        ["explore", sinceExplore < 14000 ? 0 : 22],
      ];
      const usable = weights.filter(
        ([k, w]) => w > 0 && k !== lastKind && (k !== "explore" || visibleTargets().length),
      );
      const total = usable.reduce((n, [, w]) => n + w, 0);
      let r = Math.random() * total;
      for (const [k, w] of usable) {
        r -= w;
        if (r <= 0) return k;
      }
      return "look";
    };

    const inViewport = () => {
      const r = el.getBoundingClientRect();
      return (
        r.bottom > 0 &&
        r.top < window.innerHeight &&
        r.right > 0 &&
        r.left < window.innerWidth
      );
    };

    const canAct = () =>
      !engaged && !document.hidden && inViewport() && phase === "idle";

    const runOne = async () => {
      const kind = choose();
      lastKind = kind;
      runAbort = new AbortController();
      const signal = runAbort.signal;
      setPhase(kind === "explore" ? "exploring" : "acting");
      try {
        if (kind === "explore") await explore(signal);
        else await smallActivities[kind](signal);
      } catch (e) {
        if (!isAbort(e)) snapHome();
      } finally {
        ctl()?.clearExpression();
        ctl()?.clearLook();
        if (phase !== "idle") setPhase("idle");
      }
    };

    const loop = async () => {
      try {
        await sleep(rand(2000, 3500), life.signal);
        while (!life.signal.aborted) {
          const startedAt = performance.now();
          if (canAct()) await runOne();
          // Start-to-start spacing of 5-10 seconds.
          const gap = Math.max(1500, rand(5000, 10000) - (performance.now() - startedAt));
          await sleep(gap, life.signal);
        }
      } catch {
        // Ended by cleanup.
      }
    };

    // Reasons to stop and go home ------------------------------------------
    const interrupt = (instant: boolean) => {
      if (phase === "idle") return;
      runAbort.abort(); // the activity's `finally` flies home (quickly)
      if (instant) snapHome();
    };
    const onPointer = (e: PointerEvent) => {
      const r = btn.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const near = Math.hypot(dx, dy) < 200;
      if (near && !engaged) interrupt(false);
      engaged = near;
    };
    const onFocusIn = () => {
      engaged = true;
      interrupt(false);
    };
    const onFocusOut = () => {
      engaged = false;
    };
    const onHidden = () => {
      if (document.hidden) interrupt(true);
    };
    const onLayout = () => interrupt(true);

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    btn.addEventListener("focusin", onFocusIn);
    btn.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, { passive: true });

    void loop();

    return () => {
      life.abort();
      runAbort.abort();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      btn.removeEventListener("focusin", onFocusIn);
      btn.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout);
      snapHome(); // never leave the mascot away from home
      delete el.dataset.life;
    };
  }, [active, flyRef, controlRef, buttonRef, onMood]);

  return null;
}
