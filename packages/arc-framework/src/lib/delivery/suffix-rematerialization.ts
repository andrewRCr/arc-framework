/** Preparation of a complete review-fix suffix from the retained control branch. */

import { canonicalize, type CanonicalDigest } from "../kernel/index.js";
import { classifyDeliveryPlanAmendment, type DeliveryPlanAmendmentResult } from "./amendment.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
} from "./contribution-proof.js";
import type { DeliveryEligibilitySnapshot } from "./eligibility.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";

/** One bound non-terminal ref that must be rewritten from the validated suffix. */
export interface DeliverySuffixRewritePlan {
  readonly deliverableId: string;
  readonly selectedChange: boolean;
  readonly requested: DeliveryOperationSnapshotV1;
}

/** Closed preparation result; no state or remote mutation occurs here. */
export type PrepareDeliverySuffixRematerializationResult =
  | { readonly status: "prepared"; readonly rewrites: readonly DeliverySuffixRewritePlan[] }
  | { readonly status: "plan-amendment"; readonly disposition: DeliveryPlanAmendmentResult }
  | {
      readonly status: "refused";
      readonly reason:
        | "position-mismatch"
        | "snapshot-mismatch"
        | "suffix-incomplete"
        | "selected-member-invalid"
        | "direct-delivery-ref"
        | "unselected-contribution-changed";
    };

/**
 * Validate one already-closed, complete suffix before workflow gates authorize any rewrite reservation.
 * Selected members may change contribution; every unselected member must carry its exact authored contribution.
 */
export async function prepareDeliverySuffixRematerialization(input: {
  readonly plan: DeliveryPlanV1;
  readonly proposedPlan?: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly facts: DeliveryPositionFactsV1;
  readonly eligibleSnapshot: DeliveryEligibilitySnapshot;
  readonly selectedDeliverableIds: readonly string[];
  proveCarried(endpoints: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
}): Promise<PrepareDeliverySuffixRematerializationResult> {
  const position = deriveDeliveryPosition(input.plan, input.state, input.facts);
  if (position.status !== "derived") return { status: "refused", reason: "position-mismatch" };
  const landedCount = position.position.landedPrefix.length;
  if (input.proposedPlan !== undefined) {
    return {
      status: "plan-amendment",
      disposition: classifyDeliveryPlanAmendment({
        current: input.plan,
        proposed: input.proposedPlan,
        boundDeliverableIds: input.state.members
          .filter((member) => member.ref !== null || member.changeRequest !== null || member.coordinates !== null)
          .map((member) => member.deliverableId as CanonicalDigest),
        landedDeliverableIds: position.position.landedPrefix,
      }),
    };
  }
  const snapshot = input.eligibleSnapshot;
  if (snapshot.planId !== input.plan.planId || snapshot.workUnitId !== input.plan.workUnitId
    || snapshot.planRevision !== input.plan.planRevision || snapshot.planDigest !== input.plan.planDigest
    || input.state.target?.coordinates === null || input.state.target === null
    || canonicalize(snapshot.protectedBase) !== canonicalize({
      ref: input.state.target.ref,
      ...input.state.target.coordinates,
    })) return { status: "refused", reason: "snapshot-mismatch" };

  const suffix = input.plan.members.slice(landedCount);
  if (suffix.length === 0 || snapshot.members.length !== suffix.length
    || snapshot.members.some((member, index) => member.deliverableId !== suffix[index]?.deliverableId)) {
    return { status: "refused", reason: "suffix-incomplete" };
  }
  if (snapshot.members.some((member) => member.ref.startsWith("refs/heads/delivery/"))) {
    return { status: "refused", reason: "direct-delivery-ref" };
  }
  const selected = new Set(input.selectedDeliverableIds);
  const suffixIds = new Set(suffix.map((member) => member.deliverableId));
  if (selected.size === 0 || selected.size !== input.selectedDeliverableIds.length
    || input.selectedDeliverableIds.some((id) => !suffixIds.has(id))) {
    return { status: "refused", reason: "selected-member-invalid" };
  }

  for (const [suffixIndex, candidate] of snapshot.members.entries()) {
    if (selected.has(candidate.deliverableId)) continue;
    const stateIndex = landedCount + suffixIndex;
    const stored = input.state.members[stateIndex];
    const beforePredecessor = suffixIndex === 0
      ? input.state.target.coordinates
      : input.state.members[stateIndex - 1]?.coordinates;
    const afterPredecessor = suffixIndex === 0 ? snapshot.protectedBase : snapshot.members[suffixIndex - 1];
    if (stored?.coordinates === null || stored?.coordinates === undefined
      || beforePredecessor === null || beforePredecessor === undefined || afterPredecessor === undefined
      || (await input.proveCarried({
        before: { predecessor: beforePredecessor, member: stored.coordinates },
        after: { predecessor: afterPredecessor, member: candidate },
      })).status !== "accepted") {
      return { status: "refused", reason: "unselected-contribution-changed" };
    }
  }

  const rewrites: DeliverySuffixRewritePlan[] = [];
  for (const [suffixIndex, candidate] of snapshot.members.slice(0, -1).entries()) {
    const stored = input.state.members[landedCount + suffixIndex];
    const predecessor = suffixIndex === 0 ? snapshot.protectedBase : snapshot.members[suffixIndex - 1];
    if (stored?.ref === null || stored?.ref === undefined || stored.coordinates === null || predecessor === undefined) {
      return { status: "refused", reason: "snapshot-mismatch" };
    }
    rewrites.push({
      deliverableId: stored.deliverableId,
      selectedChange: selected.has(stored.deliverableId),
      requested: {
        target: input.state.target,
        members: [{
          deliverableId: stored.deliverableId,
          ref: stored.ref,
          changeRequest: stored.changeRequest,
          coordinates: { base: predecessor.head, head: candidate.head, tree: candidate.tree },
        }],
      },
    });
  }
  return { status: "prepared", rewrites };
}
