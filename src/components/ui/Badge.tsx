import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-brand-soft text-brand-text",
  brand: "bg-brand-soft text-brand-text",
};

type BadgeProps = {
  tone?: Tone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
