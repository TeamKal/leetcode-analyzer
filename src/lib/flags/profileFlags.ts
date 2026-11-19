import "server-only";

import { createAuthAdminClient } from "@/lib/supabase/admin";
import { checkMascotMode, type FlagClient, type MascotMode } from "./flagCheck";

/**
 * Server only. Reads the private per-account switch with the service role, so
 * the browser never sees the table or who is on it. Fails closed ("off").
 */
export async function getMascotMode(userId: string, flag: string): Promise<MascotMode> {
  try {
    return await checkMascotMode(
      createAuthAdminClient() as unknown as FlagClient,
      userId,
      flag,
    );
  } catch {
    return "off";
  }
}
