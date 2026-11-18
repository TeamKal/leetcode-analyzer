import "./left-backdrop.css";

/**
 * Quiet atmosphere for the empty dark areas of the left panel: a faint dot grid
 * and a few tiny code symbols that nod to what the product is about. Static and
 * decorative: behind everything, it never moves and never affects the layout.
 * One small easter egg: hover (or focus) a symbol and it answers.
 */
const GLYPHS = [
  { text: "{ }", className: "lb-g1", tip: "just a hash map" },
  { text: "O(n)", className: "lb-g2", tip: "linear. nice." },
  { text: "[3, 3]", className: "lb-g3", tip: "3 + 3 = 6 ✓" },
  { text: "target", className: "lb-g4", tip: "found it" },
] as const;

export function LeftBackdrop() {
  return (
    <div aria-hidden="true" className="lb">
      <div className="lb-grid" />
      {GLYPHS.map((glyph) => (
        <span
          key={glyph.text}
          className={`lb-glyph ${glyph.className}`}
          data-tip={glyph.tip}
        >
          {glyph.text}
        </span>
      ))}
    </div>
  );
}
