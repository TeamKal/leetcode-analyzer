import type { ReactNode } from "react";

type AlertProps = {
  children: ReactNode;
  tone?: "error" | "info";
};

const tones = {
  error: "border-brand-line bg-brand-soft text-brand-text",
  info: "border-line bg-surface-2 text-ink-2",
};

export function Alert({ children, tone = "error" }: AlertProps) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2.5 text-[13px] leading-5 ${tones[tone]}`}
    >
      {children}
    </p>
  );
}
