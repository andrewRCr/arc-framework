/** Aggregate self-hosting review-policy decision. */

import type { NormalizedChangeRequest, ReviewRequirement } from "../../core/contracts.js";
import { computePolicyVersion } from "../../core/identity.js";
import type { LaneDecision, LaneReason } from "./lane.js";
import type { ReviewRiskDecision, ReviewRiskReason } from "./risk.js";
import { parseSelfHostingPolicy, type SelfHostingPolicy } from "./schema.js";

/** Explanatory aggregate over independently retained requirements. */
export type ReviewDisposition = "required" | "recommended" | "exempt";

/** Stable policy decision bound to one exact change set. */
export interface SelfHostingDecision {
  schemaVersion: 1;
  lane: "auto" | "reviewed";
  reviewRisk: "routine" | "sensitive";
  disposition: ReviewDisposition;
  reasons: Array<LaneReason | ReviewRiskReason>;
  policyVersion: string;
  baseRef: string;
  baseSha: string;
  diffBaseSha: string;
  headSha: string;
  changeSetId: string;
  requirements: ReviewRequirement[];
}

/** Inputs to the aggregate policy decision. */
export interface SelfHostingDecisionInput {
  policy: SelfHostingPolicy;
  changeRequest: NormalizedChangeRequest;
  lane: LaneDecision;
  risk: ReviewRiskDecision;
}

/** Bind lane, risk, requirements, and stable identities into one decision. */
export function resolveSelfHostingDecision(input: SelfHostingDecisionInput): SelfHostingDecision {
  const policy = parseSelfHostingPolicy(input.policy);
  const policyVersion = computePolicyVersion({ policy });
  const reasons = [...input.lane.reasons, ...input.risk.reasons];
  const disposition: ReviewDisposition = input.lane.lane === "auto"
    ? "exempt"
    : input.risk.risk === "sensitive" ? "required" : "recommended";
  const requirements: ReviewRequirement[] = disposition === "exempt"
    ? []
    : policy.requirementTemplates.map((template) => ({
        schemaVersion: 1,
        ...template,
        obligation: disposition,
        policyVersion,
        reasons,
        changeSetId: input.changeRequest.changeSetId,
        headSha: input.changeRequest.headSha,
      }));

  return {
    schemaVersion: 1,
    lane: input.lane.lane,
    reviewRisk: input.risk.risk,
    disposition,
    reasons,
    policyVersion,
    baseRef: input.changeRequest.baseRef,
    baseSha: input.changeRequest.baseSha,
    diffBaseSha: input.changeRequest.diffBaseSha,
    headSha: input.changeRequest.headSha,
    changeSetId: input.changeRequest.changeSetId,
    requirements,
  };
}
