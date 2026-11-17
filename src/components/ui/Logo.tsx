type LogoMarkProps = {
  className?: string;
};

export function LogoMark({ className = "size-8 rounded-lg" }: LogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-brand text-white ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[58%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m8 7-5 5 5 5" />
        <path d="m16 7 5 5-5 5" />
        <path d="M10.5 9.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

type LogoProps = {
  className?: string;
  /** Use on dark backgrounds. */
  inverted?: boolean;
};

export function Logo({ className = "", inverted = false }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${
        inverted ? "text-white" : "text-ink"
      } ${className}`}
    >
      <LogoMark />
      <span className="text-[15px]">Student Tracker</span>
    </span>
  );
}
