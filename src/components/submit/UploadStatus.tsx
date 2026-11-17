import { Alert } from "@/components/ui/Alert";
import { ProgressBar } from "@/components/ui/ProgressBar";

export type UploadState = {
  status: "waiting" | "idle" | "uploading" | "success" | "error";
  /** 0-100 while uploading, when known. */
  percent: number | null;
  /** Shown for errors. */
  message: string;
};

/** Where the video is on its way to private storage. */
export function UploadStatus({ upload }: { upload: UploadState }) {
  if (upload.status === "waiting" || upload.status === "idle") return null;

  if (upload.status === "error") {
    return (
      <Alert>
        {upload.message ||
          "The video could not be uploaded. Please try again."}
      </Alert>
    );
  }

  if (upload.status === "success") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-sm text-success-text"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
        Saved to private storage
      </p>
    );
  }

  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-2">Uploading to private storage…</span>
        {upload.percent !== null && (
          <span className="tabular-nums text-muted">{upload.percent}%</span>
        )}
      </div>
      <ProgressBar
        label="Video upload progress"
        value={upload.percent ?? undefined}
      />
    </div>
  );
}
