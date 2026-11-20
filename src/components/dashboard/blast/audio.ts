/**
 * The sequence's audio, played through the Web Audio API. Its clock is the
 * source of truth for the timeline, and its loudness drives the mascot's mouth.
 *
 * Browsers only allow sound after a user gesture, so `prime()` is called from
 * the very first click: it creates the context and starts fetching and decoding,
 * so by the tenth click the sound is ready to start at once.
 */

export type AudioClock = {
  /** Milliseconds since the audio started. */
  now(): number;
  /** Loudness from 0 to 1. */
  level(): number;
  /** True while the real sound is playing (false with the silent fallback). */
  readonly real: boolean;
  /** Stops the sound right now. */
  stop(): void;
};

type AudioCtor = typeof AudioContext;

export function createBlastAudio(src: string) {
  let ctx: AudioContext | null = null;
  let decoded: Promise<AudioBuffer | null> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let ended = false;
  let endCb: (() => void) | null = null;

  const prime = () => {
    if (!ctx) {
      try {
        const Ctor: AudioCtor | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        ctx = Ctor ? new Ctor() : null;
      } catch {
        ctx = null;
      }
    }
    const c = ctx;
    if (!c) return;
    void c.resume().catch(() => undefined); // allowed: we are inside a click
    if (!decoded) {
      decoded = fetch(src)
        .then((res) => res.arrayBuffer())
        .then((data) => c.decodeAudioData(data))
        .catch(() => null);
    }
  };

  /** Starts the sound and returns its clock. Never throws: falls back to a silent clock. */
  const play = async (): Promise<AudioClock> => {
    let buffer: AudioBuffer | null = null;
    const c = ctx;
    if (c && decoded) {
      try {
        if (c.state !== "running") await c.resume();
        buffer =
          c.state === "running"
            ? await Promise.race([decoded, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
            : null;
      } catch {
        buffer = null;
      }
    }

    if (!c || !buffer) {
      const t0 = performance.now();
      return {
        now: () => performance.now() - t0,
        // No sound available: still talk, so it never looks broken.
        level: () => {
          const s = (performance.now() - t0) / 1000;
          return Math.max(0, 0.5 + 0.5 * Math.sin(s * 17) * Math.sin(s * 5.3));
        },
        real: false,
        stop() {},
      };
    }

    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    const node = c.createBufferSource();
    node.buffer = buffer;
    node.connect(analyser);
    analyser.connect(c.destination);
    const data = new Uint8Array(analyser.fftSize);
    source = node;
    node.onended = () => {
      ended = true;
      const cb = endCb;
      endCb = null;
      cb?.();
    };
    const startedAt = c.currentTime;
    node.start();
    let smooth = 0;
    return {
      now: () => (c.currentTime - startedAt) * 1000,
      level: () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const raw = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
        smooth += (raw - smooth) * 0.55;
        return smooth;
      },
      real: true,
      stop() {
        try {
          node.stop();
        } catch {
          // already stopped
        }
      },
    };
  };

  /** Stops the sound and frees the context. */
  const dispose = () => {
    try {
      source?.stop();
    } catch {
      // already stopped
    }
    source = null;
    endCb = null;
    void ctx?.close().catch(() => undefined);
    ctx = null;
    decoded = null;
  };

  /** Lets the sound play to its end, then frees the context and calls onEnded (only for a natural end). */
  const release = (onEnded?: () => void) => {
    const c = ctx;
    const node = source;
    if (!c || !node) return dispose();
    const done = () => {
      void c.close().catch(() => undefined);
      onEnded?.();
    };
    if (ended) done();
    else endCb = done;
    source = null;
    ctx = null;
    decoded = null;
  };

  return { prime, play, dispose, release };
}
