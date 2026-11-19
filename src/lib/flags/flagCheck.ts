/**
 * Reads an account's private switch. Pure and dependency free so it can be
 * tested with a fake client. It fails closed: any problem (no id, an error, an
 * odd answer) means "off".
 *
 * No row means "off" (no extras). A row means extras, and its `heart` column
 * decides whether the mascot plays by itself:
 *   heart = true  -> "auto":   starts with the heart, then the other animations;
 *   heart = false -> "manual": never plays by itself (only answers a direct
 *                              click or pointer).
 * If the column does not exist yet, a row means "auto" (how it worked before).
 */

export type MascotMode = "off" | "manual" | "auto";

type FlagRow = { flag?: unknown; heart?: unknown };

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
  return row.heart === false ? "manual" : "auto";
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
    const first = await read("flag,heart");
    if (!first.error) {
      return Array.isArray(first.data) ? modeFromRows(first.data, flag) : "off";
    }
    // The option columns may not exist yet: fall back to the plain row.
    const plain = await read("flag");
    if (plain.error || !Array.isArray(plain.data)) return "off";
    return plain.data.some((r) => r?.flag === flag) ? "auto" : "off";
  } catch {
    return "off";
  }
}
