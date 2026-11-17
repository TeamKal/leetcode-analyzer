"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { MascotMood } from "./AuthMascot";
import "./intro.css";

/**
 * Welcome intro. The page starts completely black (the cover is in the server
 * HTML, so the login page is never seen first). The mascot is already there,
 * large in the centre, and waves hello without moving. Then it takes off, and at
 * that moment the black fades away to reveal the login page while the mascot
 * flies along a curve to its normal spot above the Google button, shrinks, and
 * lands with a little bounce.
 *
 * It is the SAME mascot instance: the intro only moves its wrapper with a
 * transform and sets its mood, so cursor tracking and reactions work normally
 * the moment it lands.
 *
 * The server decides whether to play (once per session, never after a sign-in
 * error, ?intro=1 replays). Reduced motion hides the cover with CSS and skips
 * everything. Any key press or click on the black screen ends the intro.
 */

const SEEN_COOKIE = "lca-intro-seen";

// Timeline (ms).
const FADE_IN_MS = 450; // the mascot fades in on the black screen
const WAVE_END = 2100; // stops waving, keeps a calm friendly look
const PREP_START = 2500; // end of the 2.5s centred wait; mascot crouches in place
const FLIGHT_START = 2850; // takeoff: the black starts to fade at this moment
const FLIGHT_END = 3900;
const FADE_MS = 1000; // black fades while the mascot flies
const LAND_END = 4500;
const WATCHDOG_MS = LAND_END + 2500; // the intro can never get stuck

type Puff = {
  id: number;
  x: number;
  y: number;
  size: number;
  dx: number;
  dy: number;
  delay: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

type WelcomeIntroProps = {
  /** Wrapper around the (already positioned) mascot. */
  flyRef: RefObject<HTMLElement | null>;
  onMood: (mood: MascotMood | null) => void;
  /** Called once when the intro has finished (or was ended early). */
  onDone?: () => void;
};

export function WelcomeIntro({ flyRef, onMood, onDone }: WelcomeIntroProps) {
  const coverRef = useRef<HTMLDivElement>(null);
  const [puffs, setPuffs] = useState<Puff[]>([]);

  useLayoutEffect(() => {
    const el = flyRef.current as HTMLElement | null;
    const cover = coverRef.current;
    if (!el || !cover) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || window.scrollY > 40) {
      cover.style.display = "none";
      el.dataset.intro = "off";
      onDone?.();
      return;
    }

    // Geometry, measured once at rest (the wrapper has no transform yet).
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hx = rect.left + rect.width / 2;
    const hy = rect.top + rect.height / 2;
    const cx = vw / 2;
    const cy = vh / 2; // exactly centred
    const bigWidth = Math.min(Math.max(Math.min(vw * 0.6, vh * 0.46), 190), 380);
    const S = bigWidth / rect.width;
    const p0 = { x: cx - hx, y: cy - hy };
    const p1 = { x: 0, y: 0 };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const dirX = (p1.x - p0.x) / dist;
    const dirY = (p1.y - p0.y) / dist;
    const dirSign = dirX >= 0 ? 1 : -1;
    // The flight bows upward: control point off the midpoint, perpendicular.
    let perp = { x: -dirY, y: dirX };
    if (perp.y > 0) perp = { x: -perp.x, y: -perp.y };
    const ctrl = {
      x: (p0.x + p1.x) / 2 + perp.x * dist * 0.3,
      y: (p0.y + p1.y) / 2 + perp.y * dist * 0.3,
    };
    const bez = (e: number) => {
      const u = 1 - e;
      return {
        x: u * u * p0.x + 2 * u * e * ctrl.x + e * e * p1.x,
        y: u * u * p0.y + 2 * u * e * ctrl.y + e * e * p1.y,
      };
    };

    el.dataset.intro = "playing";
    el.style.opacity = "0";
    cover.style.opacity = "1";
    cover.style.pointerEvents = "auto";
    onMood("greet");

    let clock = 0;
    let last = performance.now();
    let raf = 0;
    let finished = false;
    let prepared = false;
    let smoked = false;
    let landed = false;
    let calm = false;
    let puffId = 0;
    const timers: number[] = [];

    const spawn = (items: Omit<Puff, "id">[]) => {
      setPuffs(items.map((p) => ({ ...p, id: puffId++ })));
      timers.push(window.setTimeout(() => setPuffs([]), 1300));
    };

    const frame = (t: number) => {
      // The black stays fully opaque until takeoff, then fades as it flies.
      const black =
        t < FLIGHT_START ? 1 : 1 - easeInOut((t - FLIGHT_START) / FADE_MS);
      cover.style.opacity = String(Math.max(0, black));
      cover.style.pointerEvents = t < FLIGHT_START ? "auto" : "none";

      let x = p0.x;
      let y = p0.y;
      let scale = S;
      let sx = 1;
      let sy = 1;
      let rot = 0;

      if (t < PREP_START) {
        // Greeting: stays put. (Waving, blinking and breathing come from the mascot.)
      } else if (t < FLIGHT_START) {
        // Wind-up: crouch and lean back, still in the same place.
        const k = easeInOut((t - PREP_START) / (FLIGHT_START - PREP_START));
        sy = 1 - 0.12 * k;
        sx = 1 + 0.08 * k;
        rot = -dirSign * 10 * k;
      } else if (t < FLIGHT_END) {
        // Flight along the curve, shrinking and leaning into the turn.
        const k = (t - FLIGHT_START) / (FLIGHT_END - FLIGHT_START);
        const e = easeInOut(k);
        const pos = bez(e);
        x = pos.x;
        y = pos.y;
        scale = lerp(S, 1, e);
        rot =
          dirSign * 18 * Math.sin(Math.PI * k) -
          dirSign * 10 * (1 - easeInOut(Math.min(1, k * 3)));
        sy = 1 + 0.07 * Math.sin(Math.PI * k);
        sx = 1 - 0.04 * Math.sin(Math.PI * k);
      } else {
        // Landing: settle with a damped squash and bounce.
        x = 0;
        scale = 1;
        const tau = (t - FLIGHT_END) / 1000;
        const osc = Math.exp(-tau * 7) * Math.cos(tau * 24);
        sy = 1 - 0.16 * osc;
        sx = 1 + 0.1 * osc;
        y = -Math.max(0, Math.sin(Math.min(tau * 10, Math.PI))) * 6 * Math.exp(-tau * 6);
      }

      // Smooth fade-in on the black screen, then fully opaque for good.
      el.style.opacity = String(
        t < FADE_IN_MS ? 1 - Math.pow(1 - clamp01(t / FADE_IN_MS), 2) : 1,
      );
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale * sx}, ${scale * sy})`;

      // One-shot events on the timeline.
      if (!calm && t >= WAVE_END) {
        calm = true;
        onMood("welcome");
      }
      if (!prepared && t >= PREP_START) {
        prepared = true;
        onMood("fly");
      }
      if (!smoked && t >= FLIGHT_START) {
        // A small neutral puff of smoke at takeoff.
        smoked = true;
        const feetY = cy + bigWidth * 0.42;
        const unit = bigWidth;
        spawn(
          [-0.22, -0.08, 0.08, 0.22].map((o, i) => ({
            x: cx + o * unit,
            y: feetY + (i % 2) * 6,
            size: unit * (0.09 + (i % 3) * 0.025),
            dx: o * unit * 0.8,
            dy: -unit * 0.04 + (i % 2) * 8,
            delay: i * 25,
          })),
        );
      }
      if (!landed && t >= FLIGHT_END) {
        landed = true;
        onMood(null);
        const feetY = hy + rect.height * 0.42;
        const unit = rect.width;
        spawn(
          [-0.34, 0.34].map((o, i) => ({
            x: hx + o * unit,
            y: feetY,
            size: unit * (0.14 + i * 0.03),
            dx: o * unit * 0.6,
            dy: -4,
            delay: i * 20,
          })),
        );
      }
    };

    const markSeen = () => {
      document.cookie = `${SEEN_COOKIE}=1; path=/; SameSite=Lax`;
    };

    const restore = () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", onSkip);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", markSeen);
      el.style.transform = "";
      el.style.opacity = "";
      el.dataset.intro = "off";
      cover.style.opacity = "0";
      cover.style.pointerEvents = "none";
      setPuffs([]);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      restore();
      onMood(null);
      markSeen();
      onDone?.();
    };

    function onSkip() {
      finish();
    }

    // Height-only resizes (mobile address bar) are ignored; a real change of
    // width (rotation, window resize) ends the intro so positions stay right.
    function onResize() {
      if (Math.abs(window.innerWidth - vw) > 40) finish();
    }

    const tick = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      clock += dt;
      if (clock >= LAND_END) {
        frame(LAND_END);
        finish();
        return;
      }
      frame(clock);
      raf = requestAnimationFrame(tick);
    };

    frame(0);
    raf = requestAnimationFrame(tick);
    // Safety net: if frames ever stop (e.g. a hidden tab), end the intro anyway.
    timers.push(window.setTimeout(finish, WATCHDOG_MS));
    // Any key press, or a click on the black screen, ends the intro at once.
    window.addEventListener("keydown", onSkip);
    window.addEventListener("resize", onResize);
    window.addEventListener("pagehide", markSeen);
    cover.addEventListener("click", onSkip);

    return () => {
      cover.removeEventListener("click", onSkip);
      if (!finished) {
        finished = true;
        restore();
        onMood(null);
      }
    };
    // The intro runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      <div
        ref={coverRef}
        className="pm-cover absolute inset-0 bg-black"
        style={{ pointerEvents: "auto" }}
      />

      {puffs.map((puff) => (
        <span
          key={puff.id}
          className="pm-puff"
          style={
            {
              left: puff.x,
              top: puff.y,
              "--size": `${puff.size}px`,
              "--dx": `${puff.dx}px`,
              "--dy": `${puff.dy}px`,
              "--delay": `${puff.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
