"use client";

import { useState, type FormEvent } from "react";
import {
  findMentorCandidate,
  provisionMentor,
} from "@/app/admin/mentors/actions";

type Candidate = {
  userId: string;
  email: string;
};

const lookupErrors: Record<string, string> = {
  unauthorized: "You are not authorized to perform this action.",
  invalid_email: "Enter a valid Google email address.",
  candidate_lookup_failed: "Candidate lookup failed. Please try again.",
  candidate_not_found: "No confirmed Google account was found for that email.",
};

const provisioningErrors: Record<string, string> = {
  unauthorized: "You are not authorized to perform this action.",
  invalid_input: "Enter a valid class ID and find a candidate first.",
  invalid_candidate: "That candidate is not eligible for mentor provisioning.",
  provisioning_failed: "Mentor provisioning failed. Please try again.",
};

export function MentorTestForm() {
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [provisionMessage, setProvisionMessage] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCandidate(null);
    setLookupMessage("");
    setProvisionMessage("");
    setIsLookingUp(true);

    try {
      const result = await findMentorCandidate(email);
      if (result.ok) {
        setCandidate(result.candidate);
      } else {
        setLookupMessage(
          lookupErrors[result.error] ??
            "Candidate lookup failed. Please try again.",
        );
      }
    } catch {
      setLookupMessage("Candidate lookup failed. Please try again.");
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
      setProvisionMessage(
        result.ok
          ? "Mentor provisioned successfully."
          : (provisioningErrors[result.error] ??
              "Mentor provisioning failed. Please try again."),
      );
    } catch {
      setProvisionMessage("Mentor provisioning failed. Please try again.");
    } finally {
      setIsProvisioning(false);
    }
  }

  return (
    <div className="mentor-test-form">
      <form className="mentor-test-fields" onSubmit={handleLookup}>
        <label className="mentor-test-field">
          Google email
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={isLookingUp || isProvisioning}
        >
          {isLookingUp ? "Searching…" : "Find mentor"}
        </button>
      </form>

      {lookupMessage && (
        <p className="mentor-test-message" role="status">
          {lookupMessage}
        </p>
      )}

      {candidate && (
        <section className="mentor-test-candidate" aria-label="Candidate">
          <p className="mentor-test-email">{candidate.email}</p>
          <code className="mentor-test-user-id">{candidate.userId}</code>

          <form className="mentor-test-fields" onSubmit={handleProvision}>
            <label className="mentor-test-field">
              Class ID
              <input
                autoComplete="off"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                required
              />
            </label>
            <button
              className="button button-secondary"
              type="submit"
              disabled={isProvisioning || isLookingUp}
            >
              {isProvisioning ? "Provisioning…" : "Provision mentor"}
            </button>
          </form>
        </section>
      )}

      {provisionMessage && (
        <p className="mentor-test-message" role="status" aria-live="polite">
          {provisionMessage}
        </p>
      )}
    </div>
  );
}
