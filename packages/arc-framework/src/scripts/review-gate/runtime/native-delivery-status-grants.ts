/** Bind delivery status grants before recomputing the first outstanding member. */
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import { deriveHostedReviewTarget } from "../policy/hosted-review-target.js";
import type { HostedReservationDischarge, HostedReservationDischargeReader } from "../policy/hosted-reservation-support.js";
import type { StandardReviewReservationV1 } from "../policy/integration-boundary-locus.js";
import type { DeliveryStatusTarget, DeliveryStatusDischarge } from "../status-delivery-admission.js";
import type { ReviewStatusPolicyJudgment } from "../status-judgment.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { resolveNativeStatusPassJudgment } from "./native-status-pass-judgments.js";

/** Preserve existing member order, using the queried retained target when no member remains outstanding. */
export async function composeNativeDeliveryStatusGrants(input: ReviewInvocationInput & {
  operationStore: ReviewOperationStateStore; repositoryId: string;
  targets: readonly DeliveryStatusTarget[]; discharges: HostedReservationDischarge[];
  composedDischarges: readonly DeliveryStatusDischarge[]; firstOutstandingIndex: number;
  queriedTarget: { repository: string; pullRequest: number; headSha: string };
  reservation: StandardReviewReservationV1; record: CandidateManagedRecordV1;
  judgment: ReviewStatusPolicyJudgment | undefined; readDischarge: HostedReservationDischargeReader;
}): Promise<{ judgment: ReviewStatusPolicyJudgment | undefined; composedDischarges: readonly DeliveryStatusDischarge[] }> {
  const retained = { judgment: input.judgment, composedDischarges: input.composedDischarges };
  if (input.operationStore.stateOffBranch !== true) return retained;
  const index = input.firstOutstandingIndex >= 0 ? input.firstOutstandingIndex : input.targets.findIndex(target =>
    target.repository === input.queriedTarget.repository && target.pullRequest === input.queriedTarget.pullRequest
    && target.headSha === input.queriedTarget.headSha);
  const selected = input.targets[index], progress = input.composedDischarges[index];
  const judgment = await resolveNativeStatusPassJudgment(input, input.operationStore, input.judgment, async () => {
    if (selected === undefined || progress === undefined) throw new Error("Resolve an exact retained delivery target and retry its judgment.");
    const reviewTarget = await deriveHostedReviewTarget({ ...input, currentRepositoryId: input.repositoryId,
      approvedHeadSha: selected.headSha, baseRevision: selected.baseRevision, vehicle: selected.vehicle });
    return { repositoryId: input.repositoryId, reviewTarget, decisionSubjectDigest: reviewTarget.targetId,
      candidateRecord: input.record, lineage: { kind: "delivery-member", planId: selected.vehicle.planId,
        workUnitId: selected.vehicle.workUnitId, deliverableId: selected.vehicle.deliverableId },
      policyTarget: { repository: selected.repository, pullRequest: selected.pullRequest, headSha: selected.headSha },
      requestedCoverage: progress.requestCoverage };
  });
  if (judgment === input.judgment || selected === undefined || progress === undefined) return retained;
  const discharge = await input.readDischarge({ reservation: input.reservation, baseRevision: selected.baseRevision,
    approvedHead: selected.headSha, changeRequest: { repository: selected.repository, pullRequest: selected.pullRequest },
    vehicle: selected.vehicle, candidate: input.record });
  input.discharges[index] = discharge;
  return { judgment, composedDischarges: input.composedDischarges.map((prior, position) => position !== index ? prior
    : { ...discharge, completedPasses: progress.completedPasses, completePasses: progress.completePasses,
      passCeiling: progress.passCeiling, attemptHistory: progress.attemptHistory }) };
}
