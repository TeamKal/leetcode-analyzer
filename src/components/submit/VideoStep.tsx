"use client";

import type { ChangeEvent, DragEvent, ReactNode, RefObject } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StepCard } from "@/components/ui/StepCard";
import { Tabs } from "@/components/ui/Tabs";
import { UploadStatus, type UploadState } from "./UploadStatus";

export type VideoTab = "record" | "upload";

export type UploadedFile = {
  name: string;
  /** Preformatted, e.g. "38.4 MB · 0:48". */
  meta: string;
};

type Props = {
  tab: VideoTab;
  onTabChange: (tab: VideoTab) => void;
  done: boolean;
  /** The camera recorder. */
  recordPane: ReactNode;
  // Upload tab
  file: UploadedFile | null;
  uploadState: UploadState;
  fileError: string;
  isDragging: boolean;
  disabled: boolean;
  maxMb: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onBrowse: () => void;
  onRemove: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

function UploadGlyph() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-7 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 21V5m0 0L9.5 11.5M16 5l6.5 6.5M6 20v6h20v-6" />
    </svg>
  );
}

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13a1.75 1.75 0 0 0 1.75 1.75h10.5A1.75 1.75 0 0 0 19 18.5V9.25l-5.5-5.5Z" />
      <path d="M13 4v5.5h5.5" />
    </svg>
  );
}

/** Step 2: record with the camera, or upload a video file. */
export function VideoStep({
  tab,
  onTabChange,
  done,
  recordPane,
  file,
  uploadState,
  fileError,
  isDragging,
  disabled,
  maxMb,
  inputRef,
  onFileInput,
  onBrowse,
  onRemove,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <StepCard
      number={2}
      title="Add your video"
      description="Explain your approach out loud: what the problem asks, how you solve it, and why it works."
      state={done ? "done" : "active"}
    >
      <Tabs
        label="How do you want to add your video?"
        idPrefix="video"
        value={tab}
        onChange={onTabChange}
        tabs={[
          { id: "record", label: "Record" },
          { id: "upload", label: "Upload" },
        ]}
      />

      <div
        className="mt-4"
        role="tabpanel"
        id={`video-panel-${tab}`}
        aria-labelledby={`video-tab-${tab}`}
      >
        {tab === "record" && recordPane}

        {tab === "upload" && (
          <div className="space-y-4">
            {!file ? (
              <div
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
                  isDragging
                    ? "border-brand bg-brand-soft"
                    : "border-line-strong bg-surface-2"
                } ${disabled ? "opacity-60" : ""}`}
              >
                <input
                  ref={inputRef}
                  className="sr-only"
                  type="file"
                  accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
                  onChange={onFileInput}
                  disabled={disabled}
                  aria-label="Choose a video file"
                />
                <UploadGlyph />
                <div>
                  <p className="text-[15px] font-semibold">Drop your video here</p>
                  <p className="mt-0.5 text-sm text-muted">
                    or choose a file from your device
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={onBrowse}
                >
                  Browse files
                </Button>
                <p className="text-xs text-faint">
                  MP4, WebM or MOV, up to {maxMb} MB
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2">
                      <FileGlyph />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-semibold"
                        title={file.name}
                      >
                        {file.name}
                      </p>
                      <p className="text-xs text-muted">{file.meta}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={onRemove}
                    aria-label="Remove this video and choose another"
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-4">
                  <UploadStatus upload={uploadState} />
                </div>
              </div>
            )}

            {fileError && <Alert>{fileError}</Alert>}
          </div>
        )}
      </div>
    </StepCard>
  );
}
