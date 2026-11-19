import "server-only";

import { createAuthAdminClient } from "@/lib/supabase/admin";
import { checkProfileFlag, type FlagClient } from "./flagCheck";

/**
 * Server only. Reads the private per-account switches with the service role, so
 * the browser never sees the table or who is on it. Fails closed.
 */
export async function hasProfileFlag(userId: string, flag: string): Promise<boolean> {
  try {
    return await checkProfileFlag(
      createAuthAdminClient() as unknown as FlagClient,
      userId,
      flag,
    );
  } catch {
    return false;
  }
}
