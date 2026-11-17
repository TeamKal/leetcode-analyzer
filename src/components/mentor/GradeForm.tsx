"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { gradeSubmission } from "@/app/mentor/submissions/[id]/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { fieldInputClasses } from "@/components/ui/TextField";
import { parseScoreInput } from "@/lib/mentor/grading";

type GradeFormProps = {
  submissionId: string;
  /** The AI score, offered as a starting point. The mentor decides. */
  suggestedScore: number | null;
};

export function GradeForm({ submissionId, suggestedScore }: GradeFormProps) {
  const router = useRouter();
  const [score, setScore] = useState(
    suggestedScore === null ? "" : String(Math.round(suggestedScore * 10) / 10),
  );
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (parseScoreInput(score) === null) {
      setError("Enter a score from 0 to 10.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await gradeSubmission({ submissionId, score, feedback });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("The grade could not be saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-[13px] font-medium text-ink-2">
        Final score (0 to 10)
        <input
          inputMode="decimal"
          autoComplete="off"
          value={score}
          onChange={(event) => setScore(event.target.value)}
          required
          aria-describedby="grade-help"
          className={`mt-1.5 max-w-[140px] font-normal tabular-nums ${fieldInputClasses}`}
        />
      </label>
      <p id="grade-help" className="-mt-2 text-xs text-muted">
        {suggestedScore === null
          ? "There is no AI score to start from."
          : "Started from the AI score. Change it if you disagree."}{" "}
        This grade is final and cannot be changed later.
      </p>

      <label className="block text-[13px] font-medium text-ink-2">
        Feedback for the student (optional)
        <textarea
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={4000}
          rows={5}
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-sm font-normal leading-6 text-ink outline-none transition-shadow placeholder:text-faint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgba(239,56,55,0.15)]"
        />
      </label>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
        {isSaving ? "Saving…" : "Save final grade"}
      </Button>
    </form>
  );
}
