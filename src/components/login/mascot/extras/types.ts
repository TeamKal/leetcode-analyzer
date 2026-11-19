import type { ComponentType } from "react";
import type { Character } from "../characters";

/** Extra expressions the rig can play when the module is provided. */
export type ExtraName =
  | "wink"
  | "shy"
  | "blush"
  | "heart"
  | "starry"
  | "giggle"
  | "dreamy";

/**
 * The face targets an expression asks for. `env` (0..1) is how strongly it is
 * applied right now: the rig blends each value in from whatever it currently
 * shows, so every expression eases in and out of the mascot's normal look.
 */
export type ExtraPose = {
  env: number;
  eye?: number;
  brow?: number;
  tilt?: number;
  open?: number;
  smile?: number;
  cheek?: number;
  pupil?: number;
  ear?: number;
  wave?: number;
  lid?: number;
  wink?: number;
  skew?: number;
  crouch?: number;
  /** Where the eyes and head look, -1..1 on each axis. */
  gx?: number;
  gy?: number;
  /** Body roll in degrees (before `env`). */
  roll?: number;
};

export type ExtraView = { name: ExtraName; key: number; ms: number };

export type OverlayProps = { view: ExtraView; face: Character["face"] };

export type MascotExtrasModule = {
  durations: Record<ExtraName, number>;
  poseFor(name: ExtraName, elapsedMs: number): ExtraPose | null;
  /** Drawn on the face (blush marks, sparkles). */
  FaceOverlay: ComponentType<OverlayProps>;
  /** Drawn above the body (the heart). */
  FloatOverlay: ComponentType<{ view: ExtraView }>;
};
