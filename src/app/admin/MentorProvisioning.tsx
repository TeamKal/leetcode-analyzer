"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  findMentorCandidate,
  provisionMentor,
} from "@/app/admin/mentors/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { fieldInputClasses, TextField } from "@/components/ui/TextField";

type Candidate = {
  userId: string;
  email: string;
};

export type ClassOption = { id: string; name: string };

const lookupErrors: Record<string, string> = {
  unauthorized: "You are not authorized to perform this action.",
  invalid_email: "Enter a valid Google email address.",
  candidate_lookup_failed: "Candidate lookup failed. Please try again.",
  candidate_not_found: "No confirmed Google account was found for that email.",
};

const provisioningErrors: Record<string, string> = {
  unauthorized: "You are not authorized to perform this action.",
  invalid_input: "Choose a class and find a candidate first.",
  invalid_candidate: "That candidate is not eligible for mentor provisioning.",
  provisioning_failed: "Mentor provisioning failed. Please try again.",
};

/** Find an existing Google account, then assign it to a class as mentor. */
export function MentorProvisioning({ classes }: { classes: ClassOption[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [provisionMessage, setProvisionMessage] = useState("");
  const [provisionFailed, setProvisionFailed] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCandidate(null);
    setLookupError("");
    setProvisionMessage("");
    setIsLookingUp(true);

    try {
      const result = await findMentorCandidate(email);
      if (result.ok) {
        setCandidate(result.candidate);
      } else {
        setLookupError(
          lookupErrors[result.error] ??
            "Candidate lookup failed. Please try again.",
        );
      }
    } catch {
      setLookupError("Candidate lookup failed. Please try again.");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleProvision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate) return;

    setProvisionMessage("");
    setIsProvisioning(true);

    try {
      const result = await provisionMentor({
        classId,
        candidateUserId: candidate.userId,
      });
      setProvisionFailed(!result.ok);
      setProvisionMessage(
        result.ok
          ? "Mentor assigned to the class."
          : (provisioningErrors[result.error] ??
              "Mentor provisioning failed. Please try again."),
      );
      if (result.ok) router.refresh();
    } catch {
      setProvisionFailed(true);
      setProvisionMessage("Mentor provisioning failed. Please try again.");
    } finally {
      setIsProvisioning(false);
    }
  }

  const busy = isLookingUp || isProvisioning;

  return (
    <div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={handleLookup}
      >
        <div className="min-w-0 flex-1">
          <TextField
            label="Mentor's Google email"
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {isLookingUp ? "Searching…" : "Find account"}
        </Button>
      </form>

      {lookupError && (
        <div className="mt-4" aria-live="polite">
          <Alert>{lookupError}</Alert>
        </div>
      )}

      {candidate && (
        <div className="mt-5 rounded-lg border border-line bg-surface-2 p-4">
          <p className="text-sm font-medium text-ink">{candidate.email}</p>
          <p className="mt-0.5 text-xs text-muted">
            Confirmed Google account found.
          </p>

          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={handleProvision}
          >
            <label className="block min-w-0 flex-1 text-[13px] font-medium text-ink-2">
              Class
              <select
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                required
                className={`mt-1.5 font-normal ${fieldInputClasses}`}
              >
                <option value="" disabled>
                  Choose a class
                </option>
                {classes.map((classRow) => (
                  <option key={classRow.id} value={classRow.id}>
                    {classRow.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy || classes.length === 0}>
              {isProvisioning ? "Assigning…" : "Make mentor"}
            </Button>
          </form>
        </div>
      )}

      {provisionMessage && (
        <div className="mt-4" aria-live="polite">
          <Alert tone={provisionFailed ? "error" : "info"}>
            {provisionMessage}
          </Alert>
        </div>
      )}
    </div>
  );
}
