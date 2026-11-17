import type { ReactNode } from "react";

type SectionProps = {
  id: string;
  title: string;
  description?: string;
  /** Small content on the right of the heading (a count, a badge). */
  aside?: ReactNode;
  children: ReactNode;
};

/** A titled white card used by the admin pages. */
export function Section({ id, title, description, aside, children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-xl border border-line bg-surface p-5 sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2
            id={`${id}-title`}
            className="text-[17px] font-semibold tracking-[-0.02em] text-ink"
          >
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

export const tableClasses = {
  wrap: "-mx-5 overflow-x-auto sm:mx-0 sm:rounded-lg sm:border sm:border-line",
  table: "w-full min-w-[560px] [&_tr:last-child_td]:border-b-0 border-collapse text-left text-sm",
  th: "border-b border-line bg-surface-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted",
  td: "border-b border-line px-4 py-3 align-middle text-ink-2",
};
