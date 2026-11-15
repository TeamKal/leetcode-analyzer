export const TARGET_SAMPLE_RATE = 16_000;

export type ExecutionMode = "webgpu" | "wasm";

export type TranscriptChunk = {
  text: string;
  timestamp: [number, number];
};

export type TranscriptionStatus =
  | "loading-model"
  | "fallback"
  | "model-ready"
  | "transcribing";

export type TranscriptionRequest = {
  type: "transcribe";
  audio: Float32Array;
};

export type TranscriptionWorkerRequest = TranscriptionRequest;

export type TranscriptionWorkerMessage =
  | {
      type: "status";
      status: TranscriptionStatus;
      mode?: ExecutionMode;
      message: string;
    }
  | {
      type: "model-progress";
      file: string;
      progress: number | null;
    }
  | {
      type: "complete";
      text: string;
      chunks?: TranscriptChunk[];
      mode: ExecutionMode;
    }
  | {
      type: "error";
      stage: "loading-model" | "transcribing";
      message: string;
    };

export async function prepareAudio(blob: Blob): Promise<Float32Array> {
  if (typeof AudioContext === "undefined") {
    throw new Error(
      "This browser does not support audio decoding required for transcription.",
    );
  }

  if (blob.size === 0) {
    throw new Error("The extracted audio is empty.");
  }

  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  } catch {
    context = new AudioContext();
  }

  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (!decoded.length || decoded.numberOfChannels < 1) {
      throw new Error("The extracted audio contains no decodable sound.");
    }

    if (
      decoded.sampleRate === TARGET_SAMPLE_RATE &&
      decoded.numberOfChannels === 1
    ) {
      return decoded.getChannelData(0).slice();
    }

    const mono = context.createBuffer(
      1,
      decoded.length,
      decoded.sampleRate,
    );
    const monoSamples = mono.getChannelData(0);

    if (decoded.numberOfChannels === 1) {
      monoSamples.set(decoded.getChannelData(0));
    } else {
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
        decoded.getChannelData(i),
      );
      for (let frame = 0; frame < decoded.length; frame += 1) {
        let sum = 0;
        for (const channel of channels) {
          sum += channel[frame];
        }
        monoSamples[frame] = sum / channels.length;
      }
    }

    const targetLength = Math.ceil(
      (decoded.length / decoded.sampleRate) * TARGET_SAMPLE_RATE,
    );
    const offline = new OfflineAudioContext(
      1,
      targetLength,
      TARGET_SAMPLE_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = mono;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();

    return resampled.getChannelData(0).slice();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The extracted audio")) {
      throw error;
    }
    throw new Error(
      "The audio could not be decoded by this browser. Try recording or extracting it again, or use a different supported video.",
    );
  } finally {
    await context.close();
  }
}
