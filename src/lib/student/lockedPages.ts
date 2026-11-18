/**
 * Student pages that are switched off for now. Flip one to `false` to open it
 * again: the navigation, the page itself and the links that point to it all read
 * from here. (Pure module, no imports, so it can be tested on its own.)
 */
export const LOCKED_STUDENT_PAGES = {
  submissions: true,
  profile: true,
} as const;

export function isPageLocked(key: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(LOCKED_STUDENT_PAGES, key) &&
    LOCKED_STUDENT_PAGES[key as keyof typeof LOCKED_STUDENT_PAGES]
  );
}
