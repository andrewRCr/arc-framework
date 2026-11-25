/** Bounded acquisition and expected tracking-ref changes for live in-flight candidates. */

import type { GitExec } from "./exec.js";
import {
  DEFAULT_NETWORK_TIMEOUT_MS,
  fetchRefsBounded,
  type InFlightBranchSet,
  type LocalInFlightRefSnapshot,
  type RefTipMap,
} from "./remote-ref-reader.js";

const EXCLUDED_BRANCH_PREFIXES = ["delivery/", "review-projection/"] as const;

/** Exclude delivery-owned branches and review projections from general in-flight discovery. */
export function isExcludedInFlightBranch(branch: string): boolean {
  return EXCLUDED_BRANCH_PREFIXES.some((prefix) => branch.startsWith(prefix));
}

/** Fetch live-only candidates in one bounded batch, including never-fetched Errand branches. */
export async function expandLiveOnlyCandidates(input: {
  exec: GitExec;
  branchSet: InFlightBranchSet;
  localRefs: LocalInFlightRefSnapshot;
  remote: string;
  timeoutMs?: number;
  enabled: boolean;
  excludedBranches: ReadonlySet<string>;
}): Promise<{ refs: RefTipMap; failedBranches: string[] }> {
  if (!input.enabled || !input.branchSet.reachable) return { refs: {}, failedBranches: [] };
  const candidates = Object.entries(input.branchSet.liveRefs).map(([ref, sha]) => ({
    branch: branchFromRef(ref, input.remote), sha,
  })).filter(({ branch, sha }) => !isExcludedInFlightBranch(branch)
    && (!input.excludedBranches.has(branch) || input.localRefs.remoteTracking[branch] === undefined)
    && input.localRefs.remoteTracking[branch] !== sha);
  const fetched = new Set(await fetchRefsBounded({
    exec: input.exec, remote: input.remote, branches: candidates.map(({ branch }) => branch),
    timeoutMs: input.timeoutMs, totalTimeoutMs: input.timeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS,
  }));
  return {
    refs: Object.fromEntries(candidates.filter(({ branch }) => fetched.has(branch))
      .map(({ branch, sha }) => [`${input.remote}/${branch}`, sha])),
    failedBranches: candidates.filter(({ branch }) => !fetched.has(branch)).map(({ branch }) => branch),
  };
}

/** Account only for this acquisition's tracking updates observed at the captured remote tips. */
export function accountForFetchedTracking(
  before: LocalInFlightRefSnapshot,
  after: LocalInFlightRefSnapshot,
  fetchedRefs: RefTipMap,
  remote: string,
): LocalInFlightRefSnapshot {
  const remoteTracking = { ...before.remoteTracking };
  for (const [ref, sha] of Object.entries(fetchedRefs)) {
    const branch = branchFromRef(ref, remote);
    if (after.remoteTracking[branch] === sha) remoteTracking[branch] = sha;
  }
  return { ...before, remoteTracking };
}

function branchFromRef(ref: string, remote: string): string {
  const prefix = `${remote}/`;
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}
