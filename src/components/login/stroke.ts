/**
 * Maths for the stroke title. Pure functions, no imports and no DOM, so the
 * sizing and timing can be tested and the component only has to render.
 *
 * The title is outlined text. On load each letter's outline draws itself in
 * (left to right, slightly staggered); then colour floods into the letters from
 * left to right, just behind the outline. After that it stays exactly as it is.
 */

export const STROKE = {
  /** How long one letter takes to draw. */
  drawMs: 1500,
  /** Delay between one letter starting and the next. */
  staggerMs: 85,
  /**
   * The fill starts once the first letter's outline is complete (it must never
   * be ahead of the outline) and sweeps across over `fillSweepMs`. These two
   * numbers are repeated in stroke.css (`st-wipe`); keep them in step.
   */
  fillDelayMs: 1500,
  fillSweepMs: 1600,
} as const;

/** Start delay of letter `index`. */
export const letterDelay = (index: number) => index * STROKE.staggerMs;

/** When the last letter has finished drawing. */
export const strokeTotalMs = (letterCount: number) =>
  letterDelay(Math.max(0, letterCount - 1)) + STROKE.drawMs;

/** When the fill has finished sweeping across: the whole entrance is done. */
export const titleTotalMs = (letterCount: number) =>
  Math.max(strokeTotalMs(letterCount), STROKE.fillDelayMs + STROKE.fillSweepMs);

/**
 * The largest font size that fits the box: limited by the box height, and by
 * the box width given how wide the text is per 1em of font size.
 */
export function fitFontSize(
  boxWidth: number,
  boxHeight: number,
  widthPerEm: number,
  { heightShare = 0.8, widthShare = 0.97, min = 24 } = {},
) {
  const byHeight = boxHeight * heightShare;
  const byWidth = (boxWidth * widthShare) / Math.max(0.1, widthPerEm);
  return Math.floor(Math.max(min, Math.min(byHeight, byWidth)));
}

/**
 * The baseline that centres the letters' ink vertically in the box, given how
 * far the ink rises above and falls below the baseline.
 */
export function centredBaseline(boxHeight: number, ascent: number, descent: number) {
  return boxHeight / 2 + (ascent - descent) / 2;
}

/**
 * A thin stroke: about 1px at the title's usual size, growing very slightly with
 * the type, and never below 1px so it stays visible.
 */
export const strokeWidthFor = (fontPx: number) => Math.max(1, fontPx * 0.009);

/** Spaces become non-breaking so a letter-by-letter layout keeps them. */
export const toGlyphs = (text: string) =>
  Array.from(text).map((char) => (char === " " ? " " : char));
