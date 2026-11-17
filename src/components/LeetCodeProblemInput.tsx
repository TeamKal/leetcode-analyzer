"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { StepCard } from "@/components/ui/StepCard";
import { parseLeetCodeProblemUrl } from "../lib/leetcode";

type ProblemMetadata = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
};

type MetadataState = "idle" | "loading" | "ready" | "unavailable";

export type ProblemResult = {
  href: string;
  slug: string;
  state: MetadataState;
  metadata: ProblemMetadata | null;
};

type ViewProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
  error: string;
  result: ProblemResult | null;
};

const difficultyTone = {
  Easy: "success",
  Medium: "warning",
  Hard: "danger",
} as const;

/** The look of step 1. All state lives in `LeetCodeProblemInput` below. */
export function ProblemStepView({
  input,
  onInputChange,
  onSubmit,
  disabled,
  error,
  result,
}: ViewProps) {
  return (
    <StepCard
      number={1}
      title="Pick the problem"
      description="Paste the link to the LeetCode problem you solved."
      state={result ? "done" : "active"}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Problem or submission URL</span>
          <input
            autoComplete="url"
            type="url"
            inputMode="url"
            placeholder="https://leetcode.com/problems/two-sum/"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            aria-describedby="leetcode-url-help"
            required
            disabled={disabled}
            className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3.5 text-sm text-ink outline-none transition-shadow placeholder:text-faint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgba(239,56,55,0.15)] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <Button variant="secondary" type="submit" disabled={disabled}>
          Identify problem
        </Button>
      </form>

      <p id="leetcode-url-help" className="mt-2 text-xs leading-5 text-faint">
        Problem links and links to one of your submissions both work. We only
        read the link; we do not check your code on LeetCode.
      </p>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {result && (
        <div
          aria-live="polite"
          className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3"
        >
          {result.state === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="size-3.5" />
              Looking up the problem…
            </p>
          )}
          {result.state === "ready" && result.metadata && (
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-[15px] font-semibold tracking-[-0.01em]">
                {result.metadata.title}
              </span>
              {result.metadata.difficulty && (
                <Badge tone={difficultyTone[result.metadata.difficulty]}>
                  {result.metadata.difficulty}
                </Badge>
              )}
            </p>
          )}
          {result.state === "unavailable" && (
            <p className="text-sm text-muted">
              We couldn&apos;t look up the problem details, but your link is saved
              and will be used.
            </p>
          )}
          <a
            href={result.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            {result.href}
          </a>
        </div>
      )}
    </StepCard>
  );
}

type Props = {
  submissionUrl: string;
  disabled: boolean;
  onSubmissionUrlChange: (url: string) => void;
};

export function LeetCodeProblemInput({
  submissionUrl,
  disabled,
  onSubmissionUrlChange,
}: Props) {
  const [input, setInput] = useState("");
  const [problemSlug, setProblemSlug] = useState("");
  const [metadata, setMetadata] = useState<ProblemMetadata | null>(null);
  const [metadataState, setMetadataState] = useState<MetadataState>("idle");
  const [error, setError] = useState("");

  async function identifyProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMetadata(null);
    setMetadataState("idle");

    const parsedUrl = parseLeetCodeProblemUrl(input);
    if (!parsedUrl) {
      onSubmissionUrlChange("");
      setProblemSlug("");
      setError(
        "That doesn't look like a LeetCode problem link. Try something like leetcode.com/problems/two-sum/.",
      );
      return;
    }

    onSubmissionUrlChange(parsedUrl.href);
    setProblemSlug(parsedUrl.slug);
    setMetadataState("loading");

    try {
      const response = await fetch("/api/leetcode/problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: parsedUrl.slug }),
      });
      if (!response.ok) throw new Error("Metadata is unavailable.");

      const result = (await response.json()) as Partial<ProblemMetadata>;
      if (typeof result.title !== "string") {
        throw new Error("Metadata is unavailable.");
      }

      setMetadata({
        title: result.title,
        difficulty:
          result.difficulty === "Easy" ||
          result.difficulty === "Medium" ||
          result.difficulty === "Hard"
            ? result.difficulty
            : null,
      });
      setMetadataState("ready");
    } catch {
      setMetadataState("unavailable");
    }
  }

  return (
    <ProblemStepView
      input={input}
      onInputChange={(value) => {
        setInput(value);
        onSubmissionUrlChange("");
        setProblemSlug("");
        setMetadata(null);
        setMetadataState("idle");
      }}
      onSubmit={identifyProblem}
      disabled={disabled}
      error={error}
      result={
        submissionUrl
          ? {
              href: submissionUrl,
              slug: problemSlug,
              state: metadataState,
              metadata,
            }
          : null
      }
    />
  );
}
