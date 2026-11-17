import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";

type EntryCardProps = {
  id: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

/** A centred message card for pages that stop a signed-in user (no access, no enrollment). */
export function EntryCard({ id, title, children, actions }: EntryCardProps) {
  return (
    <main className="ds grid min-h-screen place-items-center bg-page px-4 py-10 font-sans text-ink antialiased">
      <section
        aria-labelledby={id}
        className="w-full max-w-[440px] rounded-xl border border-line bg-surface p-6 sm:p-8"
      >
        <Logo />
        <h1
          id={id}
          className="mt-8 text-[24px] font-semibold tracking-[-0.03em]"
        >
          {title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted">{children}</p>
        {actions && <div className="mt-6">{actions}</div>}
      </section>
    </main>
  );
}
