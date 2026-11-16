"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  prepareAudio,
  type ExecutionMode,
  type TranscriptChunk,
  type TranscriptionWorkerMessage,
} from "../lib/transcription";

type TranscriptionPhase =
  | "idle"
  | "preparing"
  | "loading-model"
  | "transcribing"
  | "completed"
  | "error";

type TranscriptionState = {
  phase: TranscriptionPhase;
  modelReady: boolean;
  mode: ExecutionMode | null;
  modelProgress: number | null;
  modelFile: string;
  message: string;
  transcript: string;
  chunks: TranscriptChunk[];
  transcribeProgress: { completed: number; total: number } | null;
  error: string;
};

const INITIAL_STATE: TranscriptionState = {
  phase: "idle",
  modelReady: false,
  mode: null,
  modelProgress: null,
  modelFile: "",
  message: "",
  transcript: "",
  chunks: [],
  transcribeProgress: null,
  error: "",
};

export function useTranscription() {
  const [state, setState] = useState(INITIAL_STATE);
  const workerRef = useRef<Worker | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    stopWorker();
    setState(INITIAL_STATE);
  }, [stopWorker]);

  const clearTranscript = useCallback(() => {
    setState((current) => ({
      ...current,
      phase: "idle",
      modelProgress: null,
      modelFile: "",
      message: "",
      transcript: "",
      chunks: [],
      transcribeProgress: null,
      error: "",
    }));
  }, []);

  const startWorker = useCallback(function start(): Worker {
    const worker = new Worker(
      new URL("../workers/transcription.worker.ts", import.meta.url),
      { type: "module", name: "local-whisper-transcription" },
    );
    workerRef.current = worker;

    const dropWorker = () => {
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };

    worker.onmessage = (event: MessageEvent<TranscriptionWorkerMessage>) => {
      if (!mountedRef.current || workerRef.current !== worker) {
        return;
      }

      const message = event.data;
      if (message.type === "status") {
        setState((current) => ({
          ...current,
          phase:
            message.status === "transcribing"
              ? "transcribing"
              : message.status === "model-ready"
                ? current.phase
                : "loading-model",
          modelReady:
            message.status === "model-ready" ? true : current.modelReady,
          mode: message.mode ?? current.mode,
          modelProgress:
            message.status === "loading-model" || message.status === "fallback"
              ? null
              : current.modelProgress,
          modelFile:
            message.status === "loading-model" || message.status === "fallback"
              ? ""
              : current.modelFile,
          message: message.message,
        }));
        return;
      }

      if (message.type === "model-progress") {
        setState((current) => ({
          ...current,
          phase: "loading-model",
          modelProgress: message.progress,
          modelFile: message.file,
          message: "Downloading Whisper model files…",
        }));
        return;
      }

      if (message.type === "transcribe-progress") {
        setState((current) => ({
          ...current,
          phase: "transcribing",
          transcribeProgress: {
            completed: message.completed,
            total: message.total,
          },
        }));
        return;
      }

      if (message.type === "gpu-unavailable") {
        // A failed GPU session poisons the ONNX runtime in that worker, so the
        // WASM retry must run in a brand-new worker.
        dropWorker();
        setState((current) => ({
          ...current,
          phase: "loading-model",
          modelReady: false,
          mode: "wasm",
          modelProgress: null,
          modelFile: "",
          transcribeProgress: null,
          message:
            "The GPU could not run Whisper reliably. Restarting with the WASM model.",
        }));
        try {
          const wasmWorker = start();
          wasmWorker.postMessage(
            { type: "transcribe", audio: message.audio, forceWasm: true },
            [message.audio.buffer],
          );
        } catch {
          busyRef.current = false;
          setState((current) => ({
            ...current,
            phase: "error",
            message: "",
            error:
              "The transcription worker could not restart. Reload the page and try again.",
          }));
        }
        return;
      }

      busyRef.current = false;
      if (message.type === "complete") {
        setState((current) => ({
          ...current,
          phase: "completed",
          modelReady: true,
          mode: message.mode,
          modelProgress: null,
          modelFile: "",
          transcribeProgress: null,
          message: `Transcription complete · ${message.mode === "webgpu" ? "WebGPU" : "WASM"}`,
          transcript: message.text,
          chunks: message.chunks ?? [],
          error: message.text
            ? ""
            : "No speech was recognized. Check that the recording contains clear speech.",
        }));
        return;
      }

      dropWorker();
      setState((current) => ({
        ...current,
        phase: "error",
        modelReady:
          message.stage === "transcribing" ? current.modelReady : false,
        modelProgress: null,
        modelFile: "",
        transcribeProgress: null,
        message: "",
        error: message.message,
      }));
    };

    worker.onerror = (event) => {
      event.preventDefault();
      dropWorker();
      busyRef.current = false;
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          phase: "error",
          message: "",
          modelProgress: null,
          error:
            "The transcription worker stopped unexpectedly. Try again; your audio has not been uploaded.",
        }));
      }
    };

    worker.onmessageerror = () => {
      dropWorker();
      busyRef.current = false;
      if (mountedRef.current) {
        setState((current) => ({
          ...current,
          phase: "error",
          message: "",
          modelProgress: null,
          error:
            "The transcription worker returned an unreadable response. Try again.",
        }));
      }
    };

    return worker;
  }, []);

  const transcribe = useCallback(
    async (audioBlob: Blob) => {
      if (busyRef.current) {
        return;
      }

      const requestId = ++requestIdRef.current;
      busyRef.current = true;
      setState((current) => ({
        ...current,
        phase: "preparing",
        modelProgress: null,
        modelFile: "",
        message: "Preparing extracted audio for Whisper…",
        transcript: "",
        chunks: [],
        transcribeProgress: null,
        error: "",
      }));

      try {
        const audio = await prepareAudio(audioBlob);
        if (!mountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        let worker = workerRef.current;
        if (!worker) {
          if (typeof Worker === "undefined") {
            throw new Error(
              "This browser does not support background workers required for local transcription.",
            );
          }
          worker = startWorker();
        }

        setState((current) => ({
          ...current,
          phase: current.modelReady ? "transcribing" : "loading-model",
          message: current.modelReady
            ? "Starting transcription…"
            : "Starting local Whisper model…",
        }));
        worker.postMessage({ type: "transcribe", audio }, [audio.buffer]);
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        busyRef.current = false;
        if (mountedRef.current) {
          setState((current) => ({
            ...current,
            phase: "error",
            message: "",
            modelProgress: null,
            error:
              error instanceof Error
                ? error.message
                : "Audio preparation failed unexpectedly.",
          }));
        }
      }
    },
    [startWorker],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopWorker();
    };
  }, [stopWorker]);

  return {
    ...state,
    isBusy:
      state.phase === "preparing" ||
      state.phase === "loading-model" ||
      state.phase === "transcribing",
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
