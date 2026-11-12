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

import type { StoreIdentityAcquisition } from "../errand/store-discovery.js";
import type { z } from "zod";
import { MaterializableErrandSchema } from "./errand-state-schema.js";
import type { TransientIdentityRecord } from "../errand/identity-record.js";
/** One exact ordinary-v3 identity tail that can be materialized. */
export type MaterializableErrand = z.infer<typeof MaterializableErrandSchema>;

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
      actions: [{ text: `arc errand materialize ${record.slug} --claim-id ${record.claimId} --expected-head ${generation.expectedHead} --json`,
        argv: ["arc", "errand", "materialize", record.slug, "--claim-id", record.claimId,
          "--expected-head", generation.expectedHead, "--json"] }],
    }];
  });
  return { candidates: candidates.sort((left, right) => left.slug.localeCompare(right.slug)) };
}

/** Select active ordinary Errands by their record owner before resume or materialization. */
export function ownedActiveErrandRecords(acquisition: StoreIdentityAcquisition, identity: string | null): TransientIdentityRecord[] {
  if (acquisition.kind !== "complete" || identity === null) return [];
  const active = new Set(acquisition.records.filter(record => record.reference.kind === "work-item/record" && record.placement?.kind === "active")
    .map(record => record.reference.owner.name));
  return [...acquisition.decoded.values()].filter(record => record.kind === "errand" && record.purpose === "errand"
    && record.owner === identity && active.has(record.slug));
}
