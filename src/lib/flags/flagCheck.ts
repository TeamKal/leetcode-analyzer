/**
 * Whether an account has a server-side switch turned on. Pure and dependency
 * free so it can be tested with a fake client. It fails closed: any problem
 * (no id, an error, an odd answer) means "off".
 */

type FlagRow = { flag?: unknown };

export type FlagClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          limit(count: number): PromiseLike<{ data: FlagRow[] | null; error: unknown }>;
        };
      };
    };
  };
};

export async function checkProfileFlag(
  client: FlagClient,
  userId: string | null | undefined,
  flag: string,
): Promise<boolean> {
  if (!userId || !flag) return false;
  try {
    const { data, error } = await client
      .from("profile_flags")
      .select("flag")
      .eq("user_id", userId)
      .eq("flag", flag)
      .limit(1);
    if (error || !Array.isArray(data)) return false;
    return data.some((row) => row?.flag === flag);
  } catch {
    return false;
  }
}
