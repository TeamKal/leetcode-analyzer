"use client";

import { useState, type FormEvent } from "react";
import { parseLeetCodeProblemUrl } from "../lib/leetcode";

type ProblemMetadata = {
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
};

type MetadataState = "idle" | "loading" | "ready" | "unavailable";

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
        "Enter a valid LeetCode problem URL, optionally including its submissions path.",
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
    <section
      className="leetcode-input-section"
      aria-labelledby="leetcode-input-title"
    >
      <div className="leetcode-input-heading">
        <div>
          <p className="eyebrow">PROBLEM</p>
          <h2 id="leetcode-input-title">Identify the LeetCode problem</h2>
        </div>
        <span className="local-state-label">Not saved</span>
      </div>

      <form className="leetcode-url-form" onSubmit={identifyProblem}>
        <label className="leetcode-url-field">
          Problem or submission URL
          <input
            autoComplete="url"
            type="url"
            inputMode="url"
            placeholder="https://leetcode.com/problems/two-sum/"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              onSubmissionUrlChange("");
              setProblemSlug("");
              setMetadata(null);
              setMetadataState("idle");
            }}
            aria-describedby="leetcode-url-help"
            required
            disabled={disabled}
          />
        </label>
        <button
          className="button button-secondary"
          type="submit"
          disabled={disabled}
        >
          Identify problem
        </button>
      </form>

      <p className="leetcode-url-help" id="leetcode-url-help">
        Accepts problem URLs and URLs with a numeric submissions path. This
        checks the URL format only; it does not retrieve or verify submitted
        code.
      </p>

      {error && (
        <p className="leetcode-url-error" role="alert">
          {error}
        </p>
      )}

      {submissionUrl && (
        <div className="leetcode-problem-result" aria-live="polite">
          <a href={submissionUrl} target="_blank" rel="noreferrer">
            {submissionUrl}
          </a>
          <p>Problem slug: {problemSlug}</p>
          {metadataState === "loading" && <p>Looking up problem metadata…</p>}
          {metadataState === "ready" && metadata && (
            <p>
              {metadata.title}
              {metadata.difficulty ? ` · ${metadata.difficulty}` : ""}
            </p>
          )}
          {metadataState === "unavailable" && (
            <p>Problem metadata is unavailable. The valid URL is retained.</p>
          )}
        </div>
      )}
    </section>
  );
}
