import Link from "next/link";

const LINKS = [
  { id: "submissions", href: "/mentor", label: "Submissions" },
  { id: "students", href: "/mentor/students", label: "Students" },
] as const;

/** Section links shared by the mentor pages. */
export function MentorNav({ active }: { active: "submissions" | "students" }) {
  return (
    <nav aria-label="Mentor sections" className="mt-6 flex gap-1 border-b border-line">
      {LINKS.map((link) => {
        const selected = link.id === active;
        return (
          <Link
            key={link.id}
            href={link.href}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${
              selected
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
