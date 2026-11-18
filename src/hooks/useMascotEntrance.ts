"use client";

import { useLayoutEffect, type RefObject } from "react";
import type { MascotMood } from "@/components/login/mascot/AuthMascot";

// Timeline (ms).
const START_DELAY = 450; // the page settles first
const FLIGHT_MS = 1500;
const LAND_MS = 700;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const easeInOut = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * The mascot arrives from outside the browser window: it swoops in from above the
 * top edge along a curve, flapping, and lands in its corner with a small squash
 * and bounce. The same mascot instance is moved by transform only, so cursor
 * tracking works the moment it lands. Skipped with reduced motion.
 */
export function useMascotEntrance(
  ref: RefObject<HTMLElement | null>,
  setMood: (mood: MascotMood | null) => void,
  onLanded?: () => void,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.ready = "true";
      return;
    }

    // Where it rests, measured before any transform.
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const p0 = { x: 90, y: -(rect.top + rect.height + 90) }; // above the top edge
    const swing = -Math.min(vw * 0.35, 380);
    const ctrl = { x: swing, y: p0.y * 0.45 };

    const at = (e: number) => {
      const u = 1 - e;
      return {
        x: u * u * p0.x + 2 * u * e * ctrl.x,
        y: u * u * p0.y + 2 * u * e * ctrl.y,
        // Horizontal speed along the curve: the mascot leans into it.
        vx: 2 * u * (ctrl.x - p0.x) + 2 * e * (0 - ctrl.x),
      };
    };

    const place = (x: number, y: number, rot: number, sx: number, sy: number) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${sx}, ${sy})`;
    };

    place(p0.x, p0.y, 0, 1, 1);
    el.dataset.ready = "true";

    let raf = 0;
    let started = 0;
    let landed = false;
    let done = false;
    const timers: number[] = [];

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.style.transform = "";
      setMood(null);
      onLanded?.();
    };

    const frame = (now: number) => {
      if (!started) started = now;
      const t = now - started;

      if (t < FLIGHT_MS) {
        const k = t / FLIGHT_MS;
        const e = easeInOut(k);
        const p = at(e);
        const rot = clamp(p.vx / 40, -20, 20) * Math.sin(Math.PI * Math.min(1, k * 1.15));
        const stretch = 1 + 0.06 * Math.sin(Math.PI * k);
        place(p.x, p.y, rot, 1 / Math.sqrt(stretch), stretch);
      } else {
        if (!landed) {
          landed = true;
          setMood(null); // the mascot hops once as it stops flying
        }
        // Landing: a damped squash and a tiny bounce.
        const tau = (t - FLIGHT_MS) / 1000;
        const osc = Math.exp(-tau * 7) * Math.cos(tau * 24);
        const lift = Math.max(0, Math.sin(Math.min(tau * 10, Math.PI))) * 8 * Math.exp(-tau * 6);
        place(0, -lift, 0, 1 + 0.1 * osc, 1 - 0.16 * osc);
        if (t >= FLIGHT_MS + LAND_MS) {
          finish();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    timers.push(
      window.setTimeout(() => {
        setMood("fly");
        raf = requestAnimationFrame(frame);
      }, START_DELAY),
    );
    // If frames never run (a hidden tab), do not leave it parked off-screen.
    timers.push(window.setTimeout(finish, START_DELAY + FLIGHT_MS + LAND_MS + 3000));

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };
    // Plays once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
