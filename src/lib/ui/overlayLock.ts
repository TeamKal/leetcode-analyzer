/**
 * Small pure helpers for a full-screen overlay that must not be interacted with
 * (the success video). No imports, so they can be tested directly.
 */

/**
 * Whether a key press should be swallowed while the overlay is up. Plain keys
 * (typing, Tab, Enter, Space, Escape, arrows) are blocked. Browser shortcuts
 * (anything with Ctrl, Cmd or Alt) and the function keys are left alone, so
 * the person can still reload, close the tab or open dev tools.
 */
export function shouldBlockKey(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (/^F\d{1,2}$/.test(event.key)) return false;
  return true;
}

/**
 * Whether the four corners of a frame (RGBA pixels, row by row) are fully
 * transparent. A browser that cannot show a video's transparency draws it on
 * an opaque (usually black) background, which is how this tells them apart.
 */
export function cornersAreTransparent(
  data: ArrayLike<number>,
  width: number,
  height: number,
  maxAlpha = 8,
): boolean {
  if (width < 2 || height < 2 || data.length < width * height * 4) return false;
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3];
  return [
    alphaAt(0, 0),
    alphaAt(width - 1, 0),
    alphaAt(0, height - 1),
    alphaAt(width - 1, height - 1),
  ].every((alpha) => alpha <= maxAlpha);
}
