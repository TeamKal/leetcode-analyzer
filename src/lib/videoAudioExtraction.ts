export type AudioExtractionProgress = {
  elapsedSeconds: number;
  durationSeconds: number | null;
  percent: number | null;
};

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
];

function makeAbortError() {
  return new DOMException("Audio extraction was canceled.", "AbortError");
}

function getVideoError(video: HTMLVideoElement) {
  if (video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return new Error(
      "This browser cannot decode the video or audio codec in this file.",
    );
  }
  return new Error("The video could not be decoded for audio extraction.");
}

function hasNoAudioTracks(video: HTMLVideoElement) {
  const audioTracks = (
    video as HTMLVideoElement & { audioTracks?: { length: number } }
  ).audioTracks;
  return audioTracks !== undefined && audioTracks.length === 0;
}

function waitForPlayback(
  video: HTMLVideoElement,
  playback: Promise<void>,
  captureFailed: Promise<void>,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onEnded = () => finish();
    const onError = () => finish(getVideoError(video));
    const onAbort = () => finish(makeAbortError());

    video.addEventListener("ended", onEnded, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });

    playback.catch((error: unknown) => {
      const message =
        error instanceof Error && error.name === "NotAllowedError"
          ? "Playback was blocked by the browser. Start extraction again from the button."
          : "The browser could not play this video for audio extraction.";
      finish(new Error(message));
    });
    captureFailed.catch((error: unknown) => {
      finish(
        error instanceof Error
          ? error
          : new Error("Audio capture failed unexpectedly."),
      );
    });

    if (signal.aborted) onAbort();
    else if (video.ended) onEnded();
  });
}

export async function extractAudioFromVideo(
  file: File,
  onProgress: (progress: AudioExtractionProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw makeAbortError();
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    throw new Error("This browser does not support local audio extraction.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error(
      "This browser does not support recording extracted audio. Use a recent browser.",
    );
  }

  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;

  let context: AudioContext | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let recorder: MediaRecorder | null = null;
  let recorderStarted = false;
  let recorderError = "";
  const chunks: Blob[] = [];
  const playbackController = new AbortController();
  const forwardAbort = () => playbackController.abort();
  let rejectCaptureFailed = (_error: Error) => {};
  const captureFailed = new Promise<void>((_, reject) => {
    rejectCaptureFailed = reject;
  });
  void captureFailed.catch(() => {});
  const rejectIfNoAudioTracks = () => {
    if (hasNoAudioTracks(video)) {
      rejectCaptureFailed(
        new Error("This video does not contain an audio track."),
      );
    }
  };
  let resolveRecorderStopped = () => {};
  const recorderStopped = new Promise<void>((resolve) => {
    resolveRecorderStopped = resolve;
  });

  const reportProgress = () => {
    const durationSeconds = Number.isFinite(video.duration)
      ? video.duration
      : null;
    const elapsedSeconds = Number.isFinite(video.currentTime)
      ? video.currentTime
      : 0;
    onProgress({
      elapsedSeconds,
      durationSeconds,
      percent:
        durationSeconds && durationSeconds > 0
          ? Math.min(99, Math.floor((elapsedSeconds / durationSeconds) * 100))
          : null,
    });
  };

  try {
    try {
      context = new AudioContext();
      source = context.createMediaElementSource(video);
      destination = context.createMediaStreamDestination();
      source.connect(destination);
    } catch {
      throw new Error(
        "The browser could not create an audio capture pipeline for this video.",
      );
    }

    const mimeType = MIME_TYPES.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    try {
      recorder = new MediaRecorder(
        destination.stream,
        mimeType ? { mimeType } : undefined,
      );
    } catch {
      throw new Error(
        "This browser cannot encode audio from the selected video format.",
      );
    }

    recorder.addEventListener("dataavailable", (event: BlobEvent) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => resolveRecorderStopped(), {
      once: true,
    });
    recorder.addEventListener(
      "error",
      (event) => {
        const recorderEvent = event as Event & { error?: DOMException };
        recorderError =
          recorderEvent.error?.message ||
          "The audio recorder stopped unexpectedly.";
        rejectCaptureFailed(
          new Error(`Audio capture failed. ${recorderError}`),
        );
        video.pause();
        if (recorder?.state !== "inactive") {
          try {
            recorder?.stop();
          } catch {
            resolveRecorderStopped();
          }
        }
      },
      { once: true },
    );

    video.addEventListener("loadedmetadata", reportProgress);
    video.addEventListener("timeupdate", reportProgress);
    video.addEventListener("loadedmetadata", rejectIfNoAudioTracks);
    video.addEventListener("loadeddata", rejectIfNoAudioTracks, { once: true });
    video.src = videoUrl;

    signal.addEventListener("abort", forwardAbort, { once: true });
    const resumeContext =
      context.state === "suspended" ? context.resume() : Promise.resolve();
    try {
      recorder.start(1000);
      recorderStarted = true;
    } catch {
      throw new Error("The browser could not start audio capture.");
    }

    const playback = video.play();
    const playbackFinished = waitForPlayback(
      video,
      playback,
      captureFailed,
      playbackController.signal,
    );
    void playbackFinished.catch(() => {});
    try {
      await Promise.race([resumeContext, playbackFinished]);
      if (context.state !== "running") {
        throw new Error(
          "Audio playback was suspended by the browser. Start extraction again and allow playback.",
        );
      }
      await playbackFinished;
    } catch (error: unknown) {
      playbackController.abort();
      if (signal.aborted) throw makeAbortError();
      if (error instanceof Error) throw error;
      throw new Error("Audio extraction could not start.");
    } finally {
      signal.removeEventListener("abort", forwardAbort);
    }

    if (recorderError) {
      throw new Error(`Audio capture failed. ${recorderError}`);
    }

    reportProgress();
    recorder?.stop();
    await recorderStopped;

    if (recorderError) {
      throw new Error(`Audio capture failed. ${recorderError}`);
    }
    if (!chunks.length) {
      throw new Error("The browser did not produce any audio data.");
    }

    onProgress({
      elapsedSeconds: video.currentTime,
      durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      percent: 100,
    });
    return new Blob(chunks, {
      type: recorder.mimeType || chunks[0]?.type || "application/octet-stream",
    });
  } finally {
    signal.removeEventListener("abort", forwardAbort);
    video.removeEventListener("loadedmetadata", reportProgress);
    video.removeEventListener("timeupdate", reportProgress);
    video.removeEventListener("loadedmetadata", rejectIfNoAudioTracks);
    video.removeEventListener("loadeddata", rejectIfNoAudioTracks);
    video.pause();

    if (recorder && recorderStarted && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        resolveRecorderStopped();
      }
    }
    if (recorderStarted) await recorderStopped;

    destination?.stream.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    destination?.disconnect();
    if (context && context.state !== "closed") {
      await context.close().catch(() => {});
    }
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}
