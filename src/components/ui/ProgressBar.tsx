type ProgressBarProps = {
  /** 0-100. Leave undefined for an indeterminate ("working") bar. */
  value?: number;
  label: string;
  className?: string;
};

export function ProgressBar({ value, label, className = "" }: ProgressBarProps) {
  const determinate = typeof value === "number";
  const percent = determinate ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(percent) : undefined}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-sunken ${className}`}
    >
      <div
        className={`h-full rounded-full bg-ink transition-[width] duration-300 ease-out ${
          determinate ? "" : "w-2/5 animate-pulse motion-reduce:animate-none"
        }`}
        style={determinate ? { width: `${percent}%` } : undefined}
      />
    </div>
  );
}
