/// <reference lib="webworker" />

import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import { segmentSpeech } from "../lib/audioSegments";
import type {
  ExecutionMode,
  TranscriptChunk,
  TranscriptionWorkerMessage,
  TranscriptionWorkerRequest,
} from "../lib/transcription";
import { collapseRepeats, isDegenerateTranscript } from "../lib/transcriptText";

// English-only models. Do NOT pass `language` or `task` to them: transformers.js
// throws for English-only checkpoints.
// Same checkpoint on both paths. distil-small.en was benchmarked and dropped a
// clause on clean audio, so Whisper Base is the more reliable choice.
const GPU_MODEL = {
  id: "onnx-community/whisper-base.en",
  label: "Whisper Base (English, fp16)",
  dtype: { encoder_model: "fp16", decoder_model_merged: "fp16" },
} as const;
const WASM_MODEL = {
  id: "onnx-community/whisper-base.en",
  label: "Whisper Base (English, quantized)",
  dtype: "q8",
} as const;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let initialization: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let initializationError: string | null = null;
let activeMode: ExecutionMode | null = null;
let gpuDisabled = false;

const workerScope = self as DedicatedWorkerGlobalScope;
type WebGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<{
      features: { has: (feature: string) => boolean };
    } | null>;
  };
};

class UnreliableGpuOutputError extends Error {}

function post(message: TranscriptionWorkerMessage) {
  workerScope.postMessage(message);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function createPipeline(mode: ExecutionMode) {
  const model = mode === "webgpu" ? GPU_MODEL : WASM_MODEL;
  post({
    type: "status",
    status: "loading-model",
    mode,
    message: `Loading ${model.label} for ${mode === "webgpu" ? "WebGPU" : "WASM"}.`,
  });

  return pipeline("automatic-speech-recognition", model.id, {
    device: mode,
    dtype: model.dtype,
    progress_callback: (info: ProgressInfo) => {
      const file = "file" in info ? info.file : "Whisper model files";
      const progress =
        info.status === "progress_total" || info.status === "progress"
          ? info.progress
          : null;
      post({
        type: "model-progress",
        file,
        progress: Number.isFinite(progress) ? progress : null,
      });
    },
  });
}

async function gpuIsUsable() {
  if (gpuDisabled) return false;
  const gpu = (navigator as WebGpuNavigator).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    // The GPU model is fp16-only, so require shader-f16 support.
    return adapter?.features.has("shader-f16") ?? false;
  } catch {
    return false;
  }
}

async function initializePipeline() {
  if (initializationError) {
    throw new Error(initializationError);
  }

  let webgpuError: unknown = null;
  if (await gpuIsUsable()) {
    try {
      const gpuPipeline = await createPipeline("webgpu");
      activeMode = "webgpu";
      transcriber = gpuPipeline;
      return gpuPipeline;
    } catch (error) {
      webgpuError = error;
      gpuDisabled = true;
    }
  }

  post({
    type: "status",
    status: "fallback",
    mode: "wasm",
    message: webgpuError
      ? "WebGPU could not initialize. Switching to the quantized WASM model."
      : "Using the quantized WASM model on this device.",
  });

  try {
    const wasmPipeline = await createPipeline("wasm");
    activeMode = "wasm";
    transcriber = wasmPipeline;
    return wasmPipeline;
  } catch (wasmError) {
    initializationError =
      (webgpuError
        ? `WebGPU could not initialize: ${getErrorMessage(webgpuError)} `
        : "") +
      `The WASM model could not start: ${getErrorMessage(wasmError)} ` +
      "Check your connection for the model download, then try again.";
    throw new Error(initializationError);
  }
}

function getPipeline() {
  if (transcriber) {
    return Promise.resolve(transcriber);
  }
  if (!initialization) {
    initialization = initializePipeline();
  }
  return initialization;
}

async function switchToWasm() {
  gpuDisabled = true;
  const previous = transcriber;
  transcriber = null;
  initialization = null;
  activeMode = null;
  try {
    await previous?.dispose();
  } catch {
    // Disposal failures must not block the fallback.
  }
  return getPipeline();
}

async function transcribeSegments(
  asr: AutomaticSpeechRecognitionPipeline,
  segments: ReturnType<typeof segmentSpeech>["segments"],
) {
  const chunks: TranscriptChunk[] = [];
  post({ type: "transcribe-progress", completed: 0, total: segments.length });

  for (const [index, segment] of segments.entries()) {
    const output = await asr(segment.samples);
    const text = (Array.isArray(output) ? output[0].text : output.text).trim();

    if (
      activeMode === "webgpu" &&
      isDegenerateTranscript(text, segment.speechSeconds)
    ) {
      throw new UnreliableGpuOutputError("The GPU produced unreliable text.");
    }

    const cleaned = collapseRepeats(text);
    if (cleaned) {
      chunks.push({
        text: cleaned,
        timestamp: [segment.startSeconds, segment.endSeconds],
      });
    }
    post({
      type: "transcribe-progress",
      completed: index + 1,
      total: segments.length,
    });
  }
  return chunks;
}

workerScope.onmessage = async (
  event: MessageEvent<TranscriptionWorkerRequest>,
) => {
  if (event.data.type !== "transcribe") {
    return;
  }

  const { audio } = event.data;
  if (!audio.length) {
    post({
      type: "error",
      stage: "transcribing",
      message: "The extracted audio is empty or could not be decoded.",
    });
    return;
  }

  let stage: "loading-model" | "transcribing" = "loading-model";

  try {
    const { segments } = segmentSpeech(audio);
    if (segments.length === 0) {
      post({
        type: "error",
        stage: "transcribing",
        message:
          "No speech was detected. Check that the recording is audible, then try again.",
      });
      return;
    }

    let asr = await getPipeline();
    if (!activeMode) {
      throw new Error("The model did not select a supported execution mode.");
    }

    post({
      type: "status",
      status: "model-ready",
      mode: activeMode,
      message: `Whisper is ready on ${activeMode === "webgpu" ? "WebGPU" : "WASM"}.`,
    });
    stage = "transcribing";
    post({
      type: "status",
      status: "transcribing",
      mode: activeMode,
      message: "Transcribing the speech parts of your recording.",
    });

    let chunks: TranscriptChunk[];
    try {
      chunks = await transcribeSegments(asr, segments);
    } catch (error) {
      if (!(error instanceof UnreliableGpuOutputError)) throw error;
      stage = "loading-model";
      post({
        type: "status",
        status: "fallback",
        mode: "wasm",
        message:
          "The GPU output looked unreliable. Restarting with the WASM model.",
      });
      asr = await switchToWasm();
      stage = "transcribing";
      post({
        type: "status",
        status: "transcribing",
        mode: "wasm",
        message: "Transcribing the speech parts of your recording.",
      });
      chunks = await transcribeSegments(asr, segments);
    }

    post({
      type: "complete",
      text: chunks.map((chunk) => chunk.text).join(" "),
      chunks,
      mode: activeMode ?? "wasm",
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const memoryFailure = /out of memory|allocation failed|memory|alloc/i.test(
      message,
    );
    post({
      type: "error",
      stage,
      message: memoryFailure
        ? "The browser ran out of memory while loading or running Whisper. Close other tabs and try a shorter recording."
        : stage === "loading-model"
          ? message
          : `Whisper could not transcribe this audio. Check that it contains supported, audible speech and try again. ${message}`,
    });
  }
};
