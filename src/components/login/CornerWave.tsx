/**
 * A soft lavender wave for the bottom-right corner of the sign-in panel: four
 * layered curves in pale lavender, soft purple and white, melting into the
 * panel toward the top-left. Pure SVG, no animation, decorative only. It must
 * be rendered inside the panel's backdrop (behind the content, no pointer
 * events); its size comes from `.pb-corner-wave` in backdrop.css. The SVG is
 * anchored to the corner and cropped ("slice") when the box is shorter than the
 * drawing, so on short or small screens only the lower part of the wave shows.
 */
export function CornerWave() {
  return (
    <svg
      viewBox="0 0 480 300"
      preserveAspectRatio="xMaxYMax slice"
      className="pb-corner-wave"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pb-wave-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3efff" />
          <stop offset="0.55" stopColor="#e4dcfd" />
          <stop offset="1" stopColor="#d6cbfa" />
        </linearGradient>
        <linearGradient id="pb-wave-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ebe5ff" />
          <stop offset="0.5" stopColor="#d2c7fa" />
          <stop offset="1" stopColor="#bcaef1" />
        </linearGradient>
        <linearGradient id="pb-wave-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9cffb" />
          <stop offset="0.6" stopColor="#bfb0f2" />
          <stop offset="1" stopColor="#a999e8" />
        </linearGradient>
        <linearGradient id="pb-wave-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Back layer: the widest, palest sweep. */}
      <path
        d="M0 300 C70 268 118 176 214 160 C300 146 346 168 408 112 C436 87 458 60 480 38 L480 300 Z"
        fill="url(#pb-wave-back)"
        opacity="0.95"
      />
      {/* Middle layer. */}
      <path
        d="M64 300 C128 270 184 206 270 202 C346 198 394 176 436 140 C453 126 467 114 480 102 L480 300 Z"
        fill="url(#pb-wave-mid)"
        opacity="0.9"
      />
      {/* A thin white highlight riding the crest of the middle layer. */}
      <path
        d="M64 300 C128 270 184 206 270 202 C346 198 394 176 436 140 C453 126 467 114 480 102"
        fill="none"
        stroke="url(#pb-wave-sheen)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Front layer: the deepest purple, hugging the corner. */}
      <path
        d="M170 300 C226 280 276 246 340 246 C398 246 442 222 480 192 L480 300 Z"
        fill="url(#pb-wave-front)"
        opacity="0.88"
      />
      <path
        d="M170 300 C226 280 276 246 340 246 C398 246 442 222 480 192"
        fill="none"
        stroke="url(#pb-wave-sheen)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}
