"use client";

import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { fieldInputClasses } from "@/components/ui/TextField";
import type { SubmissionInputCheck } from "@/lib/leetcode";

type Props = {
  value: string;
  onChange: (value: string) => void;
  check: SubmissionInputCheck;
  disabled: boolean;
};

type ProblemInfo = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
};

const TONE = { Easy: "success", Medium: "warning", Hard: "danger" } as const;

/** "two-sum" -> "Two Sum", for when the problem's real title is not available. */
function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Step 1: the LeetCode submission link. It must be a full submission link (a
 * bare number does not say which problem it belongs to). Mistakes get a plain
 * explanation, and a good link shows what was found.
 */
export function SubmissionStep({ value, onChange, check, disabled }: Props) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<ProblemInfo | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const slug = check.ok ? check.link.slug : null;
  const showError = touched && !check.ok;

  // Look the problem's title up (best effort: the link is already enough).
  useEffect(() => {
    setProblem(null);
    if (!slug) {
      setLookingUp(false);
      return;
    }
    const controller = new AbortController();
    setLookingUp(true);
    fetch("/api/leetcode/problem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { title?: unknown; difficulty?: unknown } | null) => {
        if (controller.signal.aborted) return;
        if (data && typeof data.title === "string") {
          const difficulty =
            data.difficulty === "Easy" ||
            data.difficulty === "Medium" ||
            data.difficulty === "Hard"
              ? data.difficulty
              : null;
          setProblem({ title: data.title, difficulty });
        }
        setLookingUp(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookingUp(false);
      });
    return () => controller.abort();
  }, [slug]);

  return (
    <div>
      <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-2">
        LeetCode submission link
      </label>
      <input
        id={inputId}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        placeholder="https://leetcode.com/problems/two-sum/submissions/123456789/"
        aria-invalid={showError}
        aria-describedby={showError ? errorId : helpId}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        className={`mt-1.5 font-mono text-[13px] ${fieldInputClasses} ${
          showError ? "!border-brand" : ""
        }`}
      />

      {showError && !check.ok ? (
        <p id={errorId} role="alert" className="mt-2 text-[13px] leading-5 text-brand-text">
          {check.message}
        </p>
      ) : (
        <p id={helpId} className="mt-2 text-[13px] leading-5 text-muted">
          On LeetCode, open your accepted submission and copy the address from your
          browser.
        </p>
      )}

      {check.ok && (
        <div
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3.5 py-3"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success-text">
            <svg
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
            Link found
          </span>
          <span className="font-mono text-[12.5px] text-ink-2">
            Submission {check.link.submissionId}
          </span>
          <span className="text-[13px] font-medium text-ink">
            {problem?.title ?? titleFromSlug(check.link.slug)}
          </span>
          {problem?.difficulty && (
            <Badge tone={TONE[problem.difficulty]}>{problem.difficulty}</Badge>
          )}
          {lookingUp && <Spinner className="size-3 text-muted" />}
        </div>
      )}
    </div>
  );
}
