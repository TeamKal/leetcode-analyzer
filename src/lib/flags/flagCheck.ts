/**
 * Reads an account's private switch. Pure and dependency free so it can be
 * tested with a fake client. It fails closed: any problem (no id, an error, an
 * odd answer) means "off".
 *
 * A row can carry two options: `enabled` (false = switched off) and `heart_only`
 * (true = just the heart animation). If those columns do not exist yet, a row
 * simply means "on, full set", which is how it worked before they were added.
 */

export type MascotMode = "off" | "heart" | "full";

type FlagRow = { flag?: unknown; enabled?: unknown; heart_only?: unknown };

type Result = { data: FlagRow[] | null; error: unknown };

export type FlagClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(column: string, value: string): { limit(count: number): PromiseLike<Result> };
      };
    };
  };
};

function modeFromRows(rows: FlagRow[], flag: string): MascotMode {
  const row = rows.find((r) => r?.flag === flag);
  if (!row) return "off";
  if (row.enabled === false) return "off";
  if (row.heart_only === true) return "heart";
  return "full";
}

export async function checkMascotMode(
  client: FlagClient,
  userId: string | null | undefined,
  flag: string,
): Promise<MascotMode> {
  if (!userId || !flag) return "off";
  const read = (columns: string) =>
    client
      .from("profile_flags")
      .select(columns)
      .eq("user_id", userId)
      .eq("flag", flag)
      .limit(1);
  try {
    const first = await read("flag,enabled,heart_only");
    if (!first.error) {
      return Array.isArray(first.data) ? modeFromRows(first.data, flag) : "off";
    }
    // The option columns may not exist yet: fall back to the plain row.
    const plain = await read("flag");
    if (plain.error || !Array.isArray(plain.data)) return "off";
    return plain.data.some((r) => r?.flag === flag) ? "full" : "off";
  } catch {
    return "off";
  }
}
