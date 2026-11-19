import type { ExtraName, ExtraPose } from "./types";

/**
 * Each expression is a pure function of time: given how long it has been
 * playing, it returns the face targets for that moment. The rig's springs do the
 * smoothing, so these only describe the shape of each expression (when it eases
 * in, what it holds, when it lets go). No state, nothing to clean up.
 */

export const EXTRA_DURATION: Record<ExtraName, number> = {
  wink: 1000,
  shy: 2200,
  blush: 1800,
  heart: 1600,
  starry: 1600,
  giggle: 1500,
  dreamy: 2200,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** 0 before `a`, 1 after `b`, eased between. */
const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** Eases in over `inMs`, holds, and eases out over the last `outMs`. */
const envelope = (t: number, d: number, inMs: number, outMs: number) =>
  ramp(t, 0, inMs) * (1 - ramp(t, d - outMs, d));

export function poseFor(name: ExtraName, t: number): ExtraPose | null {
  const d = EXTRA_DURATION[name];
  if (!(t >= 0) || t > d) return null;

  switch (name) {
    case "wink": {
      // A quick, warm wink with a little head tilt and a smile.
      const env = envelope(t, d, 160, 280);
      const closed = ramp(t, 170, 280) * (1 - ramp(t, 600, 760));
      return {
        env,
        eye: 1.05,
        brow: 0.35,
        skew: 0.5,
        open: 0.25,
        smile: 1,
        cheek: 0.75,
        ear: 8,
        wink: closed,
        roll: -6,
        gx: 0,
        gy: 0,
      };
    }
    case "shy": {
      // Looks away and down, cheeks warm up, then peeks back for a moment.
      const env = envelope(t, d, 250, 450);
      const away = ramp(t, 0, 300) * (1 - ramp(t, 1250, 1600) * 0.85);
      const peek = ramp(t, 1300, 1600) * (1 - ramp(t, 1700, 2050));
      return {
        env,
        eye: 0.97,
        brow: 0.4,
        tilt: 0.55,
        open: 0,
        smile: 0.35,
        cheek: 1,
        lid: 0.35,
        roll: 6,
        crouch: 1.5,
        gx: -0.9 * away + 0.3 * peek,
        gy: 0.4 * away - 0.05 * peek,
      };
    }
    case "blush": {
      // Embarrassed: eyes down and to the side, a small smile, red cheeks.
      const env = envelope(t, d, 240, 500);
      return {
        env,
        eye: 0.97,
        brow: 0.3,
        tilt: 0.3,
        open: 0.05,
        smile: 0.7,
        cheek: 1,
        lid: 0.25,
        roll: 4,
        crouch: 1.5,
        gx: -0.35,
        gy: 0.55,
      };
    }
    case "heart": {
      // Both arms reach up; the right one traces a heart quickly while it looks up at it.
      const env = envelope(t, d, 140, 380);
      const tracing = ramp(t, 120, 220) * (1 - ramp(t, 760, 860));
      const phase = ((t - 120) / 680) * Math.PI * 2;
      return {
        env,
        eye: 1.1,
        brow: 0.5,
        open: 0.45,
        smile: 1,
        cheek: 1,
        lid: 0.2,
        ear: 18,
        wave: 34 * Math.sin(phase) * tracing,
        roll: 3,
        gx: 0,
        gy: -0.35,
      };
    }
    case "starry": {
      // Wide, glossy eyes: the "oh, that's lovely" look.
      const env = envelope(t, d, 200, 450);
      return {
        env,
        eye: 1.3,
        pupil: 1.3,
        brow: 0.7,
        open: 0.3,
        smile: 0.85,
        cheek: 0.85,
        ear: 10,
        roll: 4 * Math.sin(t / 420),
        gx: 0,
        gy: -0.1,
      };
    }
    case "giggle": {
      // Squinty happy eyes, a bouncing laugh.
      const env = envelope(t, d, 140, 350);
      return {
        env,
        lid: 0.55,
        smile: 1,
        open: 0.6 + 0.2 * Math.sin(t / 70),
        cheek: 1,
        brow: 0.3,
        ear: 6 + 8 * Math.sin(t / 90),
        roll: 5 * Math.sin(t / 110),
        crouch: -4 * Math.max(0, Math.sin(t / 120)),
        gx: 0,
        gy: 0,
      };
    }
    case "dreamy": {
      // Drifting off: heavy lids, a soft smile, a slow sway.
      const env = envelope(t, d, 350, 600);
      return {
        env,
        lid: 0.55,
        smile: 0.75,
        open: 0,
        cheek: 0.6,
        brow: 0.1,
        roll: 5 * Math.sin(t / 600),
        gx: 0.25 * Math.sin(t / 700),
        gy: -0.15,
      };
    }
  }
}
