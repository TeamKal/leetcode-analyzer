"use client";

import { useEffect, useState } from "react";
import { HideFavicon } from "./HideFavicon";

/** Pause after the screen goes plain, so the message never overlaps the destruction. */
const START_DELAY_MS = 900;
const FADE_MS = 700;

/** A natural typing pace: steady, a touch slower after punctuation and spaces. */
function delayAfter(char: string, index: number): number {
  const base = 62 + ((index * 37) % 41); // 62-102 ms, deterministic wobble
  if (char === " ") return base + 28;
  if (char === "." || char === ",") return base + 220;
  return base;
}

/**
 * The last thing shown after the destruction: a centred line that fades in and is
 * then typed out one character at a time. No cursor. The full text is laid out
 * from the start (the untyped part is transparent), so it never shifts while typing.
 */
export function FinalMessage({ text }: { text: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(text.length);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let i = 0;
    const step = () => {
      i += 1;
      setCount(i);
      if (i < text.length) timer = setTimeout(step, delayAfter(text[i - 1], i));
    };
    timer = setTimeout(step, START_DELAY_MS + FADE_MS * 0.6);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="ds dash flex min-h-screen items-center justify-center bg-page px-6 font-sans text-ink antialiased">
      <HideFavicon />
      <p
        role="status"
        aria-label={text}
        className="blast-final max-w-[22ch] text-center text-[clamp(28px,5.5vw,56px)] font-semibold leading-[1.15] tracking-[-0.03em] sm:max-w-[28ch]"
        style={{ animation: `blast-final-in ${FADE_MS}ms ease-out ${START_DELAY_MS}ms both` }}
      >
        <span aria-hidden="true">{text.slice(0, count)}</span>
        <span aria-hidden="true" className="opacity-0">
          {text.slice(count)}
        </span>
        <style>{`@keyframes blast-final-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.blast-final{animation:none!important}}`}</style>
      </p>
    </div>
  );
}
