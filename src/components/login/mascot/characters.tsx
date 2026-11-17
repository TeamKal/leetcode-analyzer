import type { ReactNode } from "react";

/**
 * Character design for the sign-in mascot (Wisp, a friendly ghost). Characters
 * share one animated face rig (eyes, pupils, brows, mouth, cheeks, ears), so a
 * new design only needs silhouette, palette and face layout. Drawn on a
 * 200 x 190 canvas standing on y = 168.
 */

export type Pt = { x: number; y: number };

export type Character = {
  id: string;
  name: string;
  note: string;
  /** Body gradient, top to bottom. */
  gradient: [string, string];
  palette: {
    eyeWhite: string;
    pupil: string;
    brow: string;
    mouthStroke: string;
    mouthFill: string;
    cheek: string;
  };
  face: {
    eyeL: Pt;
    eyeR: Pt;
    eyeRx: number;
    eyeRy: number;
    pupilR: number;
    browY: number;
    browHalf: number;
    mouth: Pt;
    cheekL: Pt;
    cheekR: Pt;
    cheekR_: number;
    /** 0..1: how much of the "wide eyes" expression this character shows. */
    eyeBoost?: number;
  };
  /** Pivots for the two wiggling parts (ears, arms, leaves). */
  earPivot?: { l: Pt; r: Pt };
  /** Drawn behind the body. Wiggling parts use data-part="ear-l" / "ear-r". */
  back?: (g: string) => ReactNode;
  /** The body itself. */
  body: (g: string) => ReactNode;
  /** Drawn on the face before the eyes (muzzle, facial discs). */
  faceBack?: ReactNode;
  /** Drawn on the face after the mouth (nose, beak, whiskers). */
  faceFront?: ReactNode;
};

const fill = (g: string) => `url(#${g})`;

/* 3. Wisp: a friendly little ghost. */
const wisp: Character = {
  id: "wisp",
  name: "Wisp",
  note: "A periwinkle ghost with a wavy hem. Calm and a bit shy.",
  gradient: ["#dcd9ff", "#9a93ef"],
  palette: {
    eyeWhite: "#ffffff",
    pupil: "#1d1850",
    brow: "#3b3290",
    mouthStroke: "#2d2670",
    mouthFill: "#2d2670",
    cheek: "#ff9fc3",
  },
  face: {
    eyeL: { x: 82, y: 94 },
    eyeR: { x: 118, y: 94 },
    eyeRx: 11,
    eyeRy: 14,
    pupilR: 6,
    browY: 72,
    browHalf: 9,
    mouth: { x: 100, y: 120 },
    cheekL: { x: 64, y: 114 },
    cheekR: { x: 136, y: 114 },
    cheekR_: 7.5,
    eyeBoost: 0.85,
  },
  earPivot: { l: { x: 46, y: 118 }, r: { x: 154, y: 118 } },
  back: () => (
    <>
      <g data-part="ear-l">
        <ellipse cx="34" cy="122" rx="15.5" ry="9.5" fill="#a39cf2" />
      </g>
      <g data-part="ear-r">
        <ellipse cx="166" cy="122" rx="15.5" ry="9.5" fill="#a39cf2" />
      </g>
    </>
  ),
  body: (g) => (
    <>
      <path
        d="M 44 166 L 44 92 A 56 56 0 0 1 156 92 L 156 166 Q 147 180 138 166 Q 129 154 120 166 Q 111 180 102 166 Q 93 154 84 166 Q 75 180 66 166 Q 57 154 48 166 Q 46 168 44 166 Z"
        fill={fill(g)}
      />
      <path
        d="M 60 70 Q 66 54 84 50"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.5"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </>
  ),
};

export const DEFAULT_CHARACTER = wisp;
