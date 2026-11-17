import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-[13px] font-semibold " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const sizes: Record<Size, string> = {
  md: "h-11 px-4",
  sm: "h-9 px-3",
};

const variants: Record<Variant, string> = {
  primary: "btn-shimmer bg-ink text-surface hover:bg-ink-2",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
  danger: "bg-action text-white hover:bg-action-hover",
  ghost: "text-ink-2 hover:bg-sunken",
};

/** The class names of a button, for links that should look like one. */
export function buttonClasses(
  variant: Variant = "secondary",
  size: Size = "md",
  fullWidth = false,
) {
  return `${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? "w-full" : ""}`;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size, fullWidth)} ${className}`}
      {...props}
    />
  );
}
