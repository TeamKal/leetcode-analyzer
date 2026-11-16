// Resolves the problem text used as grading context: DB first, then a one-time
// live fetch that is saved back so each problem is fetched at most once.
// Pure module: all I/O is injected.

export type StoredProblem = {
  id: string;
  title: string;
  difficulty: string | null;
  description: string | null;
};

export type ProblemContext = {
  problemId: string | null;
  title: string;
  difficulty: string | null;
  // Plain-text statement/topics/hints; null when no public statement exists.
  promptText: string | null;
};

export type ProblemContextDependencies = {
  lookup: (slug: string) => Promise<StoredProblem | null>;
  fetchDetails: (slug: string) => Promise<{
    title: string;
    difficulty: string | null;
    promptText: string | null;
  } | null>;
  saveDescription: (problemId: string, promptText: string) => Promise<void>;
};

export async function resolveProblemContext(
  slug: string,
  fallbackTitle: string,
  dependencies: ProblemContextDependencies,
): Promise<ProblemContext> {
  let stored: StoredProblem | null = null;
  try {
    stored = await dependencies.lookup(slug);
  } catch {
    stored = null;
  }

  if (stored?.description?.trim()) {
    return {
      problemId: stored.id,
      title: stored.title,
      difficulty: stored.difficulty,
      promptText: stored.description,
    };
  }

  let details: Awaited<ReturnType<ProblemContextDependencies["fetchDetails"]>> =
    null;
  try {
    details = await dependencies.fetchDetails(slug);
  } catch {
    details = null;
  }

  if (stored && details?.promptText) {
    try {
      await dependencies.saveDescription(stored.id, details.promptText);
    } catch {
      // Not saved; it will simply be fetched again next time.
    }
  }

  return {
    problemId: stored?.id ?? null,
    title: stored?.title ?? details?.title ?? fallbackTitle,
    difficulty: stored?.difficulty ?? details?.difficulty ?? null,
    promptText: details?.promptText ?? null,
  };
}
