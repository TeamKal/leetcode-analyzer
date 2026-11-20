import type { MascotExpression } from "@/components/login/mascot/AuthMascot";

/**
 * The whole sequence on the AUDIO clock (milliseconds since the audio started,
 * which is the moment of the 10th click). Change a number here and the whole
 * sequence follows.
 */
export const BLAST_CONFIG = {
  /** Total clicks on the mascot that start the sequence. */
  clicksToStart: 10,
  audioSrc: "/c4-audio.mp3",
  /** A glTF/GLB model of the explosive (for example "/models/c4.glb"). Null uses the built-in one. */
  c4ModelUrl: null as string | null,

  // --- 0:00 to 0:07: planting -------------------------------------------------
  /** The mascot turns evil, then starts moving. */
  beginMs: 300,
  /** The last planting ends and the return to the centre begins. */
  returnStartMs: 5700,
  /** The mascot is in the middle of the screen, still, from here. */
  centredMs: 7000,
  centreScale: 1.6,
  /** The page is rasterised (for the shatter) just after it settles. */
  captureAtMs: 7100,

  // --- 0:08 to 0:19: the dialogue (the audio itself) ---------------------------
  // Measured from the supplied audio: a loud build-up ends at 8.0 s, the voice
  // runs from about 8.25 s to 19.45 s, then a short silence, and the explosion
  // lands at about 20.1 s.
  dialogueStartMs: 8000,
  dialogueEndMs: 19500,
  /** The mouth follows the audio only between these (the build-up is not speech). */
  speechStartMs: 8200,
  speechEndMs: 19500,

  // --- after the dialogue: exit and detonation ---------------------------------
  /** A last gesture, then the mascot leaves the screen. */
  finalGestureMs: 19450,
  exitStartMs: 19650,
  exitEndMs: 20050,
  /** The first charge goes off (the explosion in the audio). */
  detonateMs: 20100,
  /** The next charge goes off this long after the one before. */
  chainMs: 150,

  /** Safety net: the whole thing always ends (milliseconds on the audio clock). */
  maxMs: 60000,
} as const;

/** Expressions during the dialogue, on the audio clock. */
export const DIALOGUE_EXPRESSIONS: Array<{ at: number; expression: MascotExpression }> = [
  { at: 8000, expression: "evil" },
  { at: 11800, expression: "playful" },
  { at: 14200, expression: "evil" },
  { at: 17000, expression: "playful" },
  { at: 18400, expression: "evil" },
];
