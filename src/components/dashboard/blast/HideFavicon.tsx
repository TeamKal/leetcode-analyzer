"use client";

import { useEffect } from "react";

/** A 1x1 transparent PNG: shows no icon in the tab. */
export const BLANK_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Blanks the tab's icon for as long as this is on screen. */
export function HideFavicon() {
  useEffect(() => {
    const apply = () => {
      document
        .querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
        .forEach((l) => l.remove());
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = BLANK_ICON;
      link.dataset.blank = "1";
      document.head.appendChild(link);
    };
    apply();
    // The framework may put its own icon back on updates: keep it blank.
    const obs = new MutationObserver(() => {
      const icons = document.querySelectorAll('link[rel~="icon"]:not([data-blank])');
      if (icons.length) apply();
    });
    obs.observe(document.head, { childList: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
