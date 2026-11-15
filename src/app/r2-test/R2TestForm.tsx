"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import { uploadVideoToR2 } from "@/lib/r2/uploadVideo";

type UploadState = "ready" | "uploading" | "success" | "error";

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function R2TestForm() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("ready");
  const [message, setMessage] = useState("");
  const [objectKey, setObjectKey] = useState("");

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setMessage("");
    setObjectKey("");
    setState("ready");
  }

  async function uploadAndVerify() {
    if (!file || state === "uploading") return;

    setState("uploading");
    setMessage("Uploading video and verifying it in private storage…");
    setObjectKey("");

    try {
      const verifiedObjectKey = await uploadVideoToR2(file);
      setObjectKey(verifiedObjectKey);
      setMessage("Upload completed and the stored object was verified.");
      setState("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The video upload could not be completed.",
      );
      setState("error");
    }
  }

  return (
    <div className="r2-test-form">
      <label className="r2-test-file-field">
        Video file
        <input
          type="file"
          accept="video/mp4,video/webm,.mp4,.webm"
          onChange={chooseFile}
          disabled={state === "uploading"}
        />
      </label>

      {file && (
        <dl className="r2-test-file-details">
          <div>
            <dt>Name</dt>
            <dd>{file.name}</dd>
          </div>
          <div>
            <dt>MIME type</dt>
            <dd>{file.type || "Not provided by browser"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatFileSize(file.size)}</dd>
          </div>
        </dl>
      )}

      <button
        className="button button-primary r2-test-upload-button"
        type="button"
        onClick={() => void uploadAndVerify()}
        disabled={!file || state === "uploading"}
      >
        {state === "uploading"
          ? "Uploading and verifying…"
          : "Upload and verify"}
      </button>

      {message && (
        <p
          className={`r2-test-message${state === "error" ? " is-error" : ""}`}
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      )}

      {objectKey && (
        <p className="r2-test-object-key">
          Verified object key: <code>{objectKey}</code>
        </p>
      )}

      <Link className="r2-test-back-link" href="/">
        Back to Local Audio
      </Link>
    </div>
  );
}
