/** Pure identity proof for one delivery member across a predecessor-changing rewrite. */

import type { MergeTreeCapabilityRefusalReason } from "../git/merge-tree-capability.js";

export interface DeliveryContributionCoordinate {
  readonly head: string;
  readonly tree: string;
}

export interface DeliveryContributionEndpoints {
  readonly before: {
    readonly predecessor: DeliveryContributionCoordinate;
    readonly member: DeliveryContributionCoordinate;
  };
  readonly after: {
    readonly predecessor: DeliveryContributionCoordinate;
    readonly member: DeliveryContributionCoordinate;
  };
}

export type DeliveryContributionProofResult =
  | { readonly status: "accepted"; readonly proof: "tree-equality" | "mechanical-reapply" }
  | { readonly status: "refused"; readonly reason: "contribution-conflicted"; readonly paths: readonly string[] }
  | { readonly status: "refused"; readonly reason: "contribution-diverged"; readonly paths: readonly string[] }
  | {
      readonly status: "refused";
      readonly reason:
        | "contribution-endpoints-unverified"
        | "git-failure"
        | MergeTreeCapabilityRefusalReason;
    };

/** One typed refusal from delivery contribution proof. */
export type DeliveryContributionRefusal = Extract<
  DeliveryContributionProofResult,
  { readonly status: "refused" }
>;

/** Pure decision at the boundary between the tree fast path and Git-backed reapplication. */
export type DeliveryContributionComparison =
  | Extract<DeliveryContributionProofResult, { readonly status: "accepted" }>
  | { readonly status: "reapply-required" };

/** Compare one pinned before/after contribution, preferring complete member-tree equality. */
export function compareDeliveryContribution(
  input: DeliveryContributionEndpoints,
): DeliveryContributionComparison {
  if (input.before.predecessor.head === input.after.predecessor.head
    && input.before.member.tree === input.after.member.tree) {
    return { status: "accepted", proof: "tree-equality" };
  }
  return { status: "reapply-required" };
}
