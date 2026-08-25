/** Content-containment classification for adopting a delivery chain beneath its originating branch. */

import type { RawGitExec } from "../change-facts.js";
import type { MergeTreeCapabilityRefusalReason } from "../git/merge-tree-capability.js";
import type { DeliveryContributionCoordinate } from "./contribution-proof.js";
import { proveGitDeliveryContribution } from "./git-contribution-proof.js";

/** Exact coordinates whose structural relationship is classified before ancestry adoption. */
export interface DeliveryChainContainmentInput {
  readonly commonBase: DeliveryContributionCoordinate;
  readonly top: DeliveryContributionCoordinate;
  readonly highestMember: DeliveryContributionCoordinate;
}

/** Closed containment result, intentionally distinct from contribution equivalence. */
export type DeliveryChainContainmentResult =
  | { readonly status: "contained" }
  | { readonly status: "refused"; readonly reason: "containment-conflicted"; readonly paths: readonly string[] }
  | { readonly status: "refused"; readonly reason: "containment-diverged"; readonly paths: readonly string[] }
  | {
      readonly status: "refused";
      readonly reason: "containment-endpoints-unverified" | "git-failure" | MergeTreeCapabilityRefusalReason;
    };

/** Reapply the highest member onto the top and require the top tree to remain unchanged. */
export async function classifyGitDeliveryChainContainment(
  input: DeliveryChainContainmentInput & { readonly exec: RawGitExec },
): Promise<DeliveryChainContainmentResult> {
  const result = await proveGitDeliveryContribution({
    exec: input.exec,
    before: { predecessor: input.commonBase, member: input.highestMember },
    after: { predecessor: input.top, member: input.top },
  });
  if (result.status === "accepted") return { status: "contained" };
  if (result.reason === "contribution-conflicted") {
    return { status: "refused", reason: "containment-conflicted", paths: result.paths };
  }
  if (result.reason === "contribution-diverged") {
    return { status: "refused", reason: "containment-diverged", paths: result.paths };
  }
  return {
    status: "refused",
    reason: result.reason === "contribution-endpoints-unverified"
      ? "containment-endpoints-unverified"
      : result.reason,
  };
}
