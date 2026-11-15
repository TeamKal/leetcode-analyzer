"use client";

import { useEffect, useRef } from "react";
import { useRecording } from "../hooks/useRecording";
import { useTranscription } from "../hooks/useTranscription";
import {
  TranscriptionPanel,
  type SubmissionControls,
} from "./TranscriptionPanel";

type Props = {
  recording: ReturnType<typeof useRecording>;
  transcription: ReturnType<typeof useTranscription>;
  showTranscript: boolean;
  cameraR2Upload: {
    status: "waiting" | "uploading" | "success" | "error";
    objectKey: string;
    message: string;
  };
  submissionControls: SubmissionControls;
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

export function CameraRecorder({
  recording,
  transcription,
  showTranscript,
  cameraR2Upload,
  submissionControls,
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

  return (
    <section className="camera-section" aria-labelledby="camera-heading">
      <div className="camera-section-heading">
        <div>
          <p className="eyebrow">CAMERA + MICROPHONE</p>
          <h2 id="camera-heading">Record a new video</h2>
          <p className="camera-description">
            Camera video and microphone audio are recorded together, with a
            separate microphone-only recording used for local Whisper
            transcription. The final original video is uploaded to private
            storage after the take ends.
          </p>
        </div>
        {recording.phase === "recording" && (
          <span className="recording-indicator">
            <span />
            Recording
          </span>
        )}
      </div>

      {recording.stream &&
        (recording.phase === "ready" ||
          recording.phase === "recording" ||
          recording.phase === "stopping") && (
          <video
            ref={previewRef}
            className="camera-preview"
            autoPlay
            muted
            playsInline
            aria-label="Live camera preview"
          />
        )}

      {recording.phase === "recorded" && recording.videoUrl && (
        <video
          className="camera-preview"
          controls
          playsInline
          preload="metadata"
          src={recording.videoUrl}
          aria-label="Recorded video preview with camera and microphone audio"
        />
      )}

      {recording.phase === "recorded" && recording.audioUrl && (
        <div className="recorded-audio">
          <p className="result-title">Microphone audio only</p>
          <audio
            className="audio-player"
            controls
            preload="metadata"
            src={recording.audioUrl}
            aria-label="Preview microphone-only recording"
          />
        </div>
      )}

      {(recording.phase === "ready" ||
        recording.phase === "recording" ||
        recording.phase === "stopping" ||
        recording.phase === "recorded") && (
        <div
          className={`transcription-error ${cameraR2Upload.status === "success" ? "success-message" : ""}`}
          role={cameraR2Upload.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <strong>Private video upload:</strong> {cameraR2Upload.message}
          {cameraR2Upload.objectKey && (
            <>
              <br />
              Verified object key: {cameraR2Upload.objectKey}
            </>
          )}
        </div>
      )}

      {recording.phase === "recording" && (
        <p className="recording-timer" role="timer" aria-live="off">
          {formatRecordingTime(recording.elapsedSeconds)}
        </p>
      )}

      {recording.error && (
        <div className="transcription-error" role="alert">
          {recording.error}
        </div>
      )}

      <div className="camera-actions">
        {(recording.phase === "idle" || recording.phase === "error") &&
          !recording.stream && (
            <button
              className="button button-primary"
              type="button"
              disabled={disabled}
              onClick={() => void recording.requestAccess()}
            >
              Enable camera and microphone
            </button>
          )}

        {recording.phase === "requesting" && (
          <button className="button button-primary" type="button" disabled>
            <span className="spinner" aria-hidden="true" />
            Requesting permissions…
          </button>
        )}

        {recording.phase === "ready" && (
          <>
            <button
              className="button button-primary"
              type="button"
              disabled={disabled}
              onClick={() => {
                onStartRecording();
                recording.startRecording();
              }}
            >
              Start recording
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => void recording.endSession()}
            >
              End camera session
            </button>
          </>
        )}

        {recording.phase === "recording" && (
          <button
            className="button button-danger"
            type="button"
            disabled={disabled}
            onClick={() => void stopRecording()}
          >
            Stop recording
          </button>
        )}

        {recording.phase === "stopping" && (
          <button className="button button-primary" type="button" disabled>
            Saving both recordings…
          </button>
        )}

        {recording.phase === "recorded" && (
          <>
            {recording.videoUrl && recording.videoBlob && (
              <a
                className="button button-secondary"
                href={recording.videoUrl}
                download={`videomind-recording.${getRecordingExtension(recording.videoBlob.type)}`}
              >
                Download video
              </a>
            )}
            {recording.audioUrl && recording.audioBlob && (
              <a
                className="button button-secondary"
                href={recording.audioUrl}
                download={`videomind-audio.${getRecordingExtension(recording.audioBlob.type)}`}
              >
                Download audio
              </a>
            )}
            <button
              className="text-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                onRetake();
                recording.retake();
              }}
            >
              Retake
            </button>
            {recording.stream && (
              <button
                className="text-button"
                type="button"
                onClick={() => void recording.endSession()}
              >
                End camera session
              </button>
            )}
          </>
        )}

        {recording.phase === "error" && recording.stream && (
          <button
            className="text-button"
            type="button"
            onClick={() => void recording.endSession()}
          >
            End camera session
          </button>
        )}
      </div>

      {showTranscript && recording.audioBlob && (
        <TranscriptionPanel
          transcription={transcription}
          audioBlob={recording.audioBlob}
          fileName="videomind-recording"
          {...submissionControls}
        />
      )}
    </section>
  );
}
