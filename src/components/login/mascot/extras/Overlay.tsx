import type { CSSProperties } from "react";
import type { OverlayProps, ExtraView } from "./types";

const BLUSHING = new Set(["shy", "blush", "heart", "giggle", "dreamy"]);
const SPARKLING = new Set(["starry", "wink", "dreamy"]);

/** A four-point sparkle centred on 0,0. */
const SPARKLE = "M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z";

/** Marks on the face itself: deeper blush and little sparkles. */
export function FaceOverlay({ view, face }: OverlayProps) {
  const style = { "--ms": `${view.ms}ms` } as CSSProperties;
  const deep = view.name === "shy" || view.name === "blush";
  return (
    <g key={view.key} style={style} className="mx-face">
      {BLUSHING.has(view.name) && (
        <>
          {[face.cheekL, face.cheekR].map((c, i) => (
            <g key={i} className="mx-blush" data-deep={deep ? "1" : "0"}>
              <ellipse cx={c.x} cy={c.y} rx={face.cheekR_ * 1.5} ry={face.cheekR_ * 0.9} fill="#ff6fa3" />
              {[-1, 0, 1].map((k) => (
                <path
                  key={k}
                  d={`M ${c.x + k * 5 - 1.6} ${c.y + 4} l 3.2 -7`}
                  stroke="#ff4f8b"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </g>
          ))}
        </>
      )}
      {SPARKLING.has(view.name) && (
        <>
          <path
            className="mx-spark"
            d={SPARKLE}
            fill="#ffffff"
            transform={`translate(${face.eyeR.x + 20} ${face.eyeR.y - 22})`}
          />
          <path
            className="mx-spark mx-spark-b"
            d={SPARKLE}
            fill="#ffffff"
            transform={`translate(${face.eyeL.x - 20} ${face.eyeL.y - 16}) scale(0.7)`}
          />
        </>
      )}
    </g>
  );
}

/** Things that float above the body: the heart that gets drawn in the air. */
export function FloatOverlay({ view }: { view: ExtraView }) {
  if (view.name !== "heart") return null;
  const style = { "--ms": `${view.ms}ms` } as CSSProperties;
  return (
    <g key={view.key} style={style} className="mx-heart" transform="translate(100 -4)">
      <path
        className="mx-heart-fill"
        d="M 0 26 C -34 4 -18 -16 0 -2 C 18 -16 34 4 0 26 Z"
        fill="#ff8f8a"
      />
      <path
        className="mx-heart-line"
        pathLength={1}
        d="M 0 26 C -34 4 -18 -16 0 -2 C 18 -16 34 4 0 26 Z"
        fill="none"
        stroke="#ef3837"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
