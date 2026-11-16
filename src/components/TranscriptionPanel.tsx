"use client";

import { useState } from "react";
import { useTranscription } from "../hooks/useTranscription";

export type SubmissionFeedback = {
  status: "idle" | "pending" | "success" | "error";
  message: string;
};

export type SubmissionControls = {
  canSubmitSolution: boolean;
  submissionFeedback: SubmissionFeedback;
  onSubmitSolution: () => void;
};

type Props = {
  transcription: ReturnType<typeof useTranscription>;
  // Verified private-storage key of the uploaded video. Empty until the upload
  // has finished.
  videoObjectKey: string;
  fileName: string;
} & SubmissionControls;

export function TranscriptionPanel({
  transcription,
  videoObjectKey,
  fileName,
  canSubmitSolution,
  submissionFeedback,
  onSubmitSolution,
}: Props) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const submissionLocked = submissionFeedback.status === "success";
  const submissionPending = submissionFeedback.status === "pending";
  const submissionInputsLocked = submissionLocked || submissionPending;
  const showTranscriptEditor =
    transcription.phase === "completed" ||
    transcription.phase === "error" ||
    transcription.transcript.length > 0;

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcription.transcript);
      setCopyFeedback("Transcript copied.");
    } catch {
      setCopyFeedback(
        "Clipboard access is unavailable. Select the transcript and copy it manually.",
      );
    }
  }

  function downloadTranscript() {
    const textBlob = new Blob([transcription.transcript], {
      type: "text/plain;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(textBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    const baseName = fileName.replace(/\.[^.]+$/, "") || "transcript";
    link.download = `${baseName}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  return (
    <section
      className="transcription-panel"
      aria-labelledby="transcript-heading"
    >
      <div className="transcription-heading">
        <div>
          <p className="transcription-title" id="transcript-heading">
            Transcript
          </p>
          <p className="transcription-note">
            Your uploaded video is transcribed securely by Deepgram, usually
            within seconds. You can edit the transcript before you submit.
          </p>
        </div>
        {transcription.phase === "completed" && (
          <span className="execution-badge">Transcribed · Deepgram</span>
        )}
      </div>

      {!videoObjectKey && transcription.phase === "idle" && (
        <div className="transcription-status" role="status" aria-live="polite">
          Waiting for the video upload to finish…
        </div>
      )}

      {transcription.phase !== "idle" && (
        <div className="transcription-status" role="status" aria-live="polite">
          {transcription.phase === "transcribing" && "Transcribing"}
          {transcription.phase === "completed" && "Completed"}
          {transcription.phase === "error" && "Failed"}
          {transcription.message && ` · ${transcription.message}`}
        </div>
      )}

      {transcription.phase === "transcribing" && (
        <progress
          className="progress-bar transcription-progress"
          aria-label="Transcription in progress"
        />
      )}

      {transcription.error && (
        <div className="transcription-error" role="alert">
          {transcription.error}
        </div>
      )}

      {showTranscriptEditor && (
        <>
          <p className="transcript-edit-hint">
            Transcript is editable. Review and correct it before final
            submission.
          </p>
          <textarea
            className="transcript-text"
            aria-label="Generated transcript editor"
            value={transcription.transcript}
            disabled={submissionInputsLocked}
            placeholder={
              transcription.phase === "error"
                ? "Transcript is unavailable. Try again, or type your transcript here."
                : "Transcript will appear here. You can correct any mistakes before final submission."
            }
            onChange={(event) => {
              transcription.updateTranscript(event.target.value);
            }}
          />
          <div className="transcript-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={copyTranscript}
            >
              Copy transcript
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={downloadTranscript}
            >
              Download .txt
            </button>
            <button
              className="text-button"
              type="button"
              disabled={submissionInputsLocked}
              onClick={() => {
                transcription.clearTranscript();
                setCopyFeedback("");
              }}
            >
              Clear transcript
            </button>
          </div>
          {copyFeedback && (
            <p className="copy-feedback" role="status">
              {copyFeedback}
            </p>
          )}
          <div className="transcript-actions">
            <button
              className="button button-primary transcript-button"
              type="button"
              disabled={!canSubmitSolution || submissionInputsLocked}
              onClick={onSubmitSolution}
            >
              {submissionPending
                ? "Submitting…"
                : submissionLocked
                  ? "Solution submitted"
                  : "Submit Solution"}
            </button>
          </div>
          {submissionFeedback.message && (
            <p
              className={`copy-feedback submission-feedback${submissionFeedback.status === "success" ? " success" : submissionFeedback.status === "error" ? " error" : ""}`}
              role={submissionFeedback.status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {submissionFeedback.message}
            </p>
          )}
        </>
      )}

      {transcription.isBusy ? (
        <button
          className="text-button cancel-transcription"
          type="button"
          onClick={() => {
            transcription.cancel();
            setCopyFeedback("");
          }}
        >
          Cancel transcription
        </button>
      ) : (
        <button
          className="button button-primary transcript-button"
          type="button"
          disabled={!videoObjectKey || submissionInputsLocked}
          onClick={() => {
            if (videoObjectKey) {
              setCopyFeedback("");
              void transcription.transcribe(videoObjectKey);
            }
          }}
        >
          {transcription.phase === "completed" || transcription.phase === "error"
            ? "Generate again"
            : "Generate Transcript"}
        </button>
      )}
    </section>
  );
}
