/** Bind a published Candidate or unreserved member judgment to the subject status already established. */
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import { CanonicalDigestSchema } from "../../../lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import type { DeliveryMemberBinding } from "../core/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { deriveHostedReviewTarget } from "../policy/hosted-review-target.js";
import type { ReviewStatusPolicyJudgment } from "../status-judgment.js";
import { createReviewCompositionContext } from "./composition-context.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveNativeStatusPassJudgment } from "./native-status-pass-judgments.js";

/** Keep target observation lazy for repository calls and native calls with no ordinary authority. */
export async function composeNativePublishedStatusGrants(input: ReviewInvocationInput & {
  record: CandidateManagedRecordV1; candidateSubjectDigest?: string; baseRevision?: string;
  member?: DeliveryMemberBinding | null; target: { repository: string; pullRequest: number; headSha: string };
  judgment?: ReviewStatusPolicyJudgment;
  requestedCoverage?: "complete" | "incremental";
}): Promise<ReviewStatusPolicyJudgment | undefined> {
  const { publisher, family } = createReviewCompositionContext(input);
  return resolveNativeStatusPassJudgment(input, family.ports.inFlight, input.judgment, async () => {
    const repositoryId = await resolveRepositoryIdentity(publisher, undefined, input);
    const member = input.member;
    const baseRevision = member?.base ?? input.baseRevision;
    if (baseRevision === undefined) throw new Error("Resolve the published review target's exact diff base and retry its judgment.");
    const vehicle = member == null ? undefined : DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", planId: member.planId,
      deliverableId: member.deliverableId, workUnitId: member.workUnitId, head: member.head });
    const reviewTarget = await deriveHostedReviewTarget({ ...input, currentRepositoryId: repositoryId,
      approvedHeadSha: input.target.headSha, baseRevision, vehicle });
    const digest = member == null ? input.candidateSubjectDigest : reviewTarget.targetId;
    if (digest === undefined) throw new Error("Resolve the effective Candidate subject and retry its judgment.");
    const decisionSubjectDigest = CanonicalDigestSchema.parse(digest);
    return { repositoryId, reviewTarget, decisionSubjectDigest, candidateRecord: input.record,
      lineage: vehicle === undefined ? { kind: "candidate", candidateId: input.record.attestation.candidateId }
        : { kind: "delivery-member", planId: vehicle.planId, workUnitId: vehicle.workUnitId, deliverableId: vehicle.deliverableId },
      policyTarget: input.target, requestedCoverage: input.requestedCoverage };
  });
}
