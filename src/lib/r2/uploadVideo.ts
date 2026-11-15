"use client";

import {
  isSupportedVideoType,
  isValidVideoSize,
  normalizeVideoMimeType,
} from "./constants";

type UploadUrlResponse = {
  uploadUrl?: unknown;
  objectKey?: unknown;
  contentLength?: unknown;
  headers?: unknown;
};

type VerifyResponse = {
  verified?: unknown;
  objectKey?: unknown;
};

const OBJECT_ALREADY_EXISTS_ERROR = "R2_OBJECT_ALREADY_EXISTS";
const CONDITIONAL_UPLOAD_CONFLICT_ERROR = "R2_CONDITIONAL_UPLOAD_CONFLICT";

async function postJson<T>(url: string, body: unknown, fallback: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(fallback);
  }

  let payload: T | null = null;
  try {
    payload = (await response.json()) as T;
  } catch {
    // The safe fallback below handles non-JSON API responses.
  }

  if (!response.ok || payload === null) {
    throw new Error(fallback);
  }
  return payload;
}

export async function uploadVideoToR2(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const normalizedMimeType = normalizeVideoMimeType(file.type);
  if (!normalizedMimeType || !isValidVideoSize(file.size)) {
    throw new Error("Choose an MP4 or WebM video no larger than 100 MB.");
  }

  const uploadDetails = await postJson<UploadUrlResponse>(
    "/api/videos/upload-url",
    { contentType: normalizedMimeType, fileSize: file.size },
    "Could not prepare the video upload.",
  );

  if (
    typeof uploadDetails.uploadUrl !== "string" ||
    typeof uploadDetails.objectKey !== "string" ||
    uploadDetails.contentLength !== file.size ||
    typeof uploadDetails.headers !== "object" ||
    uploadDetails.headers === null ||
    !("Content-Type" in uploadDetails.headers) ||
    uploadDetails.headers["Content-Type"] !== normalizedMimeType ||
    !("If-None-Match" in uploadDetails.headers) ||
    uploadDetails.headers["If-None-Match"] !== "*"
  ) {
    throw new Error("The server returned invalid upload details.");
  }

  let uploadUrl: URL;
  try {
    uploadUrl = new URL(uploadDetails.uploadUrl);
  } catch {
    throw new Error("The server returned invalid upload details.");
  }
  if (
    uploadUrl.protocol !== "https:" ||
    !uploadUrl.hostname.endsWith(".r2.cloudflarestorage.com")
  ) {
    throw new Error("The server returned invalid upload details.");
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl.toString());
      xhr.setRequestHeader("Content-Type", normalizedMimeType);
      xhr.setRequestHeader("If-None-Match", "*");
      xhr.upload.onprogress = (event) => {
        if (onProgress && event.lengthComputable) {
          const percent = Math.min(
            100,
            Math.round((event.loaded / event.total) * 100),
          );
          onProgress(percent);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        if (xhr.status === 412) {
          reject(new Error(OBJECT_ALREADY_EXISTS_ERROR));
          return;
        }
        if (xhr.status === 409) {
          reject(new Error(CONDITIONAL_UPLOAD_CONFLICT_ERROR));
          return;
        }
        reject(new Error("The video could not be uploaded to storage."));
      };
      xhr.onerror = () => {
        reject(new Error("The video could not be uploaded to storage."));
      };
      xhr.send(file);
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === OBJECT_ALREADY_EXISTS_ERROR
    ) {
      throw new Error(
        "This upload key already has a video. The existing video was not overwritten; start a new upload.",
      );
    }
    if (
      error instanceof Error &&
      error.message === CONDITIONAL_UPLOAD_CONFLICT_ERROR
    ) {
      throw new Error(
        "This upload conflicted with another request. Start a new upload and try again.",
      );
    }
    throw new Error("The video could not be uploaded to storage.");
  }

  const verification = await postJson<VerifyResponse>(
    "/api/videos/verify",
    { objectKey: uploadDetails.objectKey },
    "The uploaded video could not be verified.",
  );
  if (
    verification.verified !== true ||
    verification.objectKey !== uploadDetails.objectKey
  ) {
    throw new Error("The uploaded video could not be verified.");
  }

  return uploadDetails.objectKey;
}
