"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import "./effects.css";

const PULL = 0.14; // how far the child follows the pointer
const MAX = 5; // never more than this many pixels
const SPARKS = 9;

type Props = {
  children: ReactNode;
  className?: string;
  /** A short burst of small sparks from the point that was clicked. */
  spark?: boolean;
};

/**
 * A gentle magnetic pull: the child leans a few pixels toward the pointer while
 * it is near, and settles back when it leaves. Optionally throws a few sparks on
 * click. Mouse and pen only; touch and reduced motion get neither.
 */
export function Magnet({ children, className = "", spark = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState<{ id: number; x: number; y: number } | null>(
    null,
  );

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const clamp = (n: number) => Math.max(-MAX, Math.min(MAX, n));
    el.style.setProperty("--mx", `${clamp(dx * PULL)}px`);
    el.style.setProperty("--my", `${clamp(dy * PULL * 1.4)}px`);
  }

  function leave() {
    ref.current?.style.setProperty("--mx", "0px");
    ref.current?.style.setProperty("--my", "0px");
  }

  function click(event: React.MouseEvent<HTMLDivElement>) {
    if (!spark) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setBurst({
      id: Date.now(),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  return (
    <div
      ref={ref}
      className={`mg ${className}`}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={click}
    >
      <div className="mg-inner">{children}</div>
      {burst && (
        <span
          key={burst.id}
          className="mg-sparks"
          style={{ left: burst.x, top: burst.y }}
          aria-hidden="true"
          onAnimationEnd={() => setBurst(null)}
        >
          {Array.from({ length: SPARKS }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--a": `${(360 / SPARKS) * i + (i % 2 ? 12 : -6)}deg`,
                  "--d": `${18 + (i % 3) * 8}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      )}
    </div>
  );
}
