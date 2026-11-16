// Pure Deepgram pre-recorded client. No framework imports so it is unit-testable.
// The API key is only ever sent in the Authorization header and never logged.

export const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";

// Nova-3 keyterm prompting (limit: 500 tokens per request). Vocabulary students
// commonly use when explaining LeetCode solutions.
export const LEETCODE_KEYTERMS = [
  "hash map",
  "hash table",
  "hash set",
  "two pointers",
  "sliding window",
  "binary search",
  "time complexity",
  "space complexity",
  "big O",
  "O of n",
  "O of n log n",
  "O of n squared",
  "O of one",
  "linked list",
  "binary tree",
  "depth first search",
  "breadth first search",
  "dynamic programming",
  "memoization",
  "recursion",
  "backtracking",
  "priority queue",
  "min heap",
  "max heap",
  "monotonic stack",
  "prefix sum",
  "topological sort",
  "union find",
  "trie",
  "edge cases",
  "brute force",
  "in place",
  "amortized",
  "subarray",
  "substring",
  "palindrome",
  "bit manipulation",
  "Kadane's algorithm",
  "Dijkstra",
] as const;

export type DeepgramFailure =
  | "misconfigured" // missing/invalid API key
  | "unavailable" // provider down, rate limited, or out of credit
  | "rejected" // provider could not fetch or decode the media
  | "timeout"
  | "empty"; // no speech recognized

export type DeepgramResult =
  | { ok: true; transcript: string; durationSeconds: number | null }
  | { ok: false; reason: DeepgramFailure };

export function buildDeepgramUrl(): string {
  const params = [
    "model=nova-3",
    "language=en",
    "smart_format=true",
    "punctuate=true",
    // Keep student audio out of Deepgram's model-improvement program.
    "mip_opt_out=true",
    ...LEETCODE_KEYTERMS.map((term) => `keyterm=${encodeURIComponent(term)}`),
  ];
  return `${DEEPGRAM_LISTEN_URL}?${params.join("&")}`;
}

function statusToFailure(status: number): DeepgramFailure {
  if (status === 401 || status === 403) return "misconfigured";
  if (status === 400 || status === 415 || status === 422) return "rejected";
  return "unavailable";
}

export async function transcribeWithDeepgram(input: {
  audioUrl: string;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<DeepgramResult> {
  if (!input.apiKey) return { ok: false, reason: "misconfigured" };

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 50_000);

  try {
    const response = await fetchImpl(buildDeepgramUrl(), {
      method: "POST",
      headers: {
        Authorization: `Token ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: input.audioUrl }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, reason: statusToFailure(response.status) };
    }

    const data = (await response.json()) as {
      results?: {
        channels?: { alternatives?: { transcript?: unknown }[] }[];
      };
      metadata?: { duration?: unknown };
    };
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof transcript !== "string" || !transcript.trim()) {
      return { ok: false, reason: "empty" };
    }
    const duration = data?.metadata?.duration;
    return {
      ok: true,
      transcript: transcript.trim(),
      durationSeconds:
        typeof duration === "number" && Number.isFinite(duration)
          ? duration
          : null,
    };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" };
    void error; // Never surface provider or network error text.
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
