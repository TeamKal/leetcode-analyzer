/**
 * DOM helpers for the login-page product demo. Pure browser code, no React.
 * Positions are always measured live from the target element, so the cursor
 * stays accurate when the layout resizes or wraps.
 */

export type Point = { x: number; y: number };

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * A point inside `target`, in the stage's own pixels. It is computed from layout
 * offsets, not on-screen rectangles, so it stays exact even when the demo is
 * scaled to fit the screen or tilted in 3D.
 */
export function pointIn(
  stage: HTMLElement,
  target: Element,
  anchorX = 0.5,
  anchorY = 0.5,
): Point {
  if (target instanceof HTMLElement) {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = target;
    while (node && node !== stage) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    if (node === stage) {
      return {
        x: x + target.offsetWidth * anchorX,
        y: y + target.offsetHeight * anchorY,
      };
    }
  }
  // Fallback: on-screen rectangles (only exact for an untransformed stage).
  const s = stage.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  return {
    x: r.left - s.left + r.width * anchorX,
    y: r.top - s.top + r.height * anchorY,
  };
}

export const travelMs = (from: Point, to: Point) =>
  clamp(380 + Math.hypot(to.x - from.x, to.y - from.y) * 0.9, 480, 1150);

/**
 * Moves `el` from `from` to `to` along a gentle arc (a sampled quadratic
 * curve) with ease-in-out timing, so the path never looks like it runs on rails.
 */
export function travel(
  el: HTMLElement,
  from: Point,
  to: Point,
  ms: number,
  bendSign: 1 | -1,
): Animation {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = Math.min(70, dist * 0.14) * bendSign;
  const control: Point = {
    x: from.x + dx / 2 + (-dy / dist) * bend * 2,
    y: from.y + dy / 2 + (dx / dist) * bend * 2,
  };

  const frames: Keyframe[] = [];
  const samples = 12;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
    frames.push({ transform: `translate(${x}px, ${y}px)` });
  }

  return el.animate(frames, {
    duration: ms,
    easing: "cubic-bezier(0.45, 0.05, 0.25, 1)",
    fill: "forwards",
  });
}

/** Parks the element at `to` and drops the finished animation. */
export function commit(el: HTMLElement, anim: Animation, to: Point) {
  el.style.transform = `translate(${to.x}px, ${to.y}px)`;
  anim.cancel();
}

/** One-shot expanding ring where the cursor clicked. */
export function ripple(stage: HTMLElement, at: Point) {
  const ring = document.createElement("span");
  ring.className = "pd-ripple";
  ring.style.left = `${at.x}px`;
  ring.style.top = `${at.y}px`;
  stage.appendChild(ring);
  ring.addEventListener("animationend", () => ring.remove(), { once: true });
  window.setTimeout(() => ring.remove(), 900);
}

/** Quick squeeze of the cursor arrow while it clicks. */
export function press(cursor: HTMLElement) {
  const arrow = cursor.firstElementChild as HTMLElement | null;
  arrow?.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.8)", offset: 0.4 },
      { transform: "scale(1)" },
    ],
    { duration: 260, easing: "ease-out" },
  );
}
