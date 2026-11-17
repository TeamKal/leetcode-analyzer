import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";

type AppHeaderProps = {
  /** Server action (or any handler) that signs the user out. */
  signOutAction: () => void | Promise<void>;
  /** Wider container, for dashboard pages. */
  wide?: boolean;
  /** Shown instead of the privacy chip, e.g. "Administrator". */
  roleLabel?: string;
};

/** The top bar shared by signed-in pages. */
export function AppHeader({ signOutAction, wide = false, roleLabel }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[var(--glass-strong)] backdrop-blur">
      <div
        className={`mx-auto flex h-14 w-full items-center justify-between px-4 sm:px-6 ${
          wide ? "max-w-[1120px]" : "max-w-[960px]"
        }`}
      >
        <Link
          href="/"
          aria-label="Student Tracker home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          <Logo />
        </Link>

        <div className="flex items-center gap-2">
          {roleLabel ? (
            <Badge tone="neutral">{roleLabel}</Badge>
          ) : (
          <Badge tone="neutral" className="hidden sm:inline-flex">
            <svg
              viewBox="0 0 16 16"
              className="size-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 1.75 2.75 4v3.75c0 3.1 2.2 5.5 5.25 6.5 3.05-1 5.25-3.4 5.25-6.5V4L8 1.75Z" />
            </svg>
            Private by design
          </Badge>
          )}
          <form action={signOutAction}>
            <button
              type="submit"
              className="h-9 rounded-lg px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
