/**
 * Materializable-Errand projection from exact identity and branch evidence.
 *
 * A candidate requires both an ordinary-v3 resumable identity tail and a
 * remote-only branch observation. The identity supplies the immutable claim,
 * expected head, and dispatch context; recordless branches never authorize a
 * materialization.
 *
 * @module
 */

import type { TransientIdentityRecord } from "../errand/identity-record.js";
/** One exact ordinary-v3 identity tail that can be materialized. */
export interface MaterializableErrand {
  slug: string;
  claimId: string;
  branch: string;
  expectedHead: string;
  state: "paused" | "awaiting-merge";
  originEntry: string | null;
}

export interface FindMaterializableErrandsOptions {
  /** Complete identity records whose exact generation authorizes resume. */
  records: readonly TransientIdentityRecord[];
  /** Live remote tips keyed by branch short-name. */
  remoteTips: ReadonlyMap<string, string>;
  /** Branches already represented by a local head or worktree. */
  locallyPresentBranches: ReadonlySet<string>;
}

export interface MaterializableErrandsResult {
  /** Remote-only errands materializable as cross-machine resumes. */
  candidates: MaterializableErrand[];
}

/**
 * Select exact resumable identities with matching remote-only branch evidence.
 *
 * @param options - Complete identities plus advertised and local branch presence.
 * @returns Stable exact-generation materialization projections.
 */
export function findMaterializableErrands(
  options: FindMaterializableErrandsOptions,
): MaterializableErrandsResult {
  const candidates = options.records.flatMap((record): MaterializableErrand[] => {
    if (record.kind !== "errand" || record.purpose !== "errand") return [];
    if (!options.remoteTips.has(record.branch) || options.locallyPresentBranches.has(record.branch)) return [];
    const generation = record.state === "paused"
      ? { expectedHead: record.savedHead, state: record.state }
      : record.state === "awaiting-merge" && record.changeRequest.headRef === record.branch
        ? { expectedHead: record.changeRequest.headSha, state: record.state }
        : null;
    if (generation === null || options.remoteTips.get(record.branch) !== generation.expectedHead) return [];
    return [{
      slug: record.slug,
      claimId: record.claimId,
      branch: record.branch,
      expectedHead: generation.expectedHead,
      state: generation.state,
      originEntry: record.originEntry,
    }];
  });
  return { candidates: candidates.sort((left, right) => left.slug.localeCompare(right.slug)) };
}
