"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranscription } from "../hooks/useTranscription";
import { useRecording } from "../hooks/useRecording";
import { CameraRecorder } from "../components/CameraRecorder";
import {
  TranscriptionPanel,
  type SubmissionControls,
  type SubmissionFeedback,
} from "../components/TranscriptionPanel";
import { extractAudioFromVideo } from "../lib/videoAudioExtraction";
import { clearLegacyWhisperCache } from "../lib/legacyWhisperCache";
import { LeetCodeProblemInput } from "../components/LeetCodeProblemInput";
import { parseLeetCodeProblemUrl } from "../lib/leetcode";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";
import { signOut } from "./actions";

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["mp4", "webm", "mov"];

type Status =
  | "idle"
  | "loading"
  | "processing"
  | "done"
  | "error"
  | "cancelled";

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return null;
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getAudioFileName(fileName: string, mimeType: string) {
  const mediaType = mimeType.split(";")[0].toLowerCase();
  const extension = mediaType.startsWith("audio/")
    ? mediaType.slice("audio/".length)
    : "audio";
  const audioExtension = extension === "mp4" ? "m4a" : extension;
  return `${fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?"<>|]/g, "-")}.${audioExtension}`;
}

function getAudioFormatLabel(mimeType: string) {
  const mediaType = mimeType.split(";")[0];
  return mediaType.startsWith("audio/")
    ? mediaType.slice("audio/".length).toUpperCase()
    : "Browser audio";
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="upload-icon"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M16 21V5m0 0L9.5 11.5M16 5l6.5 6.5M6 20v6h20v-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="file-icon"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13A1.75 1.75 0 0 0 6.75 20.25h10.5A1.75 1.75 0 0 0 19 18.5V9.25L13.5 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13 4v5.5h5.5M8.5 14h7m-7 3h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoAudioExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [durationStatus, setDurationStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("ready");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioFileName, setAudioFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [transcriptionSource, setTranscriptionSource] = useState<
    "upload" | "recording" | null
  >(null);
  const [leetcodeSubmissionUrl, setLeetcodeSubmissionUrl] = useState("");
  const [submissionFeedback, setSubmissionFeedback] =
    useState<SubmissionFeedback>({ status: "idle", message: "" });
  const [r2Upload, setR2Upload] = useState<{
    status: "idle" | "uploading" | "success" | "error";
    source: "upload" | "recording" | null;
    objectKey: string;
    message: string;
  }>({
    status: "idle",
    source: null,
    objectKey: "",
    message: "",
  });
  const [cameraR2Upload, setCameraR2Upload] = useState<{
    status: "waiting" | "uploading" | "success" | "error";
    objectKey: string;
    message: string;
  }>({
    status: "waiting",
    objectKey: "",
    message: "Waiting to upload recorded video to private storage…",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const uploadStatusRef = useRef<"idle" | "uploading" | "success" | "error">(
    "idle",
  );
  const uploadSignatureRef = useRef<string | null>(null);
  const submissionInFlightRef = useRef(false);
  const transcription = useTranscription();
  const recording = useRecording();
  const submissionLocked = submissionFeedback.status === "success";
  const submissionPending = submissionFeedback.status === "pending";
  const submissionInputsLocked = submissionLocked || submissionPending;
  const verifiedVideoObjectKey =
    transcriptionSource === "recording"
      ? cameraR2Upload.status === "success"
        ? cameraR2Upload.objectKey
        : ""
      : transcriptionSource === "upload" &&
          r2Upload.status === "success" &&
          r2Upload.source === "upload"
        ? r2Upload.objectKey
        : "";
  const parsedSubmissionUrl = parseLeetCodeProblemUrl(leetcodeSubmissionUrl);
  const canSubmitSolution =
    Boolean(parsedSubmissionUrl && verifiedVideoObjectKey) &&
    transcription.phase === "completed" &&
    transcription.transcript.trim().length > 0 &&
    !submissionInputsLocked;
  const submissionControls: SubmissionControls = {
    canSubmitSolution,
    submissionFeedback,
    onSubmitSolution: submitSolution,
  };
  const isExtracting = status === "loading" || status === "processing";
  const isBusy =
    isExtracting ||
    transcription.isBusy ||
    submissionInputsLocked ||
    recording.phase === "requesting" ||
    recording.phase === "recording" ||
    recording.phase === "stopping";
  const durationLabel = formatDuration(duration);

  function handleSubmissionUrlChange(url: string) {
    setLeetcodeSubmissionUrl(url);
    if (!submissionInputsLocked) {
      setSubmissionFeedback({ status: "idle", message: "" });
    }
  }

  async function submitSolution() {
    if (!canSubmitSolution || submissionInFlightRef.current) {
      return;
    }

    submissionInFlightRef.current = true;
    setSubmissionFeedback({
      status: "pending",
      message: "Submitting solution…",
    });

    try {
      const response = await fetch("/api/submissions/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leetcodeSubmissionUrl,
          videoObjectKey: verifiedVideoObjectKey,
          transcript: transcription.transcript,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        submitted?: unknown;
        message?: unknown;
      } | null;

      if (!response.ok || result?.submitted !== true) {
        setSubmissionFeedback({
          status: "error",
          message:
            typeof result?.message === "string"
              ? result.message
              : "The solution could not be submitted. Check the details and try again.",
        });
        return;
      }

      setSubmissionFeedback({
        status: "success",
        message: "Solution submitted successfully.",
      });
    } catch {
      setSubmissionFeedback({
        status: "error",
        message:
          "Could not reach the submission service. Retry with the same details to safely complete the submission.",
      });
    } finally {
      submissionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (!file) {
      return;
    }

    let active = true;
    const metadataUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (active && Number.isFinite(video.duration)) {
        setDuration(video.duration);
        setDurationStatus("ready");
      } else if (active) {
        setDuration(null);
        setDurationStatus("unavailable");
      }
    };
    video.onerror = () => {
      if (active) {
        setDurationStatus("unavailable");
      }
    };
    video.src = metadataUrl;

    return () => {
      active = false;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(metadataUrl);
    };
  }, [file]);

  useEffect(
    () => () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    },
    [audioUrl],
  );

  useEffect(() => () => extractionAbortRef.current?.abort(), []);

  useEffect(() => {
    void clearLegacyWhisperCache();
  }, []);

  function chooseFile(candidate: File) {
    if (submissionInputsLocked) {
      return;
    }
    setError("");

    const extension = getFileExtension(candidate.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setError("Choose an MP4, WebM, or MOV video file.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setError(
        `This file is larger than the ${MAX_FILE_SIZE_MB} MB limit. Choose a smaller video to continue.`,
      );
      return;
    }

    transcription.cancel();
    clearCameraR2UploadState();
    setTranscriptionSource("upload");
    setAudioBlob(null);
    if (recording.stream) {
      void recording.endSession();
    }
    setFile(candidate);
    setDuration(null);
    setDurationStatus("loading");
    setAudioUrl(null);
    setAudioFileName("");
    setProgress(0);
    setStatus("idle");
    setStatusMessage("");
    void uploadOriginalVideo(candidate, "upload");
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      chooseFile(selectedFile);
    }

    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (isBusy) {
      return;
    }

    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      chooseFile(droppedFile);
    }
  }

  function clearR2UploadState() {
    uploadSignatureRef.current = null;
    uploadStatusRef.current = "idle";
    setR2Upload({
      status: "idle",
      source: null,
      objectKey: "",
      message: "",
    });
  }

  function clearCameraR2UploadState() {
    setCameraR2Upload({
      status: "waiting",
      objectKey: "",
      message: "Waiting to upload recorded video to private storage…",
    });
  }

  function reset() {
    extractionAbortRef.current?.abort();
    transcription.cancel();
    clearR2UploadState();
    clearCameraR2UploadState();
    setTranscriptionSource(null);
    setAudioBlob(null);
    setFile(null);
    setAudioUrl(null);
    setAudioFileName("");
    setDuration(null);
    setStatus("idle");
    setStatusMessage("");
    setProgress(0);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function extractAudio() {
    if (!file || extractionAbortRef.current) {
      return;
    }

    const controller = new AbortController();
    extractionAbortRef.current = controller;
    const selectedFile = file;
    setError("");
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioFileName("");
    setProgress(0);

    try {
      setStatus("loading");
      setStatusMessage("Preparing local audio capture…");
      setStatus("processing");
      setStatusMessage("Capturing audio at playback speed…");

      const extractedAudio = await extractAudioFromVideo(
        selectedFile,
        ({ elapsedSeconds, durationSeconds, percent }) => {
          if (durationSeconds !== null) {
            setDuration(durationSeconds);
            setDurationStatus("ready");
          }
          setProgress(percent ?? 0);
          const elapsed = formatDuration(elapsedSeconds) ?? "0:00";
          const total = formatDuration(durationSeconds);
          setStatusMessage(
            total
              ? `Capturing audio · ${elapsed} / ${total} at playback speed`
              : `Capturing audio · ${elapsed} at playback speed`,
          );
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;

      setAudioBlob(extractedAudio);
      setAudioUrl(URL.createObjectURL(extractedAudio));
      setAudioFileName(
        getAudioFileName(selectedFile.name, extractedAudio.type),
      );
      setProgress(100);
      setStatus("done");
      setStatusMessage("Audio is ready for preview and transcription.");
    } catch (caughtError) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setStatusMessage("Audio extraction canceled.");
        setProgress(0);
        return;
      }

      const detail =
        caughtError instanceof Error
          ? caughtError.message
          : "An unexpected error occurred.";
      setStatus("error");
      setStatusMessage("");
      setError(detail);
    } finally {
      if (extractionAbortRef.current === controller) {
        extractionAbortRef.current = null;
      }
    }
  }

  function cancelAudioExtraction() {
    extractionAbortRef.current?.abort();
  }

  async function uploadOriginalVideo(
    video: Blob,
    source: "upload" | "recording",
  ) {
    const uploadFile =
      video instanceof File
        ? video
        : new File([video], `videomind-${source}.webm`, {
            type: video.type || "video/webm",
          });

    const signature = `${source}:${uploadFile.name}:${uploadFile.size}:${uploadFile.lastModified}:${uploadFile.type}`;
    if (
      uploadSignatureRef.current === signature &&
      (uploadStatusRef.current === "uploading" ||
        uploadStatusRef.current === "success")
    ) {
      return;
    }

    uploadSignatureRef.current = signature;
    uploadStatusRef.current = "uploading";
    if (source === "recording") {
      setCameraR2Upload({
        status: "uploading",
        objectKey: "",
        message: "Uploading recorded video to private storage…",
      });
    } else {
      setR2Upload({
        status: "uploading",
        source,
        objectKey: "",
        message: "Uploading original video to private storage…",
      });
    }

    try {
      const verifiedObjectKey = await uploadVideoToR2(uploadFile, (percent) => {
        if (source === "recording") {
          setCameraR2Upload({
            status: "uploading",
            objectKey: "",
            message: `Uploading recorded video to private storage… ${percent}%`,
          });
          return;
        }

        setR2Upload((current) =>
          current.source === source
            ? {
                ...current,
                status: "uploading",
                message: `Uploading original video to private storage… ${percent}%`,
              }
            : current,
        );
      });

      uploadStatusRef.current = "success";
      if (source === "recording") {
        setCameraR2Upload({
          status: "success",
          objectKey: verifiedObjectKey,
          message: "Recorded video upload verified in private storage.",
        });
      } else {
        setR2Upload({
          status: "success",
          source,
          objectKey: verifiedObjectKey,
          message: "Original video upload verified in private storage.",
        });
      }
    } catch (error) {
      uploadStatusRef.current = "error";
      if (source === "recording") {
        setCameraR2Upload({
          status: "error",
          objectKey: "",
          message:
            error instanceof Error
              ? error.message
              : "The recorded video upload could not be completed.",
        });
      } else {
        setR2Upload({
          status: "error",
          source,
          objectKey: "",
          message:
            error instanceof Error
              ? error.message
              : "The video upload could not be completed.",
        });
      }
    }
  }

  function prepareTranscriptionSource(source: "upload" | "recording") {
    if (transcription.isBusy) {
      transcription.cancel();
    } else {
      transcription.clearTranscript();
    }
    setTranscriptionSource(source);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Local Audio home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>local audio</span>
        </Link>
        <div className="topbar-actions">
          <div className="privacy-label">
            <span className="privacy-dot" />
            <span>Private by design</span>
          </div>
          <form action={signOut} className="signout-form">
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="workspace" aria-labelledby="page-title">
        <div className="intro">
          <p className="eyebrow">VIDEO TO AUDIO</p>
          <h1 id="page-title">
            Keep the sound.
            <br />
            Leave the video.
          </h1>
          <p className="intro-copy">
            Record or upload your explanation. The video is stored privately
            and transcribed in seconds; you can edit the transcript before you
            submit.
          </p>
        </div>

        <div className="extractor">
          <LeetCodeProblemInput
            submissionUrl={leetcodeSubmissionUrl}
            disabled={submissionInputsLocked}
            onSubmissionUrlChange={handleSubmissionUrlChange}
          />
          <CameraRecorder
            recording={recording}
            transcription={transcription}
            showTranscript={transcriptionSource === "recording"}
            cameraR2Upload={cameraR2Upload}
            submissionControls={submissionControls}
            disabled={
              status === "loading" ||
              status === "processing" ||
              transcription.isBusy ||
              submissionInputsLocked
            }
            onStartRecording={() => {
              prepareTranscriptionSource("recording");
              clearCameraR2UploadState();
            }}
            onRecordingComplete={(recordedAudio, recordedVideo) => {
              if (recordedAudio.size) setTranscriptionSource("recording");
              if (recordedVideo) {
                void uploadOriginalVideo(recordedVideo, "recording");
              }
            }}
            onRetake={() => {
              prepareTranscriptionSource("recording");
              clearCameraR2UploadState();
            }}
          />

          <div
            className={`drop-zone${isDragging ? " is-dragging" : ""}${isBusy ? " is-disabled" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isBusy) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
              onChange={handleFileInput}
              disabled={isBusy}
              aria-label="Choose a video file"
            />
            <div className="upload-symbol">
              <UploadIcon />
            </div>
            <div className="drop-copy">
              <p className="drop-title">Drop your video here</p>
              <p className="drop-subtitle">or choose a file from your device</p>
            </div>
            <button
              className="button button-secondary browse-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
            >
              Browse files
            </button>
            <p className="file-types">
              MP4, WebM, MOV <span aria-hidden="true">·</span> up to{" "}
              {MAX_FILE_SIZE_MB} MB
            </p>
          </div>

          <div className="memory-note">
            <span className="note-icon" aria-hidden="true">
              i
            </span>
            <p>
              Large videos can use substantial browser memory. For the smoothest
              experience, use a smaller file when possible.
            </p>
          </div>

          {error && (
            <div className="error-message" role="alert">
              <span className="error-mark" aria-hidden="true">
                !
              </span>
              <p>{error}</p>
            </div>
          )}

          {r2Upload.message && (
            <div
              className={`error-message${r2Upload.status === "success" ? " success-message" : ""}`}
              role={r2Upload.status === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              <span className="error-mark" aria-hidden="true">
                {r2Upload.status === "success" ? "✓" : "!"}
              </span>
              <p>
                {r2Upload.message}
                {r2Upload.objectKey && (
                  <>
                    <br />
                    Verified object key: {r2Upload.objectKey}
                  </>
                )}
              </p>
            </div>
          )}

          {file && (
            <section className="file-panel" aria-label="Selected video">
              <div className="file-heading">
                <div className="file-identity">
                  <span className="file-icon-wrap">
                    <FileIcon />
                  </span>
                  <div className="file-name-wrap">
                    <p className="file-name" title={file.name}>
                      {file.name}
                    </p>
                    <p className="file-meta">
                      {formatFileSize(file.size)}
                      <span aria-hidden="true">·</span>
                      {durationStatus === "loading"
                        ? "Reading duration…"
                        : (durationLabel ?? "Duration unavailable")}
                    </p>
                  </div>
                </div>
                <button
                  className="text-button remove-button"
                  type="button"
                  onClick={reset}
                  disabled={isBusy}
                  aria-label="Remove video and start over"
                >
                  Remove
                </button>
              </div>

              {(status === "loading" || status === "processing") && (
                <div className="progress-area" aria-live="polite">
                  <div className="progress-labels">
                    <span>{statusMessage}</span>
                    <span>{progress}%</span>
                  </div>
                  <progress
                    className="progress-bar"
                    max={100}
                    value={progress}
                    aria-label="Audio extraction progress"
                  />
                </div>
              )}

              {status === "done" && audioUrl && (
                <div className="result-panel" aria-live="polite">
                  <div className="result-heading">
                    <div>
                      <p className="result-title">Audio extracted</p>
                      <p className="result-meta">
                        {getAudioFormatLabel(audioBlob?.type ?? "")} · browser
                        encoded
                      </p>
                    </div>
                    <span className="ready-badge">Ready</span>
                  </div>
                  <audio
                    className="audio-player"
                    controls
                    preload="metadata"
                    src={audioUrl}
                    aria-label="Preview extracted audio"
                  />
                  <div className="result-actions">
                    <a
                      className="button button-primary download-button"
                      href={audioUrl}
                      download={audioFileName}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 13.5v3h12v-3"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Download audio
                    </a>
                    <button
                      className="text-button"
                      type="button"
                      onClick={reset}
                      disabled={submissionInputsLocked}
                    >
                      Start over
                    </button>
                  </div>

                </div>
              )}

              {transcriptionSource === "upload" && (
                  <TranscriptionPanel
                    transcription={transcription}
                    videoObjectKey={
                      r2Upload.status === "success" &&
                      r2Upload.source === "upload"
                        ? r2Upload.objectKey
                        : ""
                    }
                    fileName={audioFileName || file.name}
                    {...submissionControls}
                  />
                )}

              {status !== "done" && (
                <div className="file-actions">
                  <button
                    className="button button-primary extract-button"
                    type="button"
                    onClick={extractAudio}
                    disabled={isBusy}
                  >
                    {isExtracting ? (
                      <>
                        <span className="spinner" aria-hidden="true" />
                        {status === "loading"
                          ? "Preparing audio…"
                          : "Capturing audio…"}
                      </>
                    ) : (
                      <>
                        Extract audio
                        <span className="button-arrow" aria-hidden="true">
                          →
                        </span>
                      </>
                    )}
                  </button>
                  {isExtracting ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={cancelAudioExtraction}
                    >
                      Cancel extraction
                    </button>
                  ) : (
                    <p
                      className="conversion-note"
                      role={status === "cancelled" ? "status" : undefined}
                    >
                      {status === "cancelled"
                        ? statusMessage
                        : "Local audio capture · runs at playback speed"}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          <div className="privacy-footnote">
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1.75 2.75 4v3.75c0 3.1 2.2 5.5 5.25 6.5 3.05-1 5.25-3.4 5.25-6.5V4L8 1.75Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="m5.75 7.9 1.5 1.5 3-3.1"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              Videos are stored privately. Audio is sent to Deepgram only to be
              transcribed, with model-training opt-out.
            </span>
          </div>
        </div>

        <footer className="page-footer">
          <span>Simple tools. Your files stay yours.</span>
          <span>Private storage · Deepgram transcription</span>
        </footer>
      </section>
    </main>
  );
}

export default function Home() {
  return <VideoAudioExtractor />;
}
