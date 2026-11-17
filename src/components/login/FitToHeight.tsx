"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shrinks its content (never enlarges it) so it fits the space this box has
 * been given, on screens wide enough for the side-by-side layout. The page then
 * never needs to scroll. The content keeps its design: it is scaled, not
 * rearranged, and its width is widened by the same factor so it still fills the
 * column. Below the md breakpoint the layout is a normal scrolling stack, so no
 * scaling is applied.
 */
export function FitToHeight({
  children,
  minScale = 0.55,
}: {
  children: ReactNode;
  minScale?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, offset: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const update = () => {
      if (!window.matchMedia("(min-width: 768px)").matches) {
        setFit((f) => (f.scale === 1 && f.offset === 0 ? f : { scale: 1, offset: 0 }));
        return;
      }
      const available = box.clientHeight;
      // Unscaled height of the content at its current (widened) width.
      const natural = inner.offsetHeight;
      if (!available || !natural) return;
      const scale = Math.max(minScale, Math.min(1, available / natural));
      const offset = Math.max(0, (available - natural * scale) / 2);
      setFit((f) =>
        Math.abs(f.scale - scale) < 0.002 && Math.abs(f.offset - offset) < 0.5
          ? f
          : { scale, offset },
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    observer.observe(inner);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [minScale]);

  return (
    <div ref={boxRef} className="relative min-h-0 w-full flex-1">
      <div
        ref={innerRef}
        style={{
          width: `${100 / fit.scale}%`,
          transform: `scale(${fit.scale})`,
          transformOrigin: "top left",
          marginTop: fit.offset,
        }}
      >
        {children}
      </div>
    </div>
  );
}
