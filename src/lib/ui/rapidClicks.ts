/**
 * Counts clicks that follow each other quickly. Pure and dependency free so it
 * can be tested directly: pass in the time of each click (milliseconds).
 *
 * `hit(now)` returns true on the click that completes a run of `count` clicks,
 * where no two neighbouring clicks are more than `gapMs` apart. After a run
 * completes (or a pause longer than `gapMs`), counting starts again from zero.
 */
export function createRapidClickCounter(options: { count: number; gapMs: number }) {
  const { count, gapMs } = options;
  let streak = 0;
  let last = Number.NEGATIVE_INFINITY;

  return {
    hit(now: number): boolean {
      if (now - last > gapMs) streak = 0;
      streak += 1;
      last = now;
      if (streak >= count) {
        streak = 0;
        last = Number.NEGATIVE_INFINITY;
        return true;
      }
      return false;
    },
    reset() {
      streak = 0;
      last = Number.NEGATIVE_INFINITY;
    },
    get streak() {
      return streak;
    },
  };
}
