/**
 * Counts every click and reports, once, the click that reaches `target`.
 * Unlike a rapid-click counter there is no time limit: ten clicks in total.
 * After it has fired it never fires again.
 */
export function createClickTally(target: number) {
  let count = 0;
  let fired = false;
  return {
    hit(): boolean {
      if (fired) return false;
      count += 1;
      if (count >= target) {
        fired = true;
        return true;
      }
      return false;
    },
    get count() {
      return count;
    },
  };
}
