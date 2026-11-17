"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { DEFAULT_CHARACTER, type Character } from "./characters";
import { Spring } from "./spring";
import "./mascot.css";

/**
 * The sign-in mascot. One animated face rig, many characters (see
 * characters.tsx). Every reaction is tied to a real interface event:
 *
 *  - pointer anywhere      -> eyes follow it, head tilts (subtle when far)
 *  - pointer nearing the
 *    Google button         -> curious: wider eyes, raised brows, leans in
 *  - pointer over / keyboard
 *    focus on the button   -> amazed: big eyes, open mouth, small bounce
 *  - button clicked        -> celebrates briefly, then calm while signing in
 *  - sign-in running       -> calm, looks at the button
 *  - sign-in error         -> worried brows and a small frown
 *  - pointer leaves        -> eases back to idle and glances around
 *  - welcome intro         -> "greet" (waves) and "fly" (flaps) moods; landing
 *    from a flight gives a small hop
 */

/** Short expressions the life controller can ask for (ambient, not user-driven). */
export type MascotExpression =
  | "surprised"
  | "shocked"
  | "curious"
  | "happy"
  | "thinking"
  | "sleepy"
  | "playful";

/** Imperative controls used by the life controller (MascotLife). */
export type MascotHandle = {
  express(name: MascotExpression, ms: number): void;
  clearExpression(): void;
  /** Eyes and head follow a viewport point for `ms`. */
  lookAt(clientX: number, clientY: number, ms: number): void;
  clearLook(): void;
  /** Roll the body by `deg`, then back after `ms`. */
  tilt(deg: number, ms: number): void;
  sway(px: number, ms: number): void;
  bounce(strength?: number): void;
  stretch(): void;
  wiggle(): void;
};

export type MascotMood =
  | "idle"
  | "busy"
  | "error"
  | "greet"
  | "welcome"
  | "fly";

type AuthMascotProps = {
  /** The element that wraps the Google button. */
  targetRef: RefObject<HTMLElement | null>;
  /** The whole sign-in panel (used to detect the pointer leaving it). */
  areaRef: RefObject<HTMLElement | null>;
  mood: MascotMood;
  character?: Character;
  /** Receives the imperative handle (set while mounted). */
  controlRef?: RefObject<MascotHandle | null>;
  className?: string;
};

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Mouth outline for a given smile (-1..1) and openness (0..1). */
function mouthPath(smile: number, open: number) {
  const w = 13 + open * 5;
  if (open < 0.06) return `M ${-w} 0 Q 0 ${smile * 16} ${w} 0`;
  const y = -open * 1.5;
  const top = smile * 8 + 2;
  const bottom = (3 + open * 20) * 2 + smile * 6;
  return `M ${-w} ${y} Q 0 ${top} ${w} ${y} Q 0 ${bottom} ${-w} ${y} Z`;
}

const BITS = [
  { dx: -58, dy: -44, rot: -220, color: "#ef3837", delay: 0 },
  { dx: -34, dy: -66, rot: 160, color: "#141414", delay: 30 },
  { dx: -8, dy: -76, rot: -120, color: "#ff8f8a", delay: 0 },
  { dx: 22, dy: -70, rot: 240, color: "#ef3837", delay: 50 },
  { dx: 48, dy: -56, rot: -180, color: "#2a2a2e", delay: 10 },
  { dx: 64, dy: -30, rot: 140, color: "#f3c9c8", delay: 40 },
  { dx: -66, dy: -16, rot: 200, color: "#ff8f8a", delay: 60 },
  { dx: 70, dy: -8, rot: -160, color: "#ef3837", delay: 20 },
];

export function AuthMascot({
  targetRef,
  areaRef,
  mood,
  character = DEFAULT_CHARACTER,
  controlRef,
  className = "",
}: AuthMascotProps) {
  const reduced = usePrefersReducedMotion();
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const moodRef = useRef<MascotMood>(mood);
  const wakeRef = useRef<(() => void) | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    moodRef.current = mood;
    wakeRef.current?.();
  }, [mood]);

  useEffect(() => {
    const svg = svgRef.current;
    const target = targetRef.current;
    if (!svg || !target) return;
    const f = character.face;
    const eyeBoost = f.eyeBoost ?? 1;
    const maxPupilX = Math.max(3, f.eyeRx - f.pupilR * 1.1);
    const maxPupilY = Math.max(3, f.eyeRy - f.pupilR * 1.1);

    const part = (name: string) =>
      svg.querySelector<SVGElement>(`[data-part="${name}"]`);
    const body = part("body") as SVGElement;
    const face = part("face") as SVGElement;
    const eyeL = part("eye-l") as SVGElement;
    const eyeR = part("eye-r") as SVGElement;
    const pupilL = part("pupil-l") as SVGElement;
    const pupilR = part("pupil-r") as SVGElement;
    const browL = part("brow-l") as SVGElement;
    const browR = part("brow-r") as SVGElement;
    const mouth = part("mouth") as SVGElement;
    const cheekL = part("cheek-l") as SVGElement;
    const cheekR = part("cheek-r") as SVGElement;
    const earL = part("ear-l");
    const earR = part("ear-r");
    const shadow = part("shadow") as SVGElement;
    const pivot = character.earPivot;

    const S = {
      gx: new Spring(120, 16),
      gy: new Spring(120, 16),
      inf: new Spring(90, 14, 0.3),
      lean: new Spring(110, 13),
      eye: new Spring(230, 17, 1),
      brow: new Spring(210, 15),
      tilt: new Spring(200, 15),
      open: new Spring(250, 19),
      smile: new Spring(200, 16, 0.55),
      cheek: new Spring(120, 14),
      pupil: new Spring(230, 17, 1),
      jump: new Spring(240, 11),
      ear: new Spring(300, 9),
      wave: new Spring(420, 20),
      blink: new Spring(700, 45),
      // Ambient extras driven by the life controller.
      roll: new Spring(120, 11),
      sway: new Spring(110, 12),
      stretch: new Spring(180, 11),
      lid: new Spring(180, 16),
      wink: new Spring(600, 40),
      skew: new Spring(200, 15),
    };
    const all = Object.values(S);

    const pointer = { x: 0, y: 0, inside: false, last: 0 };
    let hovering = false;
    let celebrateStart = 0;
    let celebrateUntil = 0;
    let secondJump = true;
    let wander = { x: 0, y: 0 };
    let raf = 0;
    let last = 0;
    let prevMood: MascotMood = moodRef.current;
    let act: { name: MascotExpression; until: number } | null = null;
    let look: { x: number; y: number; until: number } | null = null;

    const render = () => {
      const sy0 = clamp(1 - S.jump.v * 0.0006, 0.88, 1.12);
      const sy = sy0 * (1 + S.stretch.x);
      const sx = (2 - sy0) * (1 - 0.6 * S.stretch.x);
      const headX = S.gx.x * S.inf.x;
      const headY = S.gy.x * S.inf.x;
      const rot = headX * 5 + S.lean.x * 6 + S.roll.x;
      body.setAttribute(
        "transform",
        `translate(${headX * 4 + S.lean.x * 5 + S.sway.x} ${S.jump.x}) rotate(${rot} 100 168) translate(100 168) scale(${sx} ${sy}) translate(-100 -168)`,
      );
      face.setAttribute("transform", `translate(${headX * 7} ${headY * 5})`);

      const blink = clamp(S.blink.x, 0, 1);
      const es = 1 + (S.eye.x - 1) * eyeBoost;
      const lid = 1 - clamp(S.lid.x, 0, 1) * 0.5;
      const eyeT = (p: { x: number; y: number }, closed: number) =>
        `translate(${p.x} ${p.y + S.gy.x * 1.5}) scale(${es} ${es * (1 - closed * 0.9) * lid})`;
      eyeL.setAttribute(
        "transform",
        eyeT(f.eyeL, Math.max(blink, clamp(S.wink.x, 0, 1))),
      );
      eyeR.setAttribute("transform", eyeT(f.eyeR, blink));
      const pupilT = `translate(${S.gx.x * maxPupilX} ${S.gy.x * maxPupilY}) scale(${S.pupil.x})`;
      pupilL.setAttribute("transform", pupilT);
      pupilR.setAttribute("transform", pupilT);

      const lift = S.brow.x * 8;
      const tilt = S.tilt.x * 14;
      browL.setAttribute(
        "transform",
        `translate(${f.eyeL.x} ${f.browY - lift - S.skew.x * 5}) rotate(${-tilt - S.skew.x * 5})`,
      );
      browR.setAttribute(
        "transform",
        `translate(${f.eyeR.x} ${f.browY - lift + S.skew.x * 3}) rotate(${tilt})`,
      );

      mouth.setAttribute("d", mouthPath(S.smile.x, S.open.x));
      mouth.setAttribute(
        "fill",
        S.open.x > 0.06 ? character.palette.mouthFill : "none",
      );
      const cheek = String(clamp(S.cheek.x, 0, 1) * 0.55);
      cheekL.setAttribute("opacity", cheek);
      cheekR.setAttribute("opacity", cheek);

      if (pivot) {
        earL?.setAttribute(
          "transform",
          `rotate(${S.ear.x} ${pivot.l.x} ${pivot.l.y})`,
        );
        earR?.setAttribute(
          "transform",
          `rotate(${-(S.ear.x + S.wave.x)} ${pivot.r.x} ${pivot.r.y})`,
        );
      }

      const lift01 = clamp(-S.jump.x / 40, 0, 1);
      shadow.setAttribute(
        "transform",
        `translate(100 176) scale(${1 - lift01 * 0.25} 1) translate(-100 -176)`,
      );
      shadow.setAttribute("opacity", String(0.14 * (1 - lift01 * 0.4)));
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.032, (now - last) / 1000) : 1 / 60;
      last = now;

      const m = moodRef.current;
      const intro = m === "greet" || m === "welcome" || m === "fly";
      if (prevMood === "fly" && m !== "fly" && !reduced) {
        // Landing after the welcome flight: a small hop and a blink.
        S.jump.kick(-170);
        S.blink.target = 1;
        window.setTimeout(() => {
          S.blink.target = 0;
          wakeRef.current?.();
        }, 120);
      }
      prevMood = m;
      const celebrating = now < celebrateUntil;
      if (celebrating && !secondJump && now - celebrateStart > 380) {
        secondJump = true;
        if (!reduced) {
          S.jump.kick(-230);
          S.ear.kick(-380);
        }
      }

      // Where is the face, where is the pointer, how close is the button?
      const rect = svg.getBoundingClientRect();
      const fcx = rect.left + rect.width * 0.5;
      const fcy = rect.top + rect.height * 0.52;
      const br = target.getBoundingClientRect();
      const active = !reduced && pointer.inside && now - pointer.last < 6000;
      const actActive = !reduced && act !== null && now < act.until;
      const lookActive = !reduced && look !== null && now < look.until;

      let gtx = 0;
      let gty = 0;
      let infTarget = 0.45;
      if (reduced) {
        gtx = 0;
        gty = 0;
      } else if (intro) {
        // Looks at the visitor, with a slow, small head drift (not while flying).
        if (m !== "fly") {
          gtx = 0.18 * Math.sin(now / 1700);
          gty = 0.05 + 0.08 * Math.sin(now / 2300 + 1);
        } else {
          gty = 0.05;
        }
        infTarget = 0.3;
      } else if (m === "busy") {
        gty = 0.85;
        infTarget = 0.4;
      } else if (lookActive && !hovering && look) {
        // The life controller asked it to look at something on the page.
        const dx = look.x - fcx;
        const dy = look.y - fcy;
        const dist = Math.hypot(dx, dy) || 1;
        const mag = clamp(dist / 120, 0, 1);
        gtx = (dx / dist) * mag;
        gty = (dy / dist) * mag;
        infTarget = 0.7;
      } else if (active) {
        const dx = pointer.x - fcx;
        const dy = pointer.y - fcy;
        const dist = Math.hypot(dx, dy) || 1;
        const mag = clamp(dist / 140, 0, 1);
        gtx = (dx / dist) * mag;
        gty = (dy / dist) * mag;
        infTarget = 0.25 + 0.75 * (1 - clamp(dist / 900, 0, 1));
      } else if (m === "error") {
        gty = 0.6;
      } else {
        gtx = wander.x;
        gty = wander.y;
      }

      // Curiosity grows as the pointer approaches the Google button.
      let curious = 0;
      if (active && m !== "busy") {
        const ddx = Math.max(br.left - pointer.x, 0, pointer.x - br.right);
        const ddy = Math.max(br.top - pointer.y, 0, pointer.y - br.bottom);
        curious = smooth(clamp(1 - (Math.hypot(ddx, ddy) - 20) / 260, 0, 1));
      }
      const leanX = curious * clamp((br.left + br.width / 2 - fcx) / 160, -1, 1);

      // Expression targets: celebrate > calm (busy) > amazed > curious > mood.
      let eye = 1;
      let brow = 0;
      let tilt = 0;
      let open = 0;
      let smile = 0.55;
      let cheek = 0.15;
      let pupil = 1;
      let ear = 0;
      let crouch = 0;
      let wave = 0;
      let lidT = 0;
      let winkT = 0;
      let skewT = 0;

      if (m === "error") {
        eye = 1.05;
        brow = 0.35;
        tilt = 0.9;
        open = 0.1;
        smile = -0.55;
        cheek = 0;
        pupil = 0.95;
      } else if (m === "busy") {
        brow = 0.15;
        smile = 0.35;
        cheek = 0.1;
      }

      if (celebrating) {
        eye = 1.25;
        brow = 0.9;
        tilt = 0;
        open = 0.8;
        smile = 1;
        cheek = 1;
        pupil = 1.1;
        ear = 10;
      } else if (m === "greet") {
        eye = 1.15;
        brow = 0.6;
        open = 0.5;
        smile = 1;
        cheek = 0.8;
        pupil = 1.05;
        ear = 6;
        wave = 54 + 18 * Math.sin(now / 80);
      } else if (m === "welcome") {
        // Calm, friendly, looking straight at the visitor.
        eye = 1.1;
        brow = 0.3;
        open = 0.15;
        smile = 0.95;
        cheek = 0.6;
        ear = 4;
      } else if (m === "fly") {
        eye = 1.2;
        brow = 0.7;
        open = 0.35;
        smile = 0.9;
        cheek = 0.5;
        pupil = 1.05;
        ear = 14 + 10 * Math.sin(now / 70);
      } else if (m === "busy") {
        // calm while authentication proceeds
      } else if (hovering) {
        eye = 1.42;
        brow = 1;
        tilt = 0;
        open = 0.95;
        smile = 0.1;
        cheek = 0.2;
        pupil = 0.78;
        ear = 14;
        crouch = 3;
      } else if (actActive && act) {
        // Ambient expressions from the life controller (never over user input).
        switch (act.name) {
          case "surprised":
            eye = 1.5;
            brow = 1;
            open = 0.95;
            smile = 0.05;
            cheek = 0.1;
            pupil = 0.75;
            ear = 16;
            break;
          case "shocked":
            eye = 1.7;
            brow = 1;
            open = 1;
            smile = -0.1;
            cheek = 0;
            pupil = 0.55;
            ear = 20 + 6 * Math.sin(now / 45);
            break;
          case "curious":
            eye = 1.2;
            brow = 0.45;
            skewT = 1;
            open = 0.12;
            smile = 0.35;
            ear = 6;
            break;
          case "happy":
            eye = 1.1;
            brow = 0.5;
            open = 0.55;
            smile = 1;
            cheek = 1;
            ear = 10;
            break;
          case "thinking":
            brow = 0.2;
            skewT = 0.7;
            open = 0;
            smile = 0.1;
            break;
          case "sleepy":
            lidT = 0.65;
            brow = -0.25;
            open = 0.85;
            smile = 0;
            cheek = 0.3;
            break;
          case "playful":
            eye = 1.1;
            open = 0.3;
            smile = 1;
            cheek = 0.7;
            winkT = 1;
            ear = 8;
            break;
        }
      } else if (curious > 0.01) {
        eye = lerp(eye, 1.28, curious);
        brow = lerp(brow, 0.55, curious);
        tilt = lerp(tilt, 0, curious);
        open = lerp(open, 0.22, curious);
        smile = lerp(smile, 0.3, curious);
        pupil = lerp(pupil, 0.9, curious);
        ear = 8 * curious;
        crouch = 2.5 * curious;
      }

      S.gx.target = gtx;
      S.gy.target = gty;
      S.inf.target = infTarget;
      S.lean.target = hovering || celebrating ? leanX * 0.6 : leanX;
      S.eye.target = eye;
      S.brow.target = brow;
      S.tilt.target = tilt;
      S.open.target = open;
      S.smile.target = smile;
      S.cheek.target = cheek;
      S.pupil.target = pupil;
      S.ear.target = ear;
      S.wave.target = wave;
      S.lid.target = lidT;
      S.wink.target = winkT;
      S.skew.target = skewT;
      S.jump.target = crouch;

      if (reduced) {
        all.forEach((s) => s.snap());
      } else {
        // Sub-step so the stiffest springs stay stable.
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        for (let i = 0; i < steps; i++) all.forEach((s) => s.step(dt / steps));
      }

      render();

      const settled =
        all.every((s) => s.settled) &&
        !celebrating &&
        !intro &&
        !actActive &&
        !lookActive;
      if (!settled && !reduced) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    wakeRef.current = wake;

    // Real interface events ----------------------------------------------
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
      pointer.last = performance.now();
      wake();
    };
    const onLeaveWindow = () => {
      pointer.inside = false;
      wake();
    };
    const onEnterTarget = () => {
      if (moodRef.current === "busy") return;
      hovering = true;
      if (!reduced) {
        S.jump.kick(-150);
        S.ear.kick(320);
      }
      wake();
    };
    const onLeaveTarget = () => {
      hovering = false;
      wake();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as Element;
      if (el.matches?.(":focus-visible") && moodRef.current !== "busy") {
        hovering = true;
        if (!reduced) S.jump.kick(-120);
        wake();
      }
    };
    const onFocusOut = () => {
      hovering = target.matches(":hover");
      wake();
    };
    const onClick = () => {
      const now = performance.now();
      celebrateStart = now;
      celebrateUntil = now + 1500;
      secondJump = false;
      hovering = false;
      if (!reduced) {
        S.jump.kick(-300);
        S.ear.kick(420);
        setBurst((n) => n + 1);
      }
      wake();
    };
    const onLayout = () => wake();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeaveWindow);
    target.addEventListener("pointerenter", onEnterTarget);
    target.addEventListener("pointerleave", onLeaveTarget);
    target.addEventListener("focusin", onFocusIn);
    target.addEventListener("focusout", onFocusOut);
    target.addEventListener("click", onClick);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, { passive: true });
    const area = areaRef.current;
    area?.addEventListener("pointerleave", onLayout);

    // Idle life: occasional blinks and glances (not tied to anything else).
    const timers: number[] = [];
    let alive = true;
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const blinkOnce = (hold = 110) => {
      S.blink.target = 1;
      wake();
      later(() => {
        S.blink.target = 0;
        wake();
      }, hold);
    };
    // Blinks at varied intervals: quick, double, and the odd slow blink.
    const scheduleBlink = () => {
      later(() => {
        if (!alive) return;
        const roll = Math.random();
        if (roll < 0.14) {
          blinkOnce(280);
        } else {
          blinkOnce();
          if (roll < 0.34) later(() => blinkOnce(90), 240);
        }
        scheduleBlink();
      }, 1800 + Math.random() * 5200);
    };
    // Glances in varied directions, sometimes with a small head tilt.
    const scheduleGlance = () => {
      later(() => {
        if (!alive) return;
        const far = Math.random() < 0.3;
        wander = {
          x: (Math.random() - 0.5) * (far ? 2 : 1.2),
          y: (Math.random() - 0.5) * (far ? 1.4 : 0.8),
        };
        if (Math.random() < 0.4) {
          S.roll.target = (Math.random() - 0.5) * 8;
          later(() => {
            S.roll.target = 0;
            wake();
          }, 900 + Math.random() * 900);
        }
        wake();
        scheduleGlance();
      }, 1800 + Math.random() * 3200);
    };
    if (!reduced) {
      scheduleBlink();
      scheduleGlance();
    }

    // Controls for the life controller --------------------------------------
    const handle: MascotHandle = {
      express(name, ms) {
        if (reduced) return;
        act = { name, until: performance.now() + ms };
        if (name === "surprised" || name === "shocked") {
          S.jump.kick(name === "shocked" ? -190 : -130);
          S.ear.kick(name === "shocked" ? 420 : 280);
        } else if (name === "happy" || name === "playful") {
          S.jump.kick(-90);
        }
        wake();
        later(wake, ms + 40);
      },
      clearExpression() {
        act = null;
        wake();
      },
      lookAt(x, y, ms) {
        if (reduced) return;
        look = { x, y, until: performance.now() + ms };
        wake();
        later(wake, ms + 40);
      },
      clearLook() {
        look = null;
        wake();
      },
      tilt(deg, ms) {
        if (reduced) return;
        S.roll.target = deg;
        wake();
        later(() => {
          S.roll.target = 0;
          wake();
        }, ms);
      },
      sway(px, ms) {
        if (reduced) return;
        S.sway.target = px;
        wake();
        later(() => {
          S.sway.target = 0;
          wake();
        }, ms);
      },
      bounce(strength = 150) {
        if (reduced) return;
        S.jump.kick(-strength);
        wake();
      },
      stretch() {
        if (reduced) return;
        S.stretch.target = 0.1;
        wake();
        later(() => {
          S.stretch.target = 0;
          S.jump.kick(60);
          wake();
        }, 650);
      },
      wiggle() {
        if (reduced) return;
        S.ear.kick(520);
        later(() => S.ear.kick(-460), 180);
        later(() => S.ear.kick(380), 360);
        wake();
      },
    };
    if (controlRef) controlRef.current = handle;

    wake();

    return () => {
      alive = false;
      if (controlRef) controlRef.current = null;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      wakeRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.documentElement.removeEventListener(
        "pointerleave",
        onLeaveWindow,
      );
      target.removeEventListener("pointerenter", onEnterTarget);
      target.removeEventListener("pointerleave", onLeaveTarget);
      target.removeEventListener("focusin", onFocusIn);
      target.removeEventListener("focusout", onFocusOut);
      target.removeEventListener("click", onClick);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout);
      area?.removeEventListener("pointerleave", onLayout);
    };
  }, [reduced, targetRef, areaRef, character, controlRef]);

  // The celebration confetti clears itself.
  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(0), 1200);
    return () => window.clearTimeout(t);
  }, [burst]);

  const f = character.face;
  const p = character.palette;
  const hl = f.pupilR;

  const eye = (side: "l" | "r") => (
    <g
      data-part={`eye-${side}`}
      transform={`translate(${side === "l" ? f.eyeL.x : f.eyeR.x} ${side === "l" ? f.eyeL.y : f.eyeR.y})`}
    >
      <ellipse rx={f.eyeRx} ry={f.eyeRy} fill={p.eyeWhite} />
      <g data-part={`pupil-${side}`}>
        <circle r={f.pupilR} fill={p.pupil} />
        <circle cx={hl * 0.35} cy={-hl * 0.4} r={hl * 0.3} fill="#ffffff" />
      </g>
    </g>
  );

  const brow = (side: "l" | "r") => (
    <g
      data-part={`brow-${side}`}
      transform={`translate(${side === "l" ? f.eyeL.x : f.eyeR.x} ${f.browY})`}
    >
      <path
        d={`M ${-f.browHalf} 0 L ${f.browHalf} 0`}
        stroke={p.brow}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative select-none ${className}`}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 200 190"
        className="block h-auto w-full overflow-visible"
        focusable="false"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={character.gradient[0]} />
            <stop offset="1" stopColor={character.gradient[1]} />
          </linearGradient>
        </defs>

        <ellipse
          data-part="shadow"
          cx="100"
          cy="176"
          rx="50"
          ry="6.5"
          fill="#141414"
          opacity="0.14"
        />

        <g data-part="body">
          {character.back?.(gradientId)}
          <g className="pm-breathe">
            {character.body(gradientId)}

            <g data-part="face">
              {character.faceBack}
              <circle
                data-part="cheek-l"
                cx={f.cheekL.x}
                cy={f.cheekL.y}
                r={f.cheekR_}
                fill={p.cheek}
                opacity="0.08"
              />
              <circle
                data-part="cheek-r"
                cx={f.cheekR.x}
                cy={f.cheekR.y}
                r={f.cheekR_}
                fill={p.cheek}
                opacity="0.08"
              />
              {eye("l")}
              {eye("r")}
              {brow("l")}
              {brow("r")}
              <g transform={`translate(${f.mouth.x} ${f.mouth.y})`}>
                <path
                  data-part="mouth"
                  d="M -13 0 Q 0 9 13 0"
                  fill="none"
                  stroke={p.mouthStroke}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              {character.faceFront}
            </g>
          </g>
        </g>
      </svg>

      {burst > 0 && (
        <div key={burst} className="pm-burst">
          {BITS.map((bit, i) => (
            <span
              key={i}
              className="pm-bit"
              style={
                {
                  background: bit.color,
                  "--dx": `${bit.dx}px`,
                  "--dy": `${bit.dy}px`,
                  "--rot": `${bit.rot}deg`,
                  "--delay": `${bit.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
