"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecordingPhase =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "stopping"
  | "recorded"
  | "error";

type RecordingState = {
  phase: RecordingPhase;
  stream: MediaStream | null;
  videoUrl: string | null;
  audioUrl: string | null;
  videoBlob: Blob | null;
  audioBlob: Blob | null;
  elapsedSeconds: number;
  error: string;
};

type RecorderSet = {
  video: MediaRecorder;
  audio: MediaRecorder;
  audioTrack: MediaStreamTrack;
  stopped: Promise<void>;
  resolveVideoStopped: () => void;
  resolveAudioStopped: () => void;
  videoChunks: Blob[];
  audioChunks: Blob[];
  error: string;
};

const INITIAL_STATE: RecordingState = {
  phase: "idle",
  stream: null,
  videoUrl: null,
  audioUrl: null,
  videoBlob: null,
  audioBlob: null,
  elapsedSeconds: 0,
  error: "",
};

function getSupportedMimeType(candidates: string[]) {
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function getPermissionError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera or microphone permission was denied. Allow access in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera or microphone was found. Connect a device and try again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera or microphone is already in use or could not be opened.";
  }
  if (name === "OverconstrainedError") {
    return "No camera or microphone matches the requested settings.";
  }
  return error instanceof Error
    ? `Could not access the camera and microphone. ${error.message}`
    : "Could not access the camera and microphone.";
}

export function useRecording() {
  const [state, setState] = useState(INITIAL_STATE);
  const stateRef = useRef(state);
  const phaseRef = useRef<RecordingPhase>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderSetRef = useRef<RecorderSet | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const videoUrlRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const updateState = useCallback((update: Partial<RecordingState>) => {
    const next = { ...stateRef.current, ...update };
    stateRef.current = next;
    phaseRef.current = next.phase;
    setState(next);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeRecordingUrls = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const requestAccess = useCallback(async () => {
    if (phaseRef.current === "requesting" || streamRef.current) {
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      updateState({
        phase: "error",
        error:
          "This browser does not support camera and microphone recording. Use a recent browser over HTTPS or localhost.",
      });
      return;
    }

    updateState({ phase: "requesting", error: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(
          "Both a camera video track and microphone audio track are required.",
        );
      }

      streamRef.current = stream;
      updateState({ phase: "ready", stream, error: "" });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      updateState({
        phase: "error",
        stream: null,
        error: getPermissionError(error),
      });
    }
  }, [updateState]);

  const stopRecording = useCallback(async (): Promise<{
    audioBlob: Blob;
    videoBlob: Blob;
  } | null> => {
    if (phaseRef.current !== "recording") {
      return null;
    }

    const recorders = recorderSetRef.current;
    if (!recorders) {
      updateState({
        phase: "error",
        error:
          "The recording session could not be completed. Please try again.",
      });
      return null;
    }

    phaseRef.current = "stopping";
    updateState({
      phase: "stopping",
      elapsedSeconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
    });
    stopTimer();

    for (const [recorder, resolveStopped] of [
      [recorders.video, recorders.resolveVideoStopped],
      [recorders.audio, recorders.resolveAudioStopped],
    ] as const) {
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch (error) {
          recorders.error =
            error instanceof Error
              ? error.message
              : "A recorder stopped unexpectedly.";
          resolveStopped();
        }
      } else {
        resolveStopped();
      }
    }

    await recorders.stopped;
    recorders.audioTrack.stop();
    recorderSetRef.current = null;

    if (recorders.error) {
      updateState({
        phase: "error",
        error: `Recording failed. ${recorders.error}`,
      });
      return null;
    }

    const videoBlob = new Blob(recorders.videoChunks, {
      type: recorders.video.mimeType || "video/webm",
    });
    const audioBlob = new Blob(recorders.audioChunks, {
      type: recorders.audio.mimeType || "audio/webm",
    });

    if (!videoBlob.size || !audioBlob.size) {
      updateState({
        phase: "error",
        error:
          "One of the recordings was empty. Check camera and microphone permissions, then try again.",
      });
      return null;
    }

    revokeRecordingUrls();
    const videoUrl = URL.createObjectURL(videoBlob);
    const audioUrl = URL.createObjectURL(audioBlob);
    videoUrlRef.current = videoUrl;
    audioUrlRef.current = audioUrl;
    updateState({
      phase: "recorded",
      videoBlob,
      audioBlob,
      videoUrl,
      audioUrl,
      error: "",
    });
    return { audioBlob, videoBlob };
  }, [revokeRecordingUrls, stopTimer, updateState]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || phaseRef.current !== "ready") {
      return;
    }

    let audioTrack: MediaStreamTrack | null = null;
    try {
      const microphoneTrack = stream.getAudioTracks()[0];
      if (!microphoneTrack) {
        throw new Error("The microphone audio track is no longer available.");
      }
      audioTrack = microphoneTrack.clone();
      const audioStream = new MediaStream([audioTrack]);

      const videoType = getSupportedMimeType([
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]);
      const audioType = getSupportedMimeType([
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ]);
      const videoRecorder = new MediaRecorder(
        stream,
        videoType ? { mimeType: videoType } : undefined,
      );
      const audioRecorder = new MediaRecorder(
        audioStream,
        audioType ? { mimeType: audioType } : undefined,
      );

      let resolveVideoStopped = () => {};
      let resolveAudioStopped = () => {};
      const videoStopped = new Promise<void>((resolve) => {
        resolveVideoStopped = resolve;
      });
      const audioStopped = new Promise<void>((resolve) => {
        resolveAudioStopped = resolve;
      });
      const recorders: RecorderSet = {
        video: videoRecorder,
        audio: audioRecorder,
        audioTrack,
        stopped: Promise.all([videoStopped, audioStopped]).then(() => {}),
        resolveVideoStopped,
        resolveAudioStopped,
        videoChunks: [],
        audioChunks: [],
        error: "",
      };
      recorderSetRef.current = recorders;

      videoRecorder.ondataavailable = (event) => {
        if (event.data.size) recorders.videoChunks.push(event.data);
      };
      audioRecorder.ondataavailable = (event) => {
        if (event.data.size) recorders.audioChunks.push(event.data);
      };
      videoRecorder.onstop = recorders.resolveVideoStopped;
      audioRecorder.onstop = recorders.resolveAudioStopped;
      const handleRecorderError = (event: Event) => {
        const recorderError = (event as Event & { error?: DOMException }).error;
        recorders.error =
          recorderError?.message || "A browser media recorder error occurred.";
        void stopRecording();
      };
      videoRecorder.onerror = handleRecorderError;
      audioRecorder.onerror = handleRecorderError;

      startedAtRef.current = Date.now();
      updateState({ phase: "recording", elapsedSeconds: 0, error: "" });
      timerRef.current = window.setInterval(() => {
        if (mountedRef.current) {
          updateState({
            elapsedSeconds: Math.floor(
              (Date.now() - startedAtRef.current) / 1000,
            ),
          });
        }
      }, 250);

      videoRecorder.start(1000);
      try {
        audioRecorder.start(1000);
      } catch (error) {
        recorders.error =
          error instanceof Error
            ? error.message
            : "The audio recorder could not start.";
        void stopRecording();
      }
    } catch (error) {
      const recorders = recorderSetRef.current;
      if (recorders) {
        for (const [recorder, resolveStopped] of [
          [recorders.video, recorders.resolveVideoStopped],
          [recorders.audio, recorders.resolveAudioStopped],
        ] as const) {
          if (recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {
              resolveStopped();
            }
          } else {
            resolveStopped();
          }
        }
      }
      audioTrack?.stop();
      recorderSetRef.current = null;
      stopTimer();
      updateState({
        phase: streamRef.current ? "ready" : "error",
        error:
          error instanceof Error
            ? `Could not start both recorders. ${error.message}`
            : "Could not start both recorders.",
      });
    }
  }, [stopRecording, stopTimer, updateState]);

  const clearRecordings = useCallback(() => {
    revokeRecordingUrls();
    updateState({
      phase: streamRef.current ? "ready" : "idle",
      videoUrl: null,
      audioUrl: null,
      videoBlob: null,
      audioBlob: null,
      elapsedSeconds: 0,
      error: "",
    });
  }, [revokeRecordingUrls, updateState]);

  const retake = useCallback(() => {
    if (phaseRef.current === "recording") {
      return;
    }
    clearRecordings();
  }, [clearRecordings]);

  const endSession = useCallback(async () => {
    if (phaseRef.current === "recording") {
      await stopRecording();
    }
    stopTracks();
    updateState({
      phase: stateRef.current.videoBlob ? "recorded" : "idle",
      stream: null,
      error: "",
    });
  }, [stopRecording, stopTracks, updateState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopTimer();
      const recorders = recorderSetRef.current;
      for (const recorder of recorders
        ? [recorders.video, recorders.audio]
        : []) {
        if (recorder.state !== "inactive") {
          recorder.onstop = null;
          recorder.stop();
        }
      }
      recorders?.audioTrack.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [stopTimer]);

  return {
    ...state,
    requestAccess,
    startRecording,
    stopRecording,
    retake,
    endSession,
  };
}
