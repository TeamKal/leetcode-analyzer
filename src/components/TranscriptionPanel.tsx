"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { StepCard } from "@/components/ui/StepCard";
import { useTranscription } from "../hooks/useTranscription";

export type SubmissionFeedback = {
  status: "idle" | "pending" | "success" | "error";
  message: string;
};

type Props = {
  transcription: ReturnType<typeof useTranscription>;
  // Verified private-storage key of the video. Empty until the upload has
  // finished.
  videoObjectKey: string;
  fileName: string;
  // True once a video has been added (even if it is still uploading).
  hasVideo: boolean;
  // The submission is pending or finished: the transcript is read-only.
  locked: boolean;
};

/** Step 3: generate, read and correct the transcript. */
export function TranscriptionPanel({
  transcription,
  videoObjectKey,
  fileName,
  hasVideo,
  locked,
}: Props) {
  const [copyFeedback, setCopyFeedback] = useState("");
  const showTranscriptEditor =
    transcription.phase === "completed" ||
    transcription.phase === "error" ||
    transcription.transcript.length > 0;
  const done =
    transcription.phase === "completed" &&
    transcription.transcript.trim().length > 0;

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcription.transcript);
      setCopyFeedback("Copied to your clipboard.");
    } catch {
      setCopyFeedback(
        "Clipboard access is unavailable. Select the text and copy it manually.",
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

  function generate() {
    if (videoObjectKey) {
      setCopyFeedback("");
      void transcription.transcribe(videoObjectKey);
    }
  }

  const badge =
    transcription.phase === "transcribing" ? (
      <Badge tone="neutral">
        <Spinner className="size-3" />
        Transcribing
      </Badge>
    ) : transcription.phase === "completed" ? (
      <Badge tone="success">Ready</Badge>
    ) : transcription.phase === "error" ? (
      <Badge tone="danger">Didn&apos;t work</Badge>
    ) : null;

  return (
    <StepCard
      number={3}
      title="Check the transcript"
      description="We turn your video into text. Fix anything we misheard before you submit."
      state={done ? "done" : videoObjectKey ? "active" : "idle"}
      aside={badge}
    >
      {!videoObjectKey && transcription.phase === "idle" && (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {hasVideo
            ? "Waiting for your video to finish uploading…"
            : "Add a video above and your transcript will appear here."}
        </p>
      )}

      {videoObjectKey &&
        transcription.phase === "idle" &&
        !showTranscriptEditor && (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={locked} onClick={generate}>
              Generate transcript
            </Button>
            <p className="text-xs text-faint">
              Transcribed securely by Deepgram, usually within seconds.
            </p>
          </div>
        )}

      {transcription.phase === "transcribing" && (
        <div role="status" aria-live="polite" className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Spinner className="size-3.5" />
            Transcribing your explanation…
          </p>
          <ProgressBar label="Transcription in progress" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              transcription.cancel();
              setCopyFeedback("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {transcription.error && (
        <div className="mb-4">
          <Alert>{transcription.error}</Alert>
        </div>
      )}

      {showTranscriptEditor && (
        <div className="space-y-3">
          <textarea
            className="min-h-[200px] w-full resize-y rounded-lg border border-line-strong bg-surface px-3.5 py-3 text-[15px] leading-[1.65] text-ink outline-none transition-shadow placeholder:text-faint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_rgba(239,56,55,0.15)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70"
            aria-label="Transcript"
            value={transcription.transcript}
            disabled={locked}
            placeholder={
              transcription.phase === "error"
                ? "We couldn't transcribe this one. Try again, or type your explanation here."
                : "Your transcript will appear here. You can correct any mistakes."
            }
            onChange={(event) => {
              transcription.updateTranscript(event.target.value);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={copyTranscript}>
              Copy
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadTranscript}>
              Download .txt
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() => {
                transcription.clearTranscript();
                setCopyFeedback("");
              }}
            >
              Clear
            </Button>
            {!transcription.isBusy && (
              <Button
                variant="ghost"
                size="sm"
                className="sm:ml-auto"
                disabled={!videoObjectKey || locked}
                onClick={generate}
              >
                Generate again
              </Button>
            )}
          </div>

          {copyFeedback && (
            <p role="status" className="text-xs text-muted">
              {copyFeedback}
            </p>
          )}
        </div>
      )}
    </StepCard>
  );
}
