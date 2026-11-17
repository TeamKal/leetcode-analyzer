import type { InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export const fieldInputClasses =
  "h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-sm text-ink outline-none transition-shadow placeholder:text-faint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgba(239,56,55,0.15)] disabled:cursor-not-allowed disabled:opacity-60";

/** A labelled text input in the Student Tracker style. */
export function TextField({ label, className = "", ...props }: TextFieldProps) {
  return (
    <label className="block min-w-0 text-[13px] font-medium text-ink-2">
      {label}
      <input
        {...props}
        className={`mt-1.5 font-normal ${fieldInputClasses} ${className}`}
      />
    </label>
  );
}
