/**
 * The "blocked" switch lives in the same private per-account table as the other
 * flags (public.profile_flags): a row with this flag means the account is blocked.
 * Pure and dependency free so it can be tested.
 */

export const BLOCKED_FLAG = "blocked";
/** Only accounts with this row can run the finale (and so be blocked by it). */
export const FINALE_FLAG = "blast_finale";

/** Only students are ever blocked; admins and mentors never are. */
export function canBeBlocked(role: string | null | undefined): boolean {
  return role === "student";
}

export function hasBlockedRow(rows: unknown): boolean {
  return (
    Array.isArray(rows) &&
    rows.some((r) => typeof r === "object" && r !== null && (r as { flag?: unknown }).flag === BLOCKED_FLAG)
  );
}
