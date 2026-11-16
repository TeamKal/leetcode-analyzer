"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TranscriptionPhase = "idle" | "transcribing" | "completed" | "error";

type TranscriptionState = {
  phase: TranscriptionPhase;
  message: string;
  transcript: string;
  error: string;
};

const SERVER_TIMEOUT_MS = 70_000;

const INITIAL_STATE: TranscriptionState = {
  phase: "idle",
  message: "",
  transcript: "",
  error: "",
};

// Transcription runs on the server (Deepgram) from the verified private video.
export function useTranscription() {
  const [state, setState] = useState(INITIAL_STATE);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const stopRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    stopRequest();
    setState(INITIAL_STATE);
  }, [stopRequest]);

  const clearTranscript = useCallback(() => {
    setState({ ...INITIAL_STATE });
  }, []);

  const transcribe = useCallback(async (videoObjectKey: string) => {
    if (busyRef.current || !videoObjectKey) {
      return;
    }

    const requestId = ++requestIdRef.current;
    busyRef.current = true;
    setState({
      phase: "transcribing",
      message: "Transcribing your video…",
      transcript: "",
      error: "",
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SERVER_TIMEOUT_MS);

    const fail = (error: string) => {
      busyRef.current = false;
      setState({ phase: "error", message: "", transcript: "", error });
    };

    try {
      const response = await fetch("/api/transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoObjectKey }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as {
        transcript?: unknown;
        message?: unknown;
      } | null;
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      if (response.ok && typeof data?.transcript === "string") {
        busyRef.current = false;
        setState({
          phase: "completed",
          message: "Transcription complete",
          transcript: data.transcript,
          error: "",
        });
        return;
      }

      fail(
        typeof data?.message === "string"
          ? data.message
          : "Transcription is unavailable. Try again in a moment.",
      );
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      fail(
        timedOut
          ? "Transcription took too long. Try again."
          : "Could not reach the transcription service. Check your connection and try again.",
      );
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRequest();
    };
  }, [stopRequest]);

  return {
    ...state,
    isBusy: state.phase === "transcribing",
    updateTranscript: (nextTranscript: string) => {
      setState((current) => ({
        ...current,
        transcript: nextTranscript,
      }));
    },
    transcribe,
    cancel,
    clearTranscript,
  };
}
