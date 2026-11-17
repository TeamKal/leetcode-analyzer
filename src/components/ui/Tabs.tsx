"use client";

import { useRef, type KeyboardEvent } from "react";

type Tab<T extends string> = { id: T; label: string };

type TabsProps<T extends string> = {
  label: string;
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Id prefix used to link each tab to its panel (`${idPrefix}-panel-${id}`). */
  idPrefix: string;
};

/** A segmented control with proper tab semantics and arrow-key navigation. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  idPrefix,
}: TabsProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === value);
    const next =
      tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex rounded-lg bg-sunken p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`h-9 rounded-md px-4 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              selected
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
