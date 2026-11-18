"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isPageLocked } from "@/lib/student/lockedPages";
import "./pill-nav.css";

export type NavKey = "home" | "submissions" | "profile";

type Props = {
  active: NavKey;
  /** The existing sign-out action. */
  signOutAction: () => void | Promise<void>;
};

type Item = { key: NavKey; label: string; href: string };

// Exactly these four (the fourth is Sign out). A page that is locked is shown
// with a small lock and is not a link; see lockedPages.ts.
const ITEMS: Item[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "submissions", label: "Submissions", href: "/submissions" },
  { key: "profile", label: "Profile", href: "/profile" },
];

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="pn-lock"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.8" />
      <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}

/** The label that swaps on hover: the same text, sliding in from below. */
function Label({ children }: { children: string }) {
  return (
    <span className="pn-label">
      <span className="pn-text">{children}</span>
      <span className="pn-text pn-text-hover" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

function NavItems({
  active,
  signOutAction,
  onNavigate,
}: Props & { onNavigate?: () => void }) {
  return (
    <>
      {ITEMS.map((item) =>
        !isPageLocked(item.key) ? (
          <li key={item.key}>
            <Link
              href={item.href}
              className="pn-item"
              data-active={active === item.key ? "true" : "false"}
              aria-current={active === item.key ? "page" : undefined}
              onClick={onNavigate}
            >
              <span className="pn-circle" aria-hidden="true" />
              <Label>{item.label}</Label>
              <span className="pn-dot" aria-hidden="true" />
            </Link>
          </li>
        ) : (
          <li key={item.key}>
            {/* Locked: shown quietly with a lock, and not a link. */}
            <span className="pn-item pn-item-soon" aria-disabled="true">
              <span className="pn-text-plain">{item.label}</span>
              <LockGlyph />
              <span className="sr-only"> (locked for now)</span>
            </span>
          </li>
        ),
      )}
      <li>
        <form action={signOutAction}>
          <button type="submit" className="pn-item pn-item-out" onClick={onNavigate}>
            <span className="pn-circle" aria-hidden="true" />
            <Label>Sign out</Label>
          </button>
        </form>
      </li>
    </>
  );
}

/**
 * The top bar: a pill-shaped navigation with a hover fill that grows from the
 * bottom of each pill. Pure CSS, no animation library. On narrow screens it
 * becomes a menu button with the same pills in a dropdown.
 */
export function PillNav({ active, signOutAction }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <header className="pn-bar">
      <div className="mx-auto flex h-[68px] w-full max-w-[1040px] items-center justify-center gap-4 px-4 sm:px-6">
        {/* Wide screens: the pill, centred. */}
        <nav aria-label="Main" className="hidden sm:block">
          <ul className="pn-pill">
            <NavItems active={active} signOutAction={signOutAction} />
          </ul>
        </nav>

        {/* Narrow screens: a menu button and a dropdown with the same items. */}
        <div ref={menuRef} className="relative sm:hidden">
          <button
            type="button"
            className="pn-menu-button"
            aria-expanded={open}
            aria-controls="pn-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="pn-bars" data-open={open ? "true" : "false"} aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
          <nav
            id="pn-menu"
            aria-label="Main"
            className="pn-dropdown"
            data-open={open ? "true" : "false"}
            hidden={!open}
          >
            <ul className="pn-stack">
              <NavItems
                active={active}
                signOutAction={signOutAction}
                onNavigate={() => setOpen(false)}
              />
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
