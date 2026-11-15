/// <reference lib="webworker" />

import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import type {
  ExecutionMode,
  TranscriptChunk,
  TranscriptionWorkerMessage,
  TranscriptionWorkerRequest,
} from "../lib/transcription";

const MODEL_ID = "onnx-community/whisper-tiny";
const CHUNK_LENGTH_SECONDS = 30;
const STRIDE_LENGTH_SECONDS = 5;

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let initialization: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let initializationError: string | null = null;
let activeMode: ExecutionMode | null = null;

const workerScope = self as DedicatedWorkerGlobalScope;
type WebGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<{
      features: { has: (feature: string) => boolean };
    } | null>;
  };
};

function post(message: TranscriptionWorkerMessage) {
  workerScope.postMessage(message);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatLoadingError(webgpuError: unknown, wasmError: unknown) {
  return [
    `WebGPU could not initialize: ${getErrorMessage(webgpuError)}`,
    `The WASM fallback also failed: ${getErrorMessage(wasmError)}`,
    "Check your connection for the model download, then try again. The model files are cached by your browser when possible.",
  ].join(" ");
}

async function createPipeline(
  mode: ExecutionMode,
  dtype: "fp16" | "fp32" | "q8",
) {
  post({
    type: "status",
    status: "loading-model",
    mode,
    message:
      mode === "webgpu"
        ? `Loading the multilingual Whisper Tiny model for WebGPU (${dtype}).`
        : "Loading the quantized Whisper Tiny model for WASM.",
  });

  return pipeline("automatic-speech-recognition", MODEL_ID, {
    device: mode,
    dtype,
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

async function initializePipeline() {
  if (initializationError) {
    throw new Error(initializationError);
  }

  const gpu = (navigator as WebGpuNavigator).gpu;
  if (gpu) {
    let adapterAvailable = false;
    let supportsFloat16 = false;

    try {
      const adapter = await gpu.requestAdapter();
      adapterAvailable = adapter !== null;
      supportsFloat16 = adapter?.features.has("shader-f16") ?? false;
    } catch {
      adapterAvailable = false;
    }

    if (adapterAvailable) {
      try {
        const gpuPipeline = await createPipeline(
          "webgpu",
          supportsFloat16 ? "fp16" : "fp32",
        );
        activeMode = "webgpu";
        transcriber = gpuPipeline;
        return gpuPipeline;
      } catch (webgpuError) {
        post({
          type: "status",
          status: "fallback",
          mode: "wasm",
          message:
            "WebGPU could not initialize. Switching to the quantized WASM fallback.",
        });

        try {
          const wasmPipeline = await createPipeline("wasm", "q8");
          activeMode = "wasm";
          transcriber = wasmPipeline;
          return wasmPipeline;
        } catch (wasmError) {
          initializationError = formatLoadingError(webgpuError, wasmError);
          throw new Error(initializationError);
        }
      }
    }
  }

  post({
    type: "status",
    status: "fallback",
    mode: "wasm",
    message:
      "WebGPU is unavailable here. Using the quantized WASM fallback.",
  });

  try {
    const wasmPipeline = await createPipeline("wasm", "q8");
    activeMode = "wasm";
    transcriber = wasmPipeline;
    return wasmPipeline;
  } catch (error) {
    initializationError =
      `The Whisper model could not start with WASM: ${getErrorMessage(error)} ` +
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
    const asr = await getPipeline();
    const mode = activeMode;
    if (!mode) {
      throw new Error("The model did not select a supported execution mode.");
    }

    post({
      type: "status",
      status: "model-ready",
      mode,
      message: `Whisper is ready on ${mode === "webgpu" ? "WebGPU" : "WASM"}.`,
    });
    stage = "transcribing";
    post({
      type: "status",
      status: "transcribing",
      mode,
      message:
        "Transcribing audio in overlapping 30-second chunks. Long recordings may take several minutes.",
    });

    const result = await asr(audio, {
      chunk_length_s: CHUNK_LENGTH_SECONDS,
      stride_length_s: STRIDE_LENGTH_SECONDS,
      return_timestamps: true,
      task: "transcribe",
    });
    const chunks: TranscriptChunk[] | undefined = result.chunks?.map(
      ({ text, timestamp }) => ({ text, timestamp }),
    );

    post({
      type: "complete",
      text: result.text.trim(),
      chunks,
      mode,
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
