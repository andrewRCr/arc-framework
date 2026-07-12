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
import { buildCodexReviewCommand } from "../../providers/codex/adapter.js";
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
  prAuthorIdentity?: string;
}

function qualification(
  declaration: SourceQualificationDeclaration,
  prAuthorIdentity: string,
): ReviewSourceQualification {
  const qualified = qualifyIndependentAnalysisSource(declaration, declaration.rubricVersion).qualified;
  const userTriggered = declaration.requestActor === "pr-author";
  return {
    sourceKind: declaration.sourceKind,
    qualifier: declaration.qualifier,
    sourceIdentity: declaration.sourceIdentity,
    qualifiedRubricVersions: qualified ? [declaration.rubricVersion] : [],
    transport: declaration.transport,
    requestMechanism: userTriggered ? "user-trigger" : "automatic",
    requiredActorIdentity: userTriggered ? prAuthorIdentity : null,
    requestCommand: declaration.sourceIdentity === "codex-pr" && declaration.guidanceDigest !== null
      ? buildCodexReviewCommand(declaration.guidanceDigest)
      : null,
    closureCapability: declaration.closureCapability,
  };
}

/** Bind self-hosting policy data before invoking the host-neutral reducer. */
export function reduceSelfHostingGate(input: SelfHostingGateReductionInput): GateReductionDecision {
  return reduceReviewGate({
    ...input,
    policyDecision: resolveSelfHostingDecision(input),
    qualifications: input.policy.qualifications.map((declaration) => qualification(
      declaration,
      input.prAuthorIdentity ?? input.actorIdentity,
    )),
    lifecycleTailPredicateId: input.policy.lifecycleTailPredicate.id,
  });
}
