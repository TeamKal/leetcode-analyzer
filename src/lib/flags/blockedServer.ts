import "server-only";

import { createAuthAdminClient } from "@/lib/supabase/admin";
import { BLOCKED_FLAG, FINALE_FLAG, hasBlockedRow } from "./blocked";

/**
 * Server only (service role; the browser roles cannot read the table).
 * Fails open: if the lookup breaks, nobody is locked out by mistake.
 */
export async function isUserBlocked(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAuthAdminClient()
      .from("profile_flags")
      .select("flag")
      .eq("user_id", userId)
      .eq("flag", BLOCKED_FLAG)
      .limit(1);
    return !error && hasBlockedRow(data);
  } catch {
    return false;
  }
}

/** Marks the account blocked. Safe to call twice. Returns whether it is now recorded. */
export async function blockUser(userId: string): Promise<boolean> {
  try {
    const { error } = await createAuthAdminClient()
      .from("profile_flags")
      .upsert({ user_id: userId, flag: BLOCKED_FLAG }, { onConflict: "user_id,flag" });
    return !error;
  } catch {
    return false;
  }
}

/** Server only. True only for accounts you listed with the finale flag. Fails closed. */
export async function canRunFinale(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createAuthAdminClient()
      .from("profile_flags")
      .select("flag")
      .eq("user_id", userId)
      .eq("flag", FINALE_FLAG)
      .limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
