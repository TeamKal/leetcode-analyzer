"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { AppHeader } from "@/components/ui/AppHeader";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";
import { CameraRecorder } from "../CameraRecorder";
import { LeetCodeProblemInput } from "../LeetCodeProblemInput";
import {
  TranscriptionPanel,
  type SubmissionFeedback,
} from "../TranscriptionPanel";
import { useRecording } from "../../hooks/useRecording";
import { useTranscription } from "../../hooks/useTranscription";
import { clearLegacyWhisperCache } from "../../lib/legacyWhisperCache";
import { formatDuration, formatFileSize, getFileExtension } from "../../lib/format";
import { parseLeetCodeProblemUrl } from "../../lib/leetcode";
import { SubmitStep } from "./SubmitStep";
import type { UploadState } from "./UploadStatus";
import { VideoStep, type VideoTab } from "./VideoStep";

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["mp4", "webm", "mov"];

type StoredUpload = {
  status: "idle" | "uploading" | "success" | "error";
  source: "upload" | "recording" | null;
  objectKey: string;
  percent: number | null;
  message: string;
};

const NO_UPLOAD: StoredUpload = {
  status: "idle",
  source: null,
  objectKey: "",
  percent: null,
  message: "",
};

function toUploadState(upload: StoredUpload): UploadState {
  return {
    status: upload.status,
    percent: upload.percent,
    message: upload.message,
  };
}

/**
 * The student's submit page: pick a problem, add a video, check the transcript,
 * submit. All state and side effects live here; the steps are presentational.
 */
export function SubmitWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [durationLoading, setDurationLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [tab, setTab] = useState<VideoTab>("record");
  const [transcriptionSource, setTranscriptionSource] = useState<
    "upload" | "recording" | null
  >(null);
  const [leetcodeSubmissionUrl, setLeetcodeSubmissionUrl] = useState("");
  const [submissionFeedback, setSubmissionFeedback] =
    useState<SubmissionFeedback>({ status: "idle", message: "" });
  const [fileUpload, setFileUpload] = useState<StoredUpload>(NO_UPLOAD);
  const [cameraUpload, setCameraUpload] = useState<StoredUpload>(NO_UPLOAD);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      ? cameraUpload.status === "success"
        ? cameraUpload.objectKey
        : ""
      : transcriptionSource === "upload" &&
          fileUpload.status === "success" &&
          fileUpload.source === "upload"
        ? fileUpload.objectKey
        : "";
  const parsedSubmissionUrl = parseLeetCodeProblemUrl(leetcodeSubmissionUrl);
  const transcriptReady =
    transcription.phase === "completed" &&
    transcription.transcript.trim().length > 0;
  const canSubmitSolution =
    Boolean(parsedSubmissionUrl && verifiedVideoObjectKey) &&
    transcriptReady &&
    !submissionInputsLocked;
  const isBusy =
    transcription.isBusy ||
    submissionInputsLocked ||
    recording.phase === "requesting" ||
    recording.phase === "recording" ||
    recording.phase === "stopping";

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

  // Read the chosen file's length for the file card.
  useEffect(() => {
    if (!file) {
      return;
    }

    let active = true;
    const metadataUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (!active) return;
      setDuration(Number.isFinite(video.duration) ? video.duration : null);
      setDurationLoading(false);
    };
    video.onerror = () => {
      if (active) setDurationLoading(false);
    };
    video.src = metadataUrl;

    return () => {
      active = false;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(metadataUrl);
    };
  }, [file]);

  useEffect(() => {
    void clearLegacyWhisperCache();
  }, []);

  function chooseFile(candidate: File) {
    if (submissionInputsLocked) {
      return;
    }
    setFileError("");

    const extension = getFileExtension(candidate.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setFileError("Choose an MP4, WebM or MOV video file.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setFileError(
        `This file is larger than the ${MAX_FILE_SIZE_MB} MB limit. Choose a smaller video to continue.`,
      );
      return;
    }

    transcription.cancel();
    setCameraUpload(NO_UPLOAD);
    setTranscriptionSource("upload");
    if (recording.stream) {
      void recording.endSession();
    }
    setFile(candidate);
    setDuration(null);
    setDurationLoading(true);
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

  function clearFileUploadState() {
    uploadSignatureRef.current = null;
    uploadStatusRef.current = "idle";
    setFileUpload(NO_UPLOAD);
  }

  function resetUpload() {
    transcription.cancel();
    clearFileUploadState();
    setCameraUpload(NO_UPLOAD);
    setTranscriptionSource(null);
    setFile(null);
    setDuration(null);
    setDurationLoading(false);
    setFileError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function uploadOriginalVideo(
    video: Blob,
    source: "upload" | "recording",
  ) {
    const uploadFile =
      video instanceof File
        ? video
        : new File([video], `recording-${source}.webm`, {
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
    const setUpload = source === "recording" ? setCameraUpload : setFileUpload;
    setUpload({
      status: "uploading",
      source,
      objectKey: "",
      percent: 0,
      message: "",
    });

    try {
      const verifiedObjectKey = await uploadVideoToR2(uploadFile, (percent) => {
        setUpload((current) =>
          current.source === source
            ? { ...current, status: "uploading", percent }
            : current,
        );
      });

      uploadStatusRef.current = "success";
      setUpload({
        status: "success",
        source,
        objectKey: verifiedObjectKey,
        percent: 100,
        message: "",
      });
    } catch (error) {
      uploadStatusRef.current = "error";
      setUpload({
        status: "error",
        source,
        objectKey: "",
        percent: null,
        message:
          error instanceof Error
            ? error.message
            : "The video could not be uploaded. Please try again.",
      });
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

  const videoDone = Boolean(verifiedVideoObjectKey);
  const meta = file
    ? [
        formatFileSize(file.size),
        durationLoading ? "Reading length…" : formatDuration(duration),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader signOutAction={signOut} />

      <main className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Submit your solution
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          Explain your approach out loud. We transcribe it, give you an AI score
          right away, and your mentor gives the final grade.
        </p>

        <div className="mt-8 space-y-4">
          <LeetCodeProblemInput
            submissionUrl={leetcodeSubmissionUrl}
            disabled={submissionInputsLocked}
            onSubmissionUrlChange={handleSubmissionUrlChange}
          />

          <VideoStep
            tab={tab}
            onTabChange={setTab}
            done={videoDone}
            recordPane={
              <CameraRecorder
                recording={recording}
                cameraUpload={toUploadState(cameraUpload)}
                disabled={transcription.isBusy || submissionInputsLocked}
                onStartRecording={() => {
                  prepareTranscriptionSource("recording");
                  setCameraUpload(NO_UPLOAD);
                }}
                onRecordingComplete={(recordedAudio, recordedVideo) => {
                  if (recordedAudio.size) setTranscriptionSource("recording");
                  if (recordedVideo) {
                    void uploadOriginalVideo(recordedVideo, "recording");
                  }
                }}
                onRetake={() => {
                  prepareTranscriptionSource("recording");
                  setCameraUpload(NO_UPLOAD);
                }}
              />
            }
            file={file ? { name: file.name, meta } : null}
            uploadState={toUploadState(fileUpload)}
            fileError={fileError}
            isDragging={isDragging}
            disabled={isBusy}
            maxMb={MAX_FILE_SIZE_MB}
            inputRef={fileInputRef}
            onFileInput={handleFileInput}
            onBrowse={() => fileInputRef.current?.click()}
            onRemove={resetUpload}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!isBusy) setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget as Node | null)
              ) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          />

          <TranscriptionPanel
            transcription={transcription}
            videoObjectKey={verifiedVideoObjectKey}
            fileName={
              transcriptionSource === "upload" && file ? file.name : "transcript"
            }
            hasVideo={transcriptionSource !== null}
            locked={submissionInputsLocked}
          />

          <SubmitStep
            items={[
              { label: "Problem link added", done: Boolean(parsedSubmissionUrl) },
              { label: "Video saved privately", done: videoDone },
              { label: "Transcript ready", done: transcriptReady },
            ]}
            canSubmit={canSubmitSolution}
            feedback={submissionFeedback}
            onSubmit={() => void submitSolution()}
            onAnother={() => window.location.reload()}
          />
        </div>
      </main>
    </div>
  );
}
