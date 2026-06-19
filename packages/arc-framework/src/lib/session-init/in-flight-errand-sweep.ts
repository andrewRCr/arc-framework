/**
 * In-flight-errand sweep — an orient-only session-init advisory over the
 * developer's execution-only `chore/<slug>` errand branches.
 *
 * Errands carry no meta and no queue, so their state is derived from the branch
 * + PR: a meta-less `chore/` branch with no PR is in-progress; with an open PR,
 * awaiting-merge; once merged, a merged-cleanup that the branch teardown should
 * follow; and an in-progress errand aged past the threshold is stale (a
 * promote-or-finish nudge). It mirrors the stale-worktree sweep's advisory role
 * — surfaced, never auto-acted-on.
 *
 * Pure core: the caller enumerates the errand branches and resolves each one's
 * identity (the record slug) and its PR / merge / age facts (git + the forge),
 * so this module carries no git or network coupling. Errand-vs-WU classification
 * is the oracle's job upstream — every fact that reaches here is already an
 * errand.
 *
 * @module
 */

/** Derived state of a single in-flight errand branch. */
export type InFlightErrandState = "in-progress" | "awaiting-merge" | "merged-cleanup" | "stale";

/** Caller-resolved facts for one in-flight errand branch. */
export interface InFlightErrandFacts {
  /** The errand's record slug — its identity, resolved from the record (branch-derived for a legacy branch). */
  slug: string;
  /** The errand's branch name. */
  branch: string;
  /** Whether the branch has an open PR on the forge. */
  hasOpenPr: boolean;
  /** Whether the branch is merged into the integration base. */
  merged: boolean;
  /** Whole-day age of the branch's latest commit — the staleness anchor. */
  ageDays: number;
}

/** One classified in-flight errand. */
export interface InFlightErrandReport {
  /** The errand's record slug. */
  slug: string;
  /** The errand's branch name. */
  branch: string;
  /** Derived state. */
  state: InFlightErrandState;
  /** Whole-day age of the branch's latest commit. */
  ageDays: number;
}

export interface ClassifyInFlightErrandsOptions {
  /** Caller-enumerated candidate branches with their resolved facts. */
  branches: readonly InFlightErrandFacts[];
  /** Age threshold in whole days; an in-progress errand strictly older is stale. */
  staleThresholdDays: number;
}

export interface InFlightErrandSweepResult {
  /** The classified in-flight errands (excludes non-errand and meta-backed branches). */
  errands: InFlightErrandReport[];
}

/**
 * Classify caller-enumerated errand branches into in-flight errand states.
 *
 * State precedence: merged → `merged-cleanup`; else an open PR →
 * `awaiting-merge`; else aged past the threshold → `stale`; else `in-progress`.
 *
 * @param options - Errand branches with facts (including the record slug), and the staleness threshold.
 * @returns The classified in-flight errands.
 */
export function classifyInFlightErrands(
  options: ClassifyInFlightErrandsOptions,
): InFlightErrandSweepResult {
  const { branches, staleThresholdDays } = options;

  const errands: InFlightErrandReport[] = [];
  for (const { slug, branch, hasOpenPr, merged, ageDays } of branches) {
    const state: InFlightErrandState = merged
      ? "merged-cleanup"
      : hasOpenPr
        ? "awaiting-merge"
        : ageDays > staleThresholdDays
          ? "stale"
          : "in-progress";

    errands.push({ slug, branch, state, ageDays });
  }
  return { errands };
}
