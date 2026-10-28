/** Compose stored pass judgments and the existing per-call lane invocation before pure policy runs. */
import { requireNativeReviewDecisionReferences } from "./review-grant-references.js";
import { omitSpentReviewCeilingOverride } from "./review-ceiling-override.js";
import type { NativeOwnerAcceptedReviewTerminus } from "./review-terminus.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneProgressProjection } from "../lane-progress.js";
import type { ReviewLaneJudgment, ReviewPolicyCommandRequest, ReviewPolicyBoundRequest } from "./review-policy-driver.js";
import type { CandidateRead, PrePublicationCompositionDependencies, ReviewLane, ReviewPolicyTarget } from "./pre-publication-request.js";

/** Bind native grants to their actual Candidate subject or review target without changing caller routing inputs. */
export async function composePrePublicationLaneJudgment(input: {
  candidate: Extract<CandidateRead, { status: "current" }>; lane: ReviewLane; lineage?: LaneSubjectLineage;
  policyTarget: ReviewPolicyTarget; exactTarget: ReviewTarget | null; progress: LaneProgressProjection;
  judgment?: ReviewLaneJudgment; dependencies: PrePublicationCompositionDependencies;
}): Promise<{
  completedPasses: number; currentLineage: LaneSubjectLineage; judgment?: ReviewLaneJudgment;
  invocation: ReviewLaneJudgment["invocation"]; frontlinePhaseClosed?: true; terminus?: NativeOwnerAcceptedReviewTerminus;
  extraPassAuthority: Pick<ReviewPolicyCommandRequest, "ceilingOverride" | "additionalPassAuthorization">;
}> {
  const { candidate, lane, lineage, policyTarget, exactTarget, progress, dependencies } = input;
  const completedPasses = progress.status === "recorded" ? progress.completedPasses : 0;
  const currentLineage = lineage ?? { kind: "candidate" as const, candidateId: candidate.candidateId };
  const subject = { lineage: currentLineage, headSha: policyTarget.headSha,
    subjectDigest: currentLineage.kind === "candidate" ? candidate.subjectDigest : exactTarget?.targetId ?? null };
  const terminus = lane !== "standard" || dependencies.resolveNativeTerminus === undefined ? undefined
    : await dependencies.resolveNativeTerminus({ subject });
  const judgment = dependencies.resolveExtraPassJudgment === undefined ? input.judgment
    : await dependencies.resolveExtraPassJudgment({ repositoryId: exactTarget?.repositoryId,
      subject,
      policyTarget, lane, completedPasses, judgment: input.judgment });
  const closed = lane === "frontline" && lineage?.kind === "candidate"
    && dependencies.readSingletonFrontlinePhaseClosed !== undefined
    && await dependencies.readSingletonFrontlinePhaseClosed(lineage.candidateId, candidate.supersessionAncestors ?? [], policyTarget.headSha);
  return { completedPasses, currentLineage, judgment, terminus,
    ...(closed && dependencies.stateOffBranch === true
      ? { invocation: judgment?.invocation, frontlinePhaseClosed: true as const }
      : { invocation: closed ? { mode: "skip" as const } : judgment?.invocation }),
    extraPassAuthority: dependencies.resolveExtraPassJudgment === undefined ? {} : bindLaneExtraPassJudgment(judgment, policyTarget, lane) };
}

/** Preserve in-repository token-carried grants while native composition uses its resolved decisions. */
export function applyPrePublicationExtraPassJudgment<Request extends ReviewPolicyBoundRequest>(request: Request, input: {
  native: boolean; lane: ReviewLane; policyTarget: ReviewPolicyTarget; judgment?: ReviewLaneJudgment; frontlineCeilingHeadSha?: string;
}): Request {
  requireNativeReviewDecisionReferences(input.native, input.judgment);
  if (input.native) return request;
  const { judgment, lane, policyTarget } = input;
  const ceiling = judgment?.ceilingOverride;
  const boundElsewhere = lane === "frontline" && input.frontlineCeilingHeadSha !== undefined
    && input.frontlineCeilingHeadSha !== policyTarget.headSha;
  const additional = lane === "standard" ? judgment?.additionalPassAuthorization : undefined;
  const applied = { ...request,
    ...(ceiling === undefined || boundElsewhere ? {} : { ceilingOverride: { ...ceiling, target: policyTarget, lane } }),
    ...(additional === undefined || request.completedPasses > additional.completedPasses ? {} : {
      additionalPassAuthorization: { precedingProducerId: additional.precedingProducerId, completedPasses: additional.completedPasses,
        nextPass: additional.nextPass, target: { ...policyTarget, headSha: additional.headSha }, lane: "standard" as const },
    }) };
  const terminal = request.attempts.at(-1);
  return terminal?.outcome === "clean" || terminal?.outcome === "findings"
    ? applied : omitSpentReviewCeilingOverride(applied);
}

function bindLaneExtraPassJudgment(judgment: ReviewLaneJudgment | undefined, target: ReviewPolicyTarget, lane: ReviewLane):
  Pick<ReviewPolicyCommandRequest, "ceilingOverride" | "additionalPassAuthorization"> {
  const ceiling = judgment?.ceilingOverride, additional = judgment?.additionalPassAuthorization;
  return { ...(ceiling === undefined ? {} : { ceilingOverride: { ...ceiling, target, lane } }),
    ...(additional === undefined ? {} : { additionalPassAuthorization: { target: { ...target, headSha: additional.headSha },
      lane: "standard" as const, precedingProducerId: additional.precedingProducerId,
      completedPasses: additional.completedPasses, nextPass: additional.nextPass,
      ...(additional.decisionKey === undefined ? {} : { decisionKey: additional.decisionKey }) } }) };
}
