"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { MascotHandle, MascotMood } from "@/components/login/mascot/AuthMascot";
import { createRapidClickCounter } from "@/lib/ui/rapidClicks";

/**
 * Only the sound of this file is used: it is decoded into audio and played with
 * the Web Audio API. There is no <video> and nothing is ever shown from it.
 */
const SRC = "/mascot-rage.mp4";
/** Six clicks in a row, each within this long of the one before. */
const CLICKS = 6;
const GAP_MS = 1200;
/** Safety net so the whole thing always ends, whatever happens. */
const MAX_MS = 15000;
const FLIGHT_MS = 950;
const HOME_MS = 700;
const FALLBACK_VOICE_MS = 3600;

type Pose = { x: number; y: number; s: number };

type Props = {
  /** The mascot's wrapper: it is clicked, and it is the thing that flies. */
  targetRef: RefObject<HTMLElement | null>;
  controlRef: RefObject<MascotHandle | null>;
  /** Lets the dashboard show the "flying" mood while it travels. */
  onMood: (mood: MascotMood | null) => void;
  /** True for the whole sequence (so other mascot behaviour stays quiet). */
  onActiveChange?: (active: boolean) => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const abortError = () => new DOMException("aborted", "AbortError");

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

type AudioCtor = typeof AudioContext;

function createAudioContext(): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/**
 * Easter egg: click the mascot six times in a row and it flies to the middle of
 * the screen, gets angry and shouts (the audio plays the moment it arrives, and
 * its mouth follows the voice), then flies back home. It never blocks anything,
 * always ends by itself, and is skipped for people who prefer reduced motion.
 *
 * Mount this inside the mascot's wrapper.
 */
export function MascotRage({ targetRef, controlRef, onMood, onActiveChange }: Props) {
  const moodRef = useRef(onMood);
  const changeRef = useRef(onActiveChange);
  const counterRef = useRef<ReturnType<typeof createRapidClickCounter> | null>(null);
  if (counterRef.current === null) {
    counterRef.current = createRapidClickCounter({ count: CLICKS, gapMs: GAP_MS });
  }

  useEffect(() => {
    moodRef.current = onMood;
    changeRef.current = onActiveChange;
  });

  useEffect(() => {
    const el = targetRef.current;
    const counter = counterRef.current;
    if (!el || !counter) return;

    let ac: AudioContext | null = null;
    let decoded: Promise<AudioBuffer | null> | null = null;
    let active = false;
    let run: AbortController | null = null;
    let home: AbortController | null = null;
    let stopVoice: (() => void) | null = null;
    let watchdog = 0;
    const pose: Pose = { x: 0, y: 0, s: 1 };

    const apply = () => {
      const rest = pose.x === 0 && pose.y === 0 && pose.s === 1;
      el.style.transform = rest
        ? ""
        : `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.s})`;
      el.style.willChange = rest ? "" : "transform";
    };

    const snapHome = () => {
      home?.abort();
      pose.x = 0;
      pose.y = 0;
      pose.s = 1;
      apply();
    };

    /** The first click starts the sound loading, so it is ready by the sixth. */
    const prepareAudio = () => {
      if (!ac) ac = createAudioContext();
      const ctx = ac;
      if (!ctx) return;
      void ctx.resume().catch(() => undefined); // allowed: we are inside a click
      if (!decoded) {
        decoded = fetch(SRC)
          .then((res) => res.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data))
          .catch(() => null);
      }
    };

    /** A smooth, curved flight of the wrapper from its pose to `to`. */
    const fly = async (to: Pose, ms: number, signal: AbortSignal) => {
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
      const bow = dist * 0.18;
      const cx = (from.x + to.x) / 2 + nx * bow;
      const cy = (from.y + to.y) / 2 + ny * bow;
      await tween(
        ms,
        (k) => {
          const e = easeInOut(k);
          const u = 1 - e;
          pose.x = u * u * from.x + 2 * u * e * cx + e * e * to.x;
          pose.y = u * u * from.y + 2 * u * e * cy + e * e * to.y;
          pose.s = lerp(from.s, to.s, e);
          apply();
        },
        signal,
      );
      pose.x = to.x;
      pose.y = to.y;
      pose.s = to.s;
      apply();
    };

    /** Plays the sound now and feeds its loudness to the mouth. */
    const startVoice = async (): Promise<number> => {
      const ctx = ac;
      const control = controlRef.current;
      let buffer: AudioBuffer | null = null;
      if (ctx && decoded) {
        try {
          if (ctx.state !== "running") await ctx.resume();
          buffer = ctx.state === "running" ? await decoded : null;
        } catch {
          buffer = null;
        }
      }

      if (!ctx || !buffer) {
        // No sound available: still talk, so it never looks broken.
        let raf = 0;
        const t0 = performance.now();
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          control?.speak(0.5 + 0.5 * Math.sin(t * 17) * Math.sin(t * 5.3));
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        stopVoice = () => {
          cancelAnimationFrame(raf);
          control?.speak(null);
        };
        return FALLBACK_VOICE_MS;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      const data = new Uint8Array(analyser.fftSize);
      let raf = 0;
      let smooth = 0;
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
        smooth = lerp(smooth, level, 0.55);
        control?.speak(smooth);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      stopVoice = () => {
        cancelAnimationFrame(raf);
        control?.speak(null);
        try {
          source.stop();
        } catch {
          // already stopped
        }
      };
      source.start();
      return buffer.duration * 1000;
    };

    const sequence = async (signal: AbortSignal) => {
      const control = controlRef.current;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const scale = Math.max(
        1.2,
        Math.min(2.4, (Math.min(window.innerWidth, window.innerHeight) * 0.55) / rect.width),
      );
      const centre: Pose = {
        x: window.innerWidth / 2 - cx,
        y: window.innerHeight / 2 - cy,
        s: scale,
      };

      // 1. Fly to the middle of the page.
      moodRef.current(("fly") as MascotMood);
      await fly(centre, FLIGHT_MS, signal);
      moodRef.current(null);

      // 2. It has arrived: angry, shouting, and the sound plays right now.
      control?.wiggle();
      const ms = await startVoice();
      control?.express("angry", ms + 900);
      await sleep(ms + 500, signal);
      stopVoice?.();
      stopVoice = null;
    };

    const finish = async () => {
      window.clearTimeout(watchdog);
      stopVoice?.();
      stopVoice = null;
      controlRef.current?.speak(null);
      controlRef.current?.clearExpression();
      // Fly back to the exact corner (not cancelled by anything but leaving).
      if (pose.x !== 0 || pose.y !== 0 || pose.s !== 1) {
        home = new AbortController();
        moodRef.current("fly");
        try {
          await fly({ x: 0, y: 0, s: 1 }, HOME_MS, home.signal);
        } catch {
          // left the page
        }
        home = null;
      }
      snapHome();
      moodRef.current(null);
      active = false;
      changeRef.current?.(false);
    };

    const start = () => {
      active = true;
      changeRef.current?.(true);
      run = new AbortController();
      const signal = run.signal;
      watchdog = window.setTimeout(() => run?.abort(), MAX_MS);
      void sequence(signal)
        .catch(() => undefined)
        .finally(() => void finish());
    };

    const onClick = () => {
      prepareAudio();
      if (active) return;
      if (!counter.hit(performance.now())) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      start();
    };

    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("click", onClick);
      run?.abort();
      window.clearTimeout(watchdog);
      stopVoice?.();
      snapHome();
      if (active) {
        moodRef.current(null);
        changeRef.current?.(false);
      }
      void ac?.close().catch(() => undefined);
    };
  }, [targetRef, controlRef]);

  return null;
}
