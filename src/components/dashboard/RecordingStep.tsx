"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { useRecording } from "@/hooks/useRecording";
import { Magnet } from "./Magnet";
import "./effects.css";

type Props = {
  recording: ReturnType<typeof useRecording>;
  /** True while a submission is running or finished: the recording is then locked. */
  locked: boolean;
};

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function CameraGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7 text-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 6-3v9l-6-3" />
    </svg>
  );
}

function Chip({ tone, children }: { tone: "neutral" | "good" | "live"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    good: "bg-success-soft text-success-text",
    live: "bg-brand-soft text-brand-text",
  } as const;
  return (
    <span
      className={`chip-pop inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Step 2: record the explanation with the camera. This uses the browser's real
 * recording (permissions, a live preview, start and stop, playback of what was
 * recorded). The enable button disappears only once both the camera and the
 * microphone have been allowed. The camera and microphone are released when the
 * page is left.
 */
export function RecordingStep({ recording, locked }: Props) {
  const { phase, stream, videoUrl, elapsedSeconds, error } = recording;
  const hasStream = Boolean(stream);
  const showLive = phase === "ready" || phase === "recording" || phase === "stopping";
  const showPlayback = phase === "recorded" && Boolean(videoUrl);

  return (
    <div>
      {/* Status, above the frame. */}
      <div className="mb-3 flex min-h-[28px] items-center gap-2" aria-live="polite">
        {phase === "requesting" && <Chip tone="neutral">Waiting for your browser…</Chip>}
        {phase === "ready" && <Chip tone="good">Camera and microphone ready</Chip>}
        {phase === "recording" && (
          <Chip tone="live">
            <span className="size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
            Recording · {clock(elapsedSeconds)}
          </Chip>
        )}
        {phase === "stopping" && <Chip tone="neutral">Finishing your recording…</Chip>}
        {showPlayback && <Chip tone="good">Recording saved · {clock(elapsedSeconds)}</Chip>}
      </div>

      {/* The recording frame. */}
      <div className="relative aspect-video w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface-2">
        {showLive && (
          <video
            key="live"
            ref={(element) => {
              if (element && element.srcObject !== stream) element.srcObject = stream;
            }}
            autoPlay
            muted
            playsInline
            aria-label="Live camera preview"
            // Mirrored, like a mirror, so it feels natural to speak to.
            className="size-full -scale-x-100 object-cover"
          />
        )}
        {showPlayback && (
          <video
            key="playback"
            src={videoUrl ?? undefined}
            controls
            playsInline
            aria-label="Your recording"
            className="size-full bg-black object-contain"
          />
        )}
        {!showLive && !showPlayback && (
          <div className="grid size-full place-items-center px-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <CameraGlyph />
              <p className="max-w-[34ch] text-sm leading-6 text-muted">
                {phase === "requesting"
                  ? "Your browser is asking for permission. Choose Allow to continue."
                  : "Turn on your camera and microphone to record your explanation."}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Actions. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!hasStream && phase !== "recorded" && (
          <Button
            onClick={() => void recording.requestAccess()}
            disabled={phase === "requesting" || locked}
            aria-busy={phase === "requesting"}
          >
            {phase === "requesting" ? (
              <>
                <Spinner />
                Waiting for permission…
              </>
            ) : phase === "error" ? (
              "Try again"
            ) : (
              "Enable Camera & Microphone"
            )}
          </Button>
        )}

        {phase === "ready" && (
          <Magnet>
            <Button onClick={recording.startRecording} disabled={locked}>
              <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
              Start Recording
            </Button>
          </Magnet>
        )}

        {phase === "recording" && (
          <Button variant="danger" onClick={() => void recording.stopRecording()}>
            <span className="size-2 rounded-[2px] bg-white" aria-hidden="true" />
            Stop Recording
          </Button>
        )}

        {phase === "recorded" && (
          <>
            <Button variant="secondary" onClick={recording.retake} disabled={locked}>
              Record again
            </Button>
            {hasStream && (
              <Button
                variant="ghost"
                onClick={() => void recording.endSession()}
                disabled={locked}
              >
                Turn camera off
              </Button>
            )}
          </>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-faint">
        Explain what the problem asks, how you solve it, and why it works. Your camera
        and microphone are used only while you record.
      </p>
    </div>
  );
}
