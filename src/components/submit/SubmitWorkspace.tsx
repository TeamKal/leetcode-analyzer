"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions";
import { AppHeader } from "@/components/ui/AppHeader";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";
import { CameraRecorder } from "../CameraRecorder";
import { LeetCodeProblemInput } from "../LeetCodeProblemInput";
import { useRecording } from "../../hooks/useRecording";
import { clearLegacyWhisperCache } from "../../lib/legacyWhisperCache";
import { parseLeetCodeProblemUrl } from "../../lib/leetcode";
import { RecordStep } from "./RecordStep";
import { SubmitStep, type SubmissionFeedback } from "./SubmitStep";
import type { UploadState } from "./UploadStatus";

type StoredUpload = {
  status: "idle" | "uploading" | "success" | "error";
  objectKey: string;
  percent: number | null;
  message: string;
};

const NO_UPLOAD: StoredUpload = {
  status: "idle",
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
 * The student's submit page: pick a problem, record the explanation with the
 * camera, submit. The transcript is made on the server and is never shown to
 * the student. All state and side effects live here; the steps are presentational.
 */
export function SubmitWorkspace() {
  const [leetcodeSubmissionUrl, setLeetcodeSubmissionUrl] = useState("");
  const [submissionFeedback, setSubmissionFeedback] =
    useState<SubmissionFeedback>({ status: "idle", message: "" });
  const [cameraUpload, setCameraUpload] = useState<StoredUpload>(NO_UPLOAD);
  const uploadSignatureRef = useRef<string | null>(null);
  const uploadStatusRef = useRef<"idle" | "uploading" | "success" | "error">(
    "idle",
  );
  const submissionInFlightRef = useRef(false);
  const recording = useRecording();

  const submissionLocked = submissionFeedback.status === "success";
  const submissionPending = submissionFeedback.status === "pending";
  const submissionInputsLocked = submissionLocked || submissionPending;
  const verifiedVideoObjectKey =
    cameraUpload.status === "success" ? cameraUpload.objectKey : "";
  const parsedSubmissionUrl = parseLeetCodeProblemUrl(leetcodeSubmissionUrl);
  const canSubmitSolution =
    Boolean(parsedSubmissionUrl && verifiedVideoObjectKey) &&
    !submissionInputsLocked;

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
          "Could not reach the submission service. Try again to safely complete the submission.",
      });
    } finally {
      submissionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    void clearLegacyWhisperCache();
  }, []);

  async function uploadRecording(video: Blob) {
    const uploadFile =
      video instanceof File
        ? video
        : new File([video], "recording.webm", {
            type: video.type || "video/webm",
          });

    const signature = `${uploadFile.size}:${uploadFile.lastModified}:${uploadFile.type}`;
    if (
      uploadSignatureRef.current === signature &&
      (uploadStatusRef.current === "uploading" ||
        uploadStatusRef.current === "success")
    ) {
      return;
    }

    uploadSignatureRef.current = signature;
    uploadStatusRef.current = "uploading";
    setCameraUpload({
      status: "uploading",
      objectKey: "",
      percent: 0,
      message: "",
    });

    try {
      const verifiedObjectKey = await uploadVideoToR2(uploadFile, (percent) => {
        setCameraUpload((current) => ({
          ...current,
          status: "uploading",
          percent,
        }));
      });

      uploadStatusRef.current = "success";
      setCameraUpload({
        status: "success",
        objectKey: verifiedObjectKey,
        percent: 100,
        message: "",
      });
    } catch (error) {
      uploadStatusRef.current = "error";
      setCameraUpload({
        status: "error",
        objectKey: "",
        percent: null,
        message:
          error instanceof Error
            ? error.message
            : "The video could not be uploaded. Please try again.",
      });
    }
  }

  function resetRecordingUpload() {
    uploadSignatureRef.current = null;
    uploadStatusRef.current = "idle";
    setCameraUpload(NO_UPLOAD);
  }

  return (
    <div className="ds min-h-screen bg-page font-sans text-ink antialiased">
      <AppHeader
        signOutAction={signOut}
        links={[{ href: "/submissions", label: "My submissions" }]}
      />

      <main className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[34px]">
          Submit your solution
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] leading-7 text-muted">
          Record yourself explaining your approach out loud. You get an AI score
          as a first look, and your mentor gives the final grade.
        </p>

        <div className="mt-8 space-y-4">
          <LeetCodeProblemInput
            submissionUrl={leetcodeSubmissionUrl}
            disabled={submissionInputsLocked}
            onSubmissionUrlChange={handleSubmissionUrlChange}
          />

          <RecordStep done={Boolean(verifiedVideoObjectKey)}>
            <CameraRecorder
              recording={recording}
              cameraUpload={toUploadState(cameraUpload)}
              disabled={submissionInputsLocked}
              onStartRecording={resetRecordingUpload}
              onRecordingComplete={(_recordedAudio, recordedVideo) => {
                if (recordedVideo) void uploadRecording(recordedVideo);
              }}
              onRetake={resetRecordingUpload}
            />
          </RecordStep>

          <SubmitStep
            items={[
              { label: "Problem link added", done: Boolean(parsedSubmissionUrl) },
              {
                label: "Recording saved privately",
                done: Boolean(verifiedVideoObjectKey),
              },
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
