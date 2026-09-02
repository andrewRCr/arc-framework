/** Composition of delivery-specific evidence into the integration checkpoint. */

import type {
  CandidateCurrentnessProjection,
  CandidateManagedRecordV1,
} from "../../lib/work-unit/candidate-attestation.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
} from "../../lib/delivery/contribution-proof.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../lib/delivery/schema.js";
import {
  assessDeliveryTerminalChecks,
  assessDeliveryTerminalTop,
  composeDeliveryTerminalClaim,
  type DeliveryTerminalCheckResult,
  type DeliveryTerminalClaimResult,
  type DeliveryTerminalLanding,
  type DeliveryTerminalReviewTarget,
  type DeliveryTerminalTopObservation,
  type DeliveryTerminalTopResult,
} from "../../lib/delivery/terminal-integration.js";

export type DeliveryCheckpointArmResult =
  | { readonly status: "not-applicable" }
  | {
      readonly status: "ready";
      readonly claim: Extract<DeliveryTerminalClaimResult, { readonly status: "composed" }>;
      readonly checks: Extract<DeliveryTerminalCheckResult, { readonly status: "ready" }>;
      readonly top: Extract<DeliveryTerminalTopResult, { readonly status: "ready" }>;
    }
  | {
      readonly status: "blocked";
      readonly nextAction: "stop" | "retarget" | "reopen-and-retarget" | "verify-terminal-member";
      readonly reason: string;
      readonly detail?: string;
      readonly deliverableId?: string;
      readonly paths?: readonly string[];
      readonly proof?: Extract<DeliveryContributionProofResult, { readonly status: "refused" }>;
      readonly remedy?: Extract<DeliveryTerminalTopResult, {
        readonly reason: "top-target-mismatch";
      }>["remedy"];
    };

/** Compose the terminal claim and its publication, top-target, and review checks as one checkpoint arm. */
export async function composeDeliveryCheckpointArm(input: {
  readonly record: CandidateManagedRecordV1;
  readonly candidate: Extract<CandidateCurrentnessProjection, { readonly status: "current" }>;
  readonly plan: DeliveryPlanV1 | null;
  readonly state: DeliveryStateV1 | null;
  readonly landings: readonly DeliveryTerminalLanding[];
  readonly terminalDelta: DeliveryContributionEndpoints["after"];
  readonly protectedBaseRef: string;
  readonly publication: { readonly candidateId: string; readonly head: string };
  readonly top: DeliveryTerminalTopObservation;
  readonly review: {
    readonly status: "discharged" | "outstanding";
    readonly targets: readonly DeliveryTerminalReviewTarget[];
  };
  readCandidateCoordinate(head: string): Promise<DeliveryContributionEndpoints["before"]["member"] | null>;
  proveResidual(endpoints: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
}): Promise<DeliveryCheckpointArmResult> {
  const claim = await composeDeliveryTerminalClaim(input);
  if (claim.status === "not-applicable") return claim;
  if (claim.status === "refused") {
    return {
      status: "blocked",
      nextAction: "stop",
      reason: claim.reason,
      ...(claim.deliverableId === undefined ? {} : { deliverableId: claim.deliverableId }),
      ...(claim.proof === undefined ? {} : { proof: claim.proof }),
    };
  }
  const top = assessDeliveryTerminalTop({
    terminal: true,
    protectedBaseRef: input.protectedBaseRef,
    publicationHead: input.publication.head,
    request: input.top,
  });
  if (top.status !== "ready") {
    return top.status === "refused" && top.reason === "top-target-mismatch"
      ? {
          status: "blocked",
          nextAction: top.remedy.nextAction,
          reason: top.reason,
          remedy: top.remedy,
        }
      : { status: "blocked", nextAction: "stop", reason: "top-request-mismatch" };
  }
  if (input.state === null) return { status: "blocked", nextAction: "stop", reason: "state-mismatch" };
  const checks = assessDeliveryTerminalChecks({
    claim,
    state: input.state,
    publication: input.publication,
    review: input.review,
  });
  if (checks.status === "refused") {
    return {
      status: "blocked",
      nextAction: "stop",
      reason: checks.reason,
      ...(checks.deliverableId === undefined ? {} : { deliverableId: checks.deliverableId }),
    };
  }
  return { status: "ready", claim, checks, top };
}
