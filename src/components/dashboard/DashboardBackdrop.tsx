"use client";

import { useEffect, useRef } from "react";
import "./effects.css";

/**
 * The dashboard's background: three slow, soft colour fields (lilac, violet and
 * rose, the sign-in palette) and a faint grid of dots that lights up in a soft
 * circle around the pointer. It sits behind everything, never takes clicks, stops
 * moving when the tab is hidden, and is still for people who prefer less motion.
 * Touch screens get the colour fields only.
 */
export function DashboardBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      root.style.setProperty("--px", `${x}px`);
      root.style.setProperty("--py", `${y}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      root.dataset.near = "true";
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      root.dataset.near = "false";
    };
    const onVisibility = () => {
      root.dataset.paused = document.hidden ? "true" : "false";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div ref={ref} className="bd" data-near="false" data-paused="false" aria-hidden="true">
      <span className="bd-field bd-lilac" />
      <span className="bd-field bd-violet" />
      <span className="bd-field bd-rose" />
      <span className="bd-dots" />
      <span className="bd-dots bd-dots-glow" />
    </div>
  );
}
