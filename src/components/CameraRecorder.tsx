"use client";

import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { UploadStatus, type UploadState } from "@/components/submit/UploadStatus";
import { useRecording } from "../hooks/useRecording";

type Props = {
  recording: ReturnType<typeof useRecording>;
  cameraUpload: UploadState;
  onStartRecording: () => void;
  onRecordingComplete: (audioBlob: Blob, videoBlob?: Blob) => void;
  onRetake: () => void;
  disabled: boolean;
};

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function getRecordingExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "media";
}

function CameraGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7 text-zinc-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </svg>
  );
}

export function CameraRecorder({
  recording,
  cameraUpload,
  onStartRecording,
  onRecordingComplete,
  onRetake,
  disabled,
}: Props) {
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    preview.srcObject = recording.stream;

    return () => {
      preview.srcObject = null;
    };
  }, [recording.stream]);

  async function stopRecording() {
    const recordingOutput = await recording.stopRecording();
    if (recordingOutput) {
      onRecordingComplete(recordingOutput.audioBlob, recordingOutput.videoBlob);
    }
  }

  const live =
    recording.stream &&
    (recording.phase === "ready" ||
      recording.phase === "recording" ||
      recording.phase === "stopping");
  const recorded = recording.phase === "recorded" && recording.videoUrl;
  const showUpload =
    recording.phase === "ready" ||
    recording.phase === "recording" ||
    recording.phase === "stopping" ||
    recording.phase === "recorded";

  return (
    <div className="space-y-4">
      {/* The stage: a dark frame holding the camera, the recording, or a prompt. */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#09090b]">
        {live && (
          <video
            ref={previewRef}
            className="size-full object-cover"
            autoPlay
            muted
            playsInline
            aria-label="Live camera preview"
          />
        )}

        {recorded && (
          <video
            className="size-full object-contain"
            controls
            playsInline
            preload="metadata"
            src={recording.videoUrl ?? undefined}
            aria-label="Your recording"
          />
        )}

        {!live && !recorded && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <CameraGlyph />
              <p className="text-sm text-zinc-400">
                Turn on your camera and microphone to record your explanation.
              </p>
            </div>
          </div>
        )}

        {recording.phase === "recording" && (
          <div
            className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"
            role="timer"
            aria-live="off"
          >
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
            />
            <span className="tabular-nums">
              {formatRecordingTime(recording.elapsedSeconds)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(recording.phase === "idle" || recording.phase === "error") &&
          !recording.stream && (
            <Button
              disabled={disabled}
              onClick={() => void recording.requestAccess()}
            >
              Enable camera and microphone
            </Button>
          )}

        {recording.phase === "requesting" && (
          <Button disabled>
            <Spinner />
            Waiting for permission…
          </Button>
        )}

        {recording.phase === "ready" && (
          <>
            <Button
              disabled={disabled}
              onClick={() => {
                onStartRecording();
                recording.startRecording();
              }}
            >
              Start recording
            </Button>
            <Button
              variant="ghost"
              onClick={() => void recording.endSession()}
            >
              Turn camera off
            </Button>
          </>
        )}

        {recording.phase === "recording" && (
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => void stopRecording()}
          >
            Stop recording
          </Button>
        )}

        {recording.phase === "stopping" && (
          <Button disabled>
            <Spinner />
            Saving your recording…
          </Button>
        )}

        {recording.phase === "recorded" && (
          <>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                onRetake();
                recording.retake();
              }}
            >
              Record again
            </Button>
            {recording.videoUrl && recording.videoBlob && (
              <a
                className={buttonClasses("ghost")}
                href={recording.videoUrl}
                download={`recording.${getRecordingExtension(recording.videoBlob.type)}`}
              >
                Download video
              </a>
            )}
            {recording.stream && (
              <Button
                variant="ghost"
                onClick={() => void recording.endSession()}
              >
                Turn camera off
              </Button>
            )}
          </>
        )}

        {recording.phase === "error" && recording.stream && (
          <Button variant="ghost" onClick={() => void recording.endSession()}>
            Turn camera off
          </Button>
        )}
      </div>

      {recording.error && <Alert>{recording.error}</Alert>}

      {showUpload && <UploadStatus upload={cameraUpload} />}
    </div>
  );
}
