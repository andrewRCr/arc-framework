/** Self-hosting policy composition for the neutral review-gate reducer. */

import {
  reduceReviewGate,
  type GateReductionDecision,
  type ReviewGateReductionInput,
  type ReviewSourceQualification,
} from "../../core/reduction.js";
import { resolveSelfHostingDecision } from "./decision.js";
import type { LaneDecision } from "./lane.js";
import { qualifyIndependentAnalysisSource } from "./qualification.js";
import type { ReviewRiskDecision } from "./risk.js";
import type { SelfHostingPolicy, SourceQualificationDeclaration } from "./schema.js";

/** Inputs retained by this repository's policy composition. */
export interface SelfHostingGateReductionInput extends Omit<
  ReviewGateReductionInput,
  "policyDecision" | "qualifications" | "lifecycleTailPredicateId"
> {
  policy: SelfHostingPolicy;
  lane: LaneDecision;
  risk: ReviewRiskDecision;
}

function qualification(declaration: SourceQualificationDeclaration): ReviewSourceQualification {
  const qualified = qualifyIndependentAnalysisSource(declaration, declaration.rubricVersion).qualified;
  return {
    sourceKind: declaration.sourceKind,
    qualifier: declaration.qualifier,
    sourceIdentity: declaration.sourceIdentity,
    qualifiedRubricVersions: qualified ? [declaration.rubricVersion] : [],
    transport: declaration.transport,
    requestMechanism: "automatic",
    requiredActorIdentity: null,
    requestCommand: null,
  };
}

/** Bind self-hosting policy data before invoking the host-neutral reducer. */
export function reduceSelfHostingGate(input: SelfHostingGateReductionInput): GateReductionDecision {
  return reduceReviewGate({
    ...input,
    policyDecision: resolveSelfHostingDecision(input),
    qualifications: input.policy.qualifications.map(qualification),
    lifecycleTailPredicateId: input.policy.lifecycleTailPredicate.id,
  });
}
