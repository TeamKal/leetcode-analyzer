"use client";

import { blockAfterAudio } from "./block";
import { useEffect, useRef, type RefObject } from "react";
import type { MascotHandle } from "@/components/login/mascot/AuthMascot";
import { planRoute, sampleRoute, type PlanSection } from "@/lib/ui/blastRoute";
import { createClickTally } from "@/lib/ui/clickTally";
import { shouldBlockKey } from "@/lib/ui/overlayLock";
import { createCueTrack, type Cue } from "@/lib/ui/timeline";
import { createBlastAudio } from "./audio";
import { BLAST_CONFIG as C, DIALOGUE_EXPRESSIONS } from "./config";
import type { Effects } from "./effects";

type Props = {
  /** The mascot's wrapper: it is clicked, and it is the thing that travels. */
  targetRef: RefObject<HTMLElement | null>;
  controlRef: RefObject<MascotHandle | null>;
  /** The page's main area (the sections to visit are found inside it). */
  areaRef: RefObject<HTMLElement | null>;
  /** True while something else owns the mascot; a finished tally waits for it. */
  busy: boolean;
  /** True for the whole sequence. */
  onActiveChange: (active: boolean) => void;
  /** True while the page must not be interacted with. */
  onLockChange: (locked: boolean) => void;
  /** Called when the page has been destroyed: render nothing from then on. */
  onRuin: () => void;
};

/** A different planting animation for each charge. */
const PLANT_MOVES: Array<(c: MascotHandle) => void> = [
  (c) => {
    c.tilt(16, 600);
    c.bounce(120);
  },
  (c) => {
    c.sway(-8, 600);
    c.wiggle();
  },
  (c) => {
    c.stretch();
    c.tilt(-14, 600);
  },
  (c) => {
    c.bounce(200);
    c.wiggle();
  },
  (c) => {
    c.tilt(24, 650);
    c.sway(8, 650);
  },
];

/** Gestures while it talks, one on each burst of loudness. */
const TALK_MOVES: Array<(c: MascotHandle) => void> = [
  (c) => c.bounce(110),
  (c) => c.tilt(7, 320),
  (c) => c.sway(5, 380),
  (c) => c.wiggle(),
  (c) => c.tilt(-7, 320),
  (c) => c.bounce(160),
];

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** The sections to visit, in reading order, found live so any layout works. */
function findSections(area: HTMLElement | null): PlanSection[] {
  const out: PlanSection[] = [];
  const toBox = (r: DOMRect, fixed: boolean) => ({
    left: r.left,
    top: fixed ? r.top : r.top + window.scrollY,
    width: r.width,
    height: r.height,
  });
  const nav = document.querySelector(".pn-bar");
  if (nav) out.push({ box: toBox(nav.getBoundingClientRect(), true), fixed: true });
  const heading = area?.querySelector("h1");
  if (heading) out.push({ box: toBox(heading.getBoundingClientRect(), false), fixed: false });
  area
    ?.querySelectorAll(".fs-card")
    .forEach((el) => out.push({ box: toBox(el.getBoundingClientRect(), false), fixed: false }));
  return out;
}

/**
 * Hidden: after ten clicks on the mascot the audio starts and one timeline,
 * driven by the audio's own clock, plays out:
 *
 *   0:00 - 0:07  it tours every section planting a charge, and is back in the
 *                middle of the screen at exactly 0:07
 *   0:08 - 0:19  it speaks (its mouth follows the audio)
 *   0:19 +       a last gesture, it leaves, the charges go off, the page is
 *                destroyed and what is left is a plain screen
 *
 * Every time is in `config.ts`. Mount inside the mascot's wrapper.
 */
export function BlastSequence({
  targetRef,
  controlRef,
  areaRef,
  busy,
  onActiveChange,
  onLockChange,
  onRuin,
}: Props) {
  const busyRef = useRef(busy);
  const activeCb = useRef(onActiveChange);
  const lockCb = useRef(onLockChange);
  const ruinCb = useRef(onRuin);
  const pendingRef = useRef(false);
  const startRef = useRef<(() => void) | null>(null);
  const tallyRef = useRef<ReturnType<typeof createClickTally> | null>(null);
  if (tallyRef.current === null) tallyRef.current = createClickTally(C.clicksToStart);

  useEffect(() => {
    busyRef.current = busy;
    activeCb.current = onActiveChange;
    lockCb.current = onLockChange;
    ruinCb.current = onRuin;
    if (!busy && pendingRef.current) startRef.current?.();
  });

  useEffect(() => {
    const el = targetRef.current;
    const tally = tallyRef.current;
    if (!el || !tally) return;

    const audio = createBlastAudio(C.audioSrc);
    let effects: Promise<Effects | null> | null = null;
    let active = false;
    let ran = false;
    let completed = false;
    let raf = 0;
    let unlock: (() => void) | null = null;

    const apply = (x: number, y: number, s: number) => {
      const rest = x === 0 && y === 0 && s === 1;
      el.style.transform = rest ? "" : `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      el.style.willChange = rest ? "" : "transform";
    };

    /** Blocks mouse wheel, touch scrolling, context menu and plain keys. */
    const lock = () => {
      const stop = (event: Event) => event.preventDefault();
      const key = (event: KeyboardEvent) => {
        if (shouldBlockKey(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const opts = { capture: true, passive: false } as const;
      window.addEventListener("keydown", key, true);
      window.addEventListener("wheel", stop, opts);
      window.addEventListener("touchmove", stop, opts);
      window.addEventListener("contextmenu", stop, true);
      lockCb.current(true);
      unlock = () => {
        window.removeEventListener("keydown", key, true);
        window.removeEventListener("wheel", stop, opts);
        window.removeEventListener("touchmove", stop, opts);
        window.removeEventListener("contextmenu", stop, true);
        lockCb.current(false);
        unlock = null;
      };
    };

    /** The 3D layer is fetched early and built just before it is needed. */
    const loadEffects = () => {
      if (effects) return;
      effects = import("./effects")
        .then((m) =>
          m.createEffects({
            modelUrl: C.c4ModelUrl,
            detonateMs: C.detonateMs,
            chainMs: C.chainMs,
          }),
        )
        .catch(() => null);
    };

    const finish = (ruined: boolean, fx: Effects | null) => {
      cancelAnimationFrame(raf);
      controlRef.current?.speak(null);
      controlRef.current?.clearExpression();
      unlock?.();
      completed = true;
      fx?.dispose();
      if (ruined) {
        audio.release(() => void blockAfterAudio()); // play out, then block
        ruinCb.current();
      } else {
        audio.dispose();
        apply(0, 0, 1);
        active = false;
        activeCb.current(false);
      }
    };

    const start = async () => {
      if (active || ran) return;
      if (busyRef.current) {
        pendingRef.current = true; // wait until the mascot is free
        return;
      }
      pendingRef.current = false;
      ran = true;
      active = true;
      activeCb.current(true);
      const control = controlRef.current;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !control) {
        // No travelling or destruction: just the sly look for a moment.
        control?.express("evil", 2500);
        window.setTimeout(() => {
          control?.clearExpression();
          active = false;
          activeCb.current(false);
        }, 2600);
        return;
      }

      loadEffects();
      const fx = await Promise.race([
        effects!,
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
      ]);

      // Everything is worked out before anything moves.
      const rect = el.getBoundingClientRect();
      const restX = rect.left + rect.width / 2;
      const restY = rect.top + rect.height / 2;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const plan = planRoute({
        sections: findSections(areaRef.current),
        vw,
        vh,
        maxScroll: document.documentElement.scrollHeight - vh,
        startScroll: window.scrollY,
        rest: { x: restX, y: restY },
        size: rect.width,
        beginMs: C.beginMs,
        returnStartMs: C.returnStartMs,
        centredMs: C.centredMs,
        centreScale: C.centreScale,
      });

      lock();
      const root = document.querySelector<HTMLElement>(".dash");
      const hideDom = () => {
        // The live page gives way to its shards at the white-hot peak.
        if (root) {
          document.body.style.background = getComputedStyle(root).backgroundColor;
          root.style.visibility = "hidden";
        }
      };

      const clock = await audio.play();
      const cues: Cue[] = [
        { at: 0, name: "evil", run: () => control.express("evil", C.dialogueStartMs + 400) },
      ];
      for (const stop of plan.stops) {
        cues.push(
          { at: stop.arriveMs, name: `plant-${stop.index}`, run: () => PLANT_MOVES[stop.index % PLANT_MOVES.length](control) },
          { at: stop.dropMs, name: `drop-${stop.index}`, run: () => fx?.addCharge({ ...stop.charge, fixed: stop.fixed }, clock.now()) },
        );
      }
      cues.push({ at: C.captureAtMs, name: "capture", run: () => void fx?.capture().catch(() => undefined) });
      DIALOGUE_EXPRESSIONS.forEach((entry, i) => {
        const next = DIALOGUE_EXPRESSIONS[i + 1]?.at ?? C.dialogueEndMs;
        cues.push({
          at: entry.at,
          name: `expression-${i}`,
          run: () => control.express(entry.expression, next - entry.at + 250),
        });
      });
      cues.push(
        {
          at: C.finalGestureMs,
          name: "final-gesture",
          run: () => {
            control.express("playful", C.exitStartMs - C.finalGestureMs + 300);
            control.stretch();
            control.wiggle();
          },
        },
        { at: C.exitStartMs, name: "exit", run: () => control.tilt(-18, 500) },
        {
          at: C.detonateMs,
          name: "detonate",
          run: () => {
            if (fx) fx.detonate(clock.now(), hideDom);
          },
        },
      );
      const track = createCueTrack(cues);

      let lastTs = performance.now();
      let prevLevel = 0;
      let lastBeat = -1000;
      let beats = 0;
      let talking = false;
      let lastScroll = window.scrollY;

      const tick = (ts: number) => {
        const t = clock.now();
        const dt = Math.min(100, ts - lastTs);
        lastTs = ts;

        // Where the mascot and the page are, straight from the clock.
        const s = sampleRoute(plan, t);
        let x = s.x;
        let y = s.y;
        let scale = s.s;
        if (t > C.exitStartMs) {
          const k = ease((t - C.exitStartMs) / (C.exitEndMs - C.exitStartMs));
          x = s.x + (vw + 320 - s.x) * k;
          y = s.y + (-0.15 * vh - s.y) * k;
          scale = s.s * (1 - 0.35 * k);
        }
        apply(x - restX, y - restY, scale);
        if (t < C.exitStartMs && Math.abs(window.scrollY - s.scrollY) > 0.5) {
          window.scrollTo({ top: s.scrollY, behavior: "instant" });
        }
        lastScroll = s.scrollY;

        track.update(t);

        // The dialogue: the mouth follows the audio, and it gestures on the beat.
        const inDialogue = t >= C.speechStartMs && t <= C.speechEndMs;
        if (inDialogue) {
          const level = clock.level();
          control.speak(level);
          talking = true;
          if (level > 0.38 && prevLevel <= 0.38 && t - lastBeat > 600) {
            lastBeat = t;
            TALK_MOVES[beats % TALK_MOVES.length](control);
            beats += 1;
          }
          prevLevel = level;
        } else if (talking) {
          control.speak(null);
          talking = false;
        }

        fx?.frame(t, dt);

        if (fx?.finished || t > C.maxMs) {
          finish(fx?.detonated ?? false, fx);
          return;
        }
        // Without the 3D layer there is nothing to detonate: end after the exit.
        if (!fx && t > C.exitEndMs + 400) {
          finish(false, null);
          return;
        }
        void lastScroll;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    startRef.current = () => void start();

    const onClick = () => {
      // The first click starts getting the sound and the 3D layer ready.
      audio.prime();
      if (tally.count === 0) void import("./effects");
      if (tally.count >= C.clicksToStart - 3) loadEffects();
      if (tally.hit()) void start();
    };
    el.addEventListener("click", onClick);

    return () => {
      el.removeEventListener("click", onClick);
      startRef.current = null;
      cancelAnimationFrame(raf);
      unlock?.();
      if (!completed) {
        audio.dispose();
        controlRef.current?.speak(null);
        apply(0, 0, 1);
        if (active) activeCb.current(false);
        void effects?.then((fx) => fx?.dispose());
      }
    };
  }, [targetRef, controlRef, areaRef]);

  return null;
}
