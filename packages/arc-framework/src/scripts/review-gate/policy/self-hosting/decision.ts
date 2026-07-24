/** Aggregate self-hosting review-policy decision. */

import type { NormalizedChangeRequest, ReviewRequirement } from "../../core/contracts.js";
import { computePolicyVersion } from "../../core/identity.js";
import {
  ReviewRoutingDecisionSchema,
  ReviewRoutingFactsSchema,
  type ReviewRoutingDecision,
  type ReviewRoutingFacts,
  type ReviewRoutingReason,
} from "../routing-schema.js";
import { parseSelfHostingPolicy, type SelfHostingPolicy } from "./schema.js";

/** Explanatory aggregate over independently retained requirements. */
export type ReviewDisposition = "required" | "recommended" | "exempt";

/** Stable policy decision bound to one exact change set. */
export interface SelfHostingDecision {
  schemaVersion: 1;
  routingFacts: ReviewRoutingFacts;
  routing: ReviewRoutingDecision;
  lane: "auto" | "reviewed";
  reviewRisk: "routine" | "sensitive";
  disposition: ReviewDisposition;
  reasons: ReviewRoutingReason[];
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
  routingFacts: ReviewRoutingFacts;
  routing: ReviewRoutingDecision;
}

/** Bind normalized routing, compatibility presentation, requirements, and stable identities into one decision. */
export function resolveSelfHostingDecision(input: SelfHostingDecisionInput): SelfHostingDecision {
  const policy = parseSelfHostingPolicy(input.policy);
  const routingFacts = ReviewRoutingFactsSchema.parse(input.routingFacts);
  const routing = ReviewRoutingDecisionSchema.parse(input.routing);
  const policyVersion = computePolicyVersion({ policy });
  const reasons = [...routing.reasons];
  const disposition = routing.standardReview;
  const lane = disposition === "exempt" ? "auto" : "reviewed";
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
    routingFacts,
    routing,
    lane,
    reviewRisk: routingFacts.reviewRisk,
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
