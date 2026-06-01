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
 * Pure core: the caller enumerates the `chore/` branches and resolves each
 * one's PR / merge / age / meta-backing facts (git + the forge), so this module
 * carries no git or network coupling.
 *
 * @module
 */

import { errandSlugOf } from "./errand-branch.js";

/** Derived state of a single in-flight errand branch. */
export type InFlightErrandState = "in-progress" | "awaiting-merge" | "merged-cleanup" | "stale";

/** Caller-resolved facts for one candidate `chore/` branch. */
export interface InFlightErrandFacts {
  /** The errand's `chore/<slug>` branch name. */
  branch: string;
  /** Whether an active meta backs the branch — a promoted errand → WU, excluded from the sweep. */
  hasMeta: boolean;
  /** Whether the branch has an open PR on the forge. */
  hasOpenPr: boolean;
  /** Whether the branch is merged into the integration base. */
  merged: boolean;
  /** Whole-day age of the branch's latest commit — the staleness anchor. */
  ageDays: number;
}

/** One classified in-flight errand. */
export interface InFlightErrandReport {
  /** The `<slug>` after `chore/`. */
  slug: string;
  /** The errand's `chore/<slug>` branch name. */
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
 * Classify caller-enumerated `chore/` branches into in-flight errand states.
 *
 * Non-errand branches and meta-backed `chore/` branches (promoted errands →
 * work units) are excluded. State precedence: merged → `merged-cleanup`; else
 * an open PR → `awaiting-merge`; else aged past the threshold → `stale`; else
 * `in-progress`.
 *
 * @param options - Candidate branches with facts, and the staleness threshold.
 * @returns The classified in-flight errands.
 */
export function classifyInFlightErrands(
  options: ClassifyInFlightErrandsOptions,
): InFlightErrandSweepResult {
  const { branches, staleThresholdDays } = options;

  const errands: InFlightErrandReport[] = [];
  for (const { branch, hasMeta, hasOpenPr, merged, ageDays } of branches) {
    if (hasMeta) continue;
    const slug = errandSlugOf(branch);
    if (slug === null) continue;

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
