// Pure, dependency-free speech segmentation. Splits 16 kHz mono audio at
// silences into pieces that fit Whisper's 30-second window, so each piece can
// be transcribed independently (no overlap merging) and progress is measurable.

export const SEGMENT_SAMPLE_RATE = 16_000;

export type SpeechSegment = {
  samples: Float32Array;
  startSeconds: number;
  endSeconds: number;
  speechSeconds: number;
};

export type SegmentationResult = {
  segments: SpeechSegment[];
  totalSeconds: number;
  speechSeconds: number;
};

export type SegmentationOptions = {
  sampleRate?: number;
  frameSeconds?: number;
  minSilenceSeconds?: number;
  paddingSeconds?: number;
  minSpeechSeconds?: number;
  maxSegmentSeconds?: number;
  joinGapSeconds?: number;
};

const MIN_ABSOLUTE_RMS = 0.0015;
const RELATIVE_THRESHOLD = 0.03; // about -30 dB below loud speech
const SPLIT_SEARCH_SECONDS = 5;

type Region = { start: number; end: number };

export function segmentSpeech(
  audio: Float32Array,
  options: SegmentationOptions = {},
): SegmentationResult {
  const sampleRate = options.sampleRate ?? SEGMENT_SAMPLE_RATE;
  const frameSeconds = options.frameSeconds ?? 0.02;
  const minSilenceSeconds = options.minSilenceSeconds ?? 0.7;
  const paddingSeconds = options.paddingSeconds ?? 0.25;
  const minSpeechSeconds = options.minSpeechSeconds ?? 0.3;
  const maxSegmentSeconds = options.maxSegmentSeconds ?? 28;
  const joinGapSeconds = options.joinGapSeconds ?? 0.3;

  const totalSeconds = audio.length / sampleRate;
  const frameLength = Math.max(1, Math.round(frameSeconds * sampleRate));
  const frameCount = Math.floor(audio.length / frameLength);
  const empty: SegmentationResult = {
    segments: [],
    totalSeconds,
    speechSeconds: 0,
  };
  if (frameCount === 0) return empty;

  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    const offset = frame * frameLength;
    for (let index = 0; index < frameLength; index += 1) {
      const value = audio[offset + index];
      sum += value * value;
    }
    rms[frame] = Math.sqrt(sum / frameLength);
  }

  const sorted = Float32Array.from(rms).sort();
  const loud = sorted[Math.floor(0.95 * (sorted.length - 1))];
  if (loud < MIN_ABSOLUTE_RMS * 2) return empty;
  const threshold = Math.max(MIN_ABSOLUTE_RMS, loud * RELATIVE_THRESHOLD);

  const minSilenceFrames = Math.ceil(minSilenceSeconds / frameSeconds);
  const minSpeechFrames = Math.ceil(minSpeechSeconds / frameSeconds);
  const paddingFrames = Math.round(paddingSeconds / frameSeconds);
  const maxFrames = Math.floor(maxSegmentSeconds / frameSeconds);
  const joinFrames = Math.round(joinGapSeconds / frameSeconds);
  const searchFrames = Math.round(SPLIT_SEARCH_SECONDS / frameSeconds);

  // 1. Raw speech runs.
  const runs: Region[] = [];
  let runStart = -1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (rms[frame] > threshold) {
      if (runStart < 0) runStart = frame;
    } else if (runStart >= 0) {
      runs.push({ start: runStart, end: frame });
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push({ start: runStart, end: frameCount });

  // 2. Merge runs separated by short pauses.
  const merged: Region[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && run.start - previous.end < minSilenceFrames) {
      previous.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }

  // 3. Drop clicks, then pad (gaps are >= minSilence so padding never overlaps
  //    when 2 * padding <= minSilence).
  const regions: Region[] = merged
    .filter((region) => region.end - region.start >= minSpeechFrames)
    .map((region) => ({
      start: Math.max(0, region.start - paddingFrames),
      end: Math.min(frameCount, region.end + paddingFrames),
    }));

  // 4. Split regions longer than the window at the quietest nearby frame.
  const pieces: Region[] = [];
  for (const region of regions) {
    let { start } = region;
    while (region.end - start > maxFrames) {
      const searchStart = Math.max(start + 1, start + maxFrames - searchFrames);
      const searchEnd = start + maxFrames;
      let cut = searchEnd;
      let quietest = Infinity;
      for (let frame = searchStart; frame < searchEnd; frame += 1) {
        if (rms[frame] < quietest) {
          quietest = rms[frame];
          cut = frame;
        }
      }
      pieces.push({ start, end: cut });
      start = cut;
    }
    pieces.push({ start, end: region.end });
  }

  // 5. Pack consecutive pieces into windows, joined by a short silence.
  const groups: Region[][] = [];
  let group: Region[] = [];
  let groupFrames = 0;
  for (const piece of pieces) {
    const length = piece.end - piece.start;
    const added = group.length === 0 ? length : length + joinFrames;
    if (group.length > 0 && groupFrames + added > maxFrames) {
      groups.push(group);
      group = [];
      groupFrames = 0;
    }
    groupFrames += group.length === 0 ? length : length + joinFrames;
    group.push(piece);
  }
  if (group.length > 0) groups.push(group);

  const joinSamples = joinFrames * frameLength;
  const segments: SpeechSegment[] = groups.map((members) => {
    let sampleCount = 0;
    let speechFrames = 0;
    for (const [index, member] of members.entries()) {
      const length = member.end - member.start;
      speechFrames += length;
      sampleCount += length * frameLength + (index > 0 ? joinSamples : 0);
    }
    const samples = new Float32Array(sampleCount);
    let cursor = 0;
    for (const [index, member] of members.entries()) {
      if (index > 0) cursor += joinSamples;
      const slice = audio.subarray(
        member.start * frameLength,
        member.end * frameLength,
      );
      samples.set(slice, cursor);
      cursor += slice.length;
    }
    return {
      samples,
      startSeconds: members[0].start * frameSeconds,
      endSeconds: members[members.length - 1].end * frameSeconds,
      speechSeconds: speechFrames * frameSeconds,
    };
  });

  return {
    segments,
    totalSeconds,
    speechSeconds: segments.reduce((sum, item) => sum + item.speechSeconds, 0),
  };
}
