/** Small sequencing helpers for cinematic sequences. No imports, so they are testable. */

export type TimelineStep = { name: string; run: (signal: AbortSignal) => Promise<void> };

/** Runs the steps one after another; stops quietly if the signal aborts. */
export async function runSteps(
  steps: TimelineStep[],
  signal: AbortSignal,
  onStep?: (name: string, index: number) => void,
) {
  for (let i = 0; i < steps.length; i += 1) {
    if (signal.aborted) return;
    onStep?.(steps[i].name, i);
    await steps[i].run(signal);
  }
}

export type Cue = { at: number; name: string; run: () => void };

/**
 * Fires each cue once when the clock (for example an audio element's
 * currentTime, in milliseconds) reaches its time. Call `update` on every frame.
 * Seeking backwards does not fire a cue twice.
 */
export function createCueTrack(cues: Cue[]) {
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const fired = new Set<Cue>();
  return {
    update(timeMs: number) {
      for (const cue of sorted) {
        if (cue.at > timeMs) break;
        if (fired.has(cue)) continue;
        fired.add(cue);
        cue.run();
      }
    },
    get remaining() {
      return sorted.length - fired.size;
    },
  };
}
