/** Compose hosted logical-pass history and ordinary native authority before fresh capacity admission. */
import { readRepositoryCandidateSupersessionChain } from "../../../lib/store/kinds/review/candidate/history.js";
import type { CandidateManagedRecordV1, CandidateSupersessionAncestor } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { readCandidateInheritedLaneProgress } from "../lane-progress.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveNativeInvocationExtraPassJudgment } from "./native-extra-pass.js";
import { projectNativePolicyGrants } from "./native-policy-grants.js";
import type { ReviewPolicyCommandRequest } from "../policy/review-policy-driver.js";

type StandardGrantRequest = Pick<ReviewPolicyCommandRequest, "target" | "ceilingOverride" | "additionalPassAuthorization">
  & { coverage?: "complete" | "incremental" };

interface HostedPassJudgmentContext extends ReviewInvocationInput {
  operationStore: ReviewOperationStateStore;
  repositoryId: string;
  lineage: LaneSubjectLineage;
  reviewTarget: ReviewTarget;
  candidateRecord: CandidateManagedRecordV1 | null;
  decisionSubjectDigest: ReviewTarget["targetId"];
}

/** Retain Candidate inheritance and bind grants only when fresh hosted capacity is being authorized. */
export async function createHostedPassJudgmentContext(input: HostedPassJudgmentContext) {
  const supersessionAncestors = await readHostedSupersessionAncestors(input);
  const inheritedProgress = await readCandidateInheritedLaneProgress(input.operationStore, {
    lane: "standard", repositoryId: input.repositoryId, headSha: input.reviewTarget.headSha,
    ancestors: supersessionAncestors,
  });
  return { supersessionAncestors, inheritedProgress,
    resolveGrants: <Request extends StandardGrantRequest>(request: Request, progress: LaneProgressState | null) => composeHostedGrants(input,
      request, (progress?.completedPasses ?? 0) + inheritedProgress.inheritedCompletedPasses) };
}

async function readHostedSupersessionAncestors(input: HostedPassJudgmentContext): Promise<readonly CandidateSupersessionAncestor[]> {
  if (input.lineage.kind !== "candidate") return [];
  if (input.candidateRecord === null || input.candidateRecord.attestation.candidateId !== input.lineage.candidateId) {
    throw new Error("Hosted Candidate supersession authority is unavailable");
  }
  return readRepositoryCandidateSupersessionChain({ ...input,
    workUnit: input.candidateRecord.attestation.workUnit, record: input.candidateRecord });
}

async function composeHostedGrants<Request extends StandardGrantRequest>(input: HostedPassJudgmentContext, request: Request,
  completedPasses: number): Promise<Request> {
  if (input.operationStore.stateOffBranch !== true) return request;
  const facts = input.operationStore.nativeFacts;
  if (facts === undefined) throw new Error("Restore the selected native review facts and retry the hosted request.");
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  if (request.ceilingOverride === undefined && request.additionalPassAuthorization === undefined
    && !listing.records.some(({ value }) => value.choice.kind === "extra-pass"
      && value.choice.precondition.kind !== "approved-fix")) return request;
  const resolved = await resolveNativeInvocationExtraPassJudgment(input, facts, { repositoryId: input.repositoryId,
    subject: { lineage: input.lineage, headSha: input.reviewTarget.headSha, subjectDigest: input.decisionSubjectDigest },
    lane: "standard", completedPasses, policyTarget: request.target,
    ceilingOverride: request.ceilingOverride, additionalPassAuthorization: request.additionalPassAuthorization });
  const { lane, ...projected } = projectNativePolicyGrants({ target: request.target, lane: "standard" as const,
    ceilingOverride: request.ceilingOverride, additionalPassAuthorization: request.additionalPassAuthorization }, resolved,
    request.coverage === "incremental");
  void lane;
  return { ...request, ...projected };
}
