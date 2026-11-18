"use client";

import { useEffect, useRef, useState } from "react";
import {
  centredBaseline,
  fitFontSize,
  letterDelay,
  TITLE_TRIM_PX,
  strokeWidthFor,
  titleTotalMs,
  toGlyphs,
} from "./stroke";
import { useReducedMotion } from "./useReducedMotion";
import "./stroke.css";

type Props = {
  text: string;
  /** Wait for this (for example the welcome intro) before the outline draws in. */
  start: boolean;
  className?: string;
};

type Size = { width: number; height: number; fontPx: number; baseline: number };

// Flat colours, no gradients: a white fill and a thin purple stroke. The purple
// is the sign-in panel's violet (the corner wave and the mascot).
const FILL_COLOR = "#ffffff";
const STROKE_COLOR = "#a999e8";

/**
 * The product title as outlined text. Each letter's thin purple outline draws
 * itself in once, then white colour floods into the letters, and the title stays
 * exactly as it is: there is no second version of the text to switch to and
 * nothing keeps moving. Plain SVG text, no dependency. Centred in its box. Sized
 * from the box, with a fixed height, so nothing shifts while it draws.
 */
export function StrokeTitle({ text, start, className = "" }: Props) {
  const reduced = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const measure = () => {
      const { width, height } = box.getBoundingClientRect();
      if (!width || !height) return;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      const style = getComputedStyle(box);
      const spacingEm = -0.02;

      // Measure at a reference size to learn the text's width and ink height.
      const reference = 100;
      ctx.font = `700 ${reference}px ${style.fontFamily}`;
      ctx.letterSpacing = `${spacingEm * reference}px`;
      const widthPerEm = ctx.measureText(text).width / reference;

      const fontPx = fitFontSize(width, height, widthPerEm, { trim: TITLE_TRIM_PX });
      ctx.font = `700 ${fontPx}px ${style.fontFamily}`;
      ctx.letterSpacing = `${spacingEm * fontPx}px`;
      const metrics = ctx.measureText(text);
      const baseline = centredBaseline(
        height,
        metrics.actualBoundingBoxAscent,
        metrics.actualBoundingBoxDescent,
      );

      setSize((current) =>
        current &&
        current.width === width &&
        current.height === height &&
        current.fontPx === fontPx
          ? current
          : { width, height, fontPx, baseline },
      );
    };

    // Measure right away (with whatever font is there), again as soon as the
    // title font has really loaded, and on every resize.
    measure();
    const family = getComputedStyle(box).fontFamily;
    document.fonts?.load(`700 64px ${family}`, text).then(measure, measure);
    document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  const glyphs = toGlyphs(text);
  const drawing = start && !reduced;

  // Replay: pointing at the title draws the outline in again, but only once the
  // current drawing has finished (so it never restarts mid-way or loops).
  const [runKey, setRunKey] = useState(0);
  const busyRef = useRef(false);
  const busyTimer = useRef(0);
  const markBusy = () => {
    busyRef.current = true;
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => {
      busyRef.current = false;
    }, titleTotalMs(glyphs.length) + 200);
  };
  useEffect(() => {
    if (!drawing) return;
    markBusy();
    return () => window.clearTimeout(busyTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);
  const replay = () => {
    if (!drawing || busyRef.current) return;
    markBusy();
    setRunKey((key) => key + 1);
  };

  return (
    <div
      ref={boxRef}
      className={`st ${className}`}
      data-state={reduced ? "static" : start ? "drawing" : "waiting"}
      aria-hidden="true"
      onPointerEnter={replay}
    >
      {size && (
        <svg
          className="st-svg"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          {/* Layer 1: the fill, wiped in from the left behind the outline. It
              uses the same letter-by-letter structure as the outline so the two
              line up exactly. */}
          <text
            key={`fill-${runKey}`}
            x={size.width / 2}
            y={size.baseline}
            textAnchor="middle"
            className="st-fill"
            style={{
              fontSize: size.fontPx,
              letterSpacing: `${-0.02 * size.fontPx}px`,
              fill: FILL_COLOR,
            }}
          >
            {glyphs.map((glyph, index) => (
              <tspan key={index}>{glyph}</tspan>
            ))}
          </text>
          {/* Layer 2: the outline, drawn in letter by letter. */}
          <text
            x={size.width / 2}
            y={size.baseline}
            textAnchor="middle"
            className="st-text"
            style={{
              fontSize: size.fontPx,
              letterSpacing: `${-0.02 * size.fontPx}px`,
              strokeWidth: strokeWidthFor(size.fontPx),
              stroke: STROKE_COLOR,
            }}
          >
            {glyphs.map((glyph, index) => (
              <tspan
                key={`${runKey}-${index}`}
                className="st-letter"
                style={drawing ? { animationDelay: `${letterDelay(index)}ms` } : undefined}
              >
                {glyph}
              </tspan>
            ))}
          </text>
        </svg>
      )}
    </div>
  );
}
