/** Pure geometry for the mascot's tour of the page. No imports, so it is testable. */

export type Box = { left: number; top: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where a charge goes: on the bottom edge of a section (viewport coordinates). */
export function chargePoint(box: Box, viewportWidth: number, fraction = 0.82, inset = 10) {
  return {
    x: clamp(box.left + box.width * fraction, 18, Math.max(18, viewportWidth - 18)),
    y: box.top + box.height - inset,
  };
}

/** Where the mascot's centre stands while planting: beside and above the charge. */
export function standPoint(
  charge: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  size: number,
) {
  const half = size / 2 + 8;
  let x = charge.x - size * 0.7;
  if (x < half) x = charge.x + size * 0.7;
  return {
    x: clamp(x, half, Math.max(half, viewportWidth - half)),
    y: clamp(charge.y - size * 0.45, half, Math.max(half, viewportHeight - half)),
  };
}

/**
 * The scroll position that brings a section's bottom edge comfortably into view.
 * Unchanged when it already is.
 */
export function scrollTargetFor(
  box: Box,
  scrollY: number,
  viewportHeight: number,
  maxScroll: number,
) {
  const bottom = box.top + box.height;
  if (bottom > viewportHeight * 0.12 && bottom < viewportHeight * 0.85) return scrollY;
  return clamp(scrollY + bottom - viewportHeight * 0.6, 0, Math.max(0, maxScroll));
}


export type PlanSection = {
  /** Page coordinates (top is from the top of the document), or viewport ones when `fixed`. */
  box: Box;
  fixed: boolean;
};

export type PlanInput = {
  sections: PlanSection[];
  vw: number;
  vh: number;
  /** The most the page can scroll. */
  maxScroll: number;
  startScroll: number;
  /** The mascot's resting centre (viewport) and its width. */
  rest: { x: number; y: number };
  size: number;
  /** When the tour starts moving, when the last stop ends, and when it must be centred. */
  beginMs: number;
  returnStartMs: number;
  centredMs: number;
  centreScale: number;
  /** Fraction of a stop's slot spent travelling; the rest is planting. */
  travelShare?: number;
  /** Fraction of the planting time at which the charge is dropped. */
  dropShare?: number;
};

export type Stop = {
  index: number;
  fixed: boolean;
  travelStart: number;
  arriveMs: number;
  dropMs: number;
  departMs: number;
  scrollY: number;
  /** Where the mascot's centre stands (viewport) once it has scrolled there. */
  stand: { x: number; y: number };
  /** The charge: page coordinates, or viewport ones when `fixed`. */
  charge: { x: number; y: number };
};

export type Plan = {
  stops: Stop[];
  returnStartMs: number;
  centredMs: number;
  centre: { x: number; y: number; s: number };
  finalScroll: number;
  from: { x: number; y: number; scrollY: number };
};

const ease = (t: number) => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The scroll position, out of those that keep a charge comfortably in view,
 * that shows the most of the given page positions. Ties go to the one closest
 * to `prefer`.
 */
export function bestScroll(
  pageYs: number[],
  vh: number,
  maxScroll: number,
  prefer: number,
  margin = 70,
) {
  if (pageYs.length === 0) return clamp(prefer, 0, Math.max(0, maxScroll));
  let best = clamp(prefer, 0, Math.max(0, maxScroll));
  let bestCount = -1;
  for (let s = 0; s <= Math.max(0, maxScroll); s += 10) {
    const count = pageYs.filter((y) => y >= s + margin && y <= s + vh - margin).length;
    if (count > bestCount || (count === bestCount && Math.abs(s - prefer) < Math.abs(best - prefer))) {
      best = s;
      bestCount = count;
    }
  }
  return best;
}

export function planRoute(input: PlanInput): Plan {
  const {
    sections,
    vw,
    vh,
    maxScroll,
    startScroll,
    rest,
    size,
    beginMs,
    returnStartMs,
    centredMs,
    centreScale,
    travelShare = 0.58,
    dropShare = 0.4,
  } = input;

  const slot = sections.length ? (returnStartMs - beginMs) / sections.length : 0;
  const stops: Stop[] = [];
  let scroll = startScroll;

  // Spread the charges across the width, so the blasts are not all on one side.
  const fractions = [0.8, 0.22, 0.84, 0.16, 0.78];
  sections.forEach((section, index) => {
    const fraction = fractions[index % fractions.length];
    const travelStart = beginMs + index * slot;
    const arriveMs = travelStart + slot * travelShare;
    const departMs = travelStart + slot;
    const dropMs = arriveMs + (departMs - arriveMs) * dropShare;

    let scrollY = scroll;
    let charge: { x: number; y: number };
    let chargeView: { x: number; y: number };
    if (section.fixed) {
      // A fixed bar is always where it is on screen; its charge never scrolls.
      charge = chargePoint(section.box, vw, fraction);
      chargeView = charge;
    } else {
      const viewBox = { ...section.box, top: section.box.top - scroll };
      scrollY = scrollTargetFor(viewBox, scroll, vh, maxScroll);
      const p = chargePoint({ ...section.box, top: section.box.top }, vw, fraction);
      charge = { x: p.x, y: p.y };
      chargeView = { x: p.x, y: p.y - scrollY };
    }
    stops.push({
      index,
      fixed: section.fixed,
      travelStart,
      arriveMs,
      dropMs,
      departMs,
      scrollY,
      stand: standPoint(chargeView, vw, vh, size),
      charge,
    });
    scroll = scrollY;
  });

  const pageCharges = stops.filter((s) => !s.fixed).map((s) => s.charge.y);
  return {
    stops,
    returnStartMs,
    centredMs,
    centre: { x: vw / 2, y: vh / 2, s: centreScale },
    finalScroll: bestScroll(pageCharges, vh, maxScroll, scroll),
    from: { x: rest.x, y: rest.y, scrollY: startScroll },
  };
}

export type Sample = {
  x: number;
  y: number;
  s: number;
  scrollY: number;
  /** Index of the stop being travelled to or planted at, or -1. */
  stop: number;
};

/** Where the mascot is and where the page is scrolled at time `t` (milliseconds). */
export function sampleRoute(plan: Plan, t: number): Sample {
  let x = plan.from.x;
  let y = plan.from.y;
  let s = 1;
  let scrollY = plan.from.scrollY;
  let stop = -1;

  const leg = (
    a: { x: number; y: number; s: number; scrollY: number },
    b: { x: number; y: number; s: number; scrollY: number },
    k: number,
  ) => {
    const e = ease(k);
    // A small hop mid-flight so it is not a flat slide.
    const hop = Math.sin(Math.PI * e) * -22;
    x = lerp(a.x, b.x, e);
    y = lerp(a.y, b.y, e) + hop;
    s = lerp(a.s, b.s, e);
    scrollY = lerp(a.scrollY, b.scrollY, e);
  };

  let prev = { x: plan.from.x, y: plan.from.y, s: 1, scrollY: plan.from.scrollY };
  for (const st of plan.stops) {
    const here = { x: st.stand.x, y: st.stand.y, s: 1, scrollY: st.scrollY };
    if (t < st.travelStart) break;
    if (t < st.arriveMs) {
      leg(prev, here, (t - st.travelStart) / (st.arriveMs - st.travelStart));
      stop = st.index;
      return { x, y, s, scrollY, stop };
    }
    x = here.x;
    y = here.y;
    s = 1;
    scrollY = here.scrollY;
    if (t < st.departMs) stop = st.index;
    prev = here;
  }

  const end = { x: plan.centre.x, y: plan.centre.y, s: plan.centre.s, scrollY: plan.finalScroll };
  if (t >= plan.returnStartMs) {
    leg(prev, end, (t - plan.returnStartMs) / (plan.centredMs - plan.returnStartMs));
    stop = -1;
    if (t >= plan.centredMs) {
      x = end.x;
      y = end.y;
      s = end.s;
      scrollY = end.scrollY;
    }
  }
  return { x, y, s, scrollY, stop };
}
