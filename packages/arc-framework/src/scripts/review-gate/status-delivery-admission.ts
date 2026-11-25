/** Compose exact first-member admission after status has selected its source and coverage. */
import type { GitExec, RawGitExec } from "../../lib/git/exec.js";
import type { CandidateManagedRecordV1 } from "../../lib/work-unit/candidate-attestation.js";
import type { readConfigSettings } from "../../lib/config/status-reader.js";
import type { ReviewOperationStateSnapshot, ReviewOperationStateStore, ReviewResultReader } from "./core/ports.js";
import { readLaneResponsePerformance } from "./lane-progress.js";
import { deriveHostedReviewTarget } from "./policy/hosted-review-target.js";
import { resolveEvidenceBoundHostedReservationPolicy } from "./policy/hosted-reservation-admission.js";
import type { HostedReservationTarget, HostedReservationDischarge, HostedReservationDischargeReader } from "./policy/hosted-reservation-support.js";
import type { StandardReviewReservationV1 } from "./policy/integration-boundary-locus.js";
import type { ReviewCoverageSelectionChoice } from "./policy/review-coverage-selection.js";
import type { ReviewResolveEnvelope } from "./policy/review-policy-driver.js";
import { resolveDeliveryMemberScopeSelection } from "./status-delivery-scope.js";
import type { ReviewStatusPolicyJudgment } from "./status-judgment.js";
import type { composeDeliveryReviewObligation, RoutedReviewObligation } from "./status.js";

export type DeliveryStatusTarget = HostedReservationTarget & Required<Pick<HostedReservationTarget,
  "vehicle" | "position" | "memberCount" | "chunkKey" | "title">>;
export type DeliveryStatusDischarge = Parameters<typeof composeDeliveryReviewObligation>[0]["discharges"][number];

interface DeliveryStatusAdmissionInput {
  cwd: string; exec: GitExec; rawExec: RawGitExec;
  settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"];
  repositoryId: string; reservation: StandardReviewReservationV1; record: CandidateManagedRecordV1;
  snapshot: ReviewOperationStateSnapshot; maxPasses: number;
  firstTarget: DeliveryStatusTarget; firstOutstanding: DeliveryStatusDischarge;
  rawFirstOutstanding: HostedReservationDischarge | undefined;
  selectedCoverage: ReviewCoverageSelectionChoice | null;
  judgment: ReviewStatusPolicyJudgment | undefined;
  resultReader: ReviewResultReader;
  dispositionStore: Parameters<typeof resolveEvidenceBoundHostedReservationPolicy>[1]["dispositionStore"];
  store: ReviewOperationStateStore; readDischarge: HostedReservationDischargeReader;
}

/** Retain target, evidence and coverage checks while returning only the selected member's new projection. */
export async function resolveDeliveryStatusAdmission(input: DeliveryStatusAdmissionInput): Promise<
  { status: "blocked"; obligation: RoutedReviewObligation } | { status: "resolved"; discharge: DeliveryStatusDischarge }> {
  const { cwd, exec, rawExec, settings, repositoryId, reservation, record, snapshot, maxPasses,
    firstTarget, firstOutstanding, rawFirstOutstanding, selectedCoverage, judgment,
    resultReader, dispositionStore, store, readDischarge } = input;
  if (reservation.target.kind !== "delivery") throw new Error("Delivery status admission requires its delivery reservation.");
  const coverage = firstOutstanding.requestCoverage ?? judgment?.coverage ?? "complete";
  const scopeSelection = coverage === "incremental" && firstOutstanding.correctionScope === undefined ? undefined
    : await resolveDeliveryMemberScopeSelection({ rawExec, settings, planId: reservation.target.planId,
      target: firstTarget, coverage,
      ...(firstOutstanding.correctionScope === undefined ? {} : { correctionScope: firstOutstanding.correctionScope }),
      ...(judgment?.sourceId === undefined ? {} : { sourceId: judgment.sourceId }) });
  const dischargeArgs = { reservation, baseRevision: firstTarget.baseRevision, approvedHead: firstTarget.headSha,
    changeRequest: { repository: firstTarget.repository, pullRequest: firstTarget.pullRequest },
    vehicle: firstTarget.vehicle, candidate: record };
  const admission = await resolveEvidenceBoundHostedReservationPolicy({ reservation, snapshot, repositoryId,
    currentReviewTarget: await deriveHostedReviewTarget({ cwd, exec, currentRepositoryId: repositoryId,
      approvedHeadSha: firstTarget.headSha, baseRevision: firstTarget.baseRevision, vehicle: firstTarget.vehicle }),
    target: { repository: firstTarget.repository, pullRequest: firstTarget.pullRequest, headSha: firstTarget.headSha },
    vehicle: firstTarget.vehicle, maxPasses, chosenCoverage: selectedCoverage?.coverage ?? judgment?.coverage,
    ...(rawFirstOutstanding?.requestAttempts === undefined ? {} : { requestAttempts: rawFirstOutstanding.requestAttempts }),
    ...(judgment?.ceilingOverride === undefined ? {} : { ceilingOverride: judgment.ceilingOverride }),
    ...(judgment?.additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization: judgment.additionalPassAuthorization }),
    ...(judgment?.sourceId === undefined ? {} : { invocation: { mode: "force" as const, sourceId: judgment.sourceId } }),
    ...(selectedCoverage === null ? {} : { coverageSelection: selectedCoverage }),
    ...(scopeSelection === undefined ? {} : { scopeSelection }) }, {
    resultReader, dispositionStore, readResponsePerformance: predecessor => readLaneResponsePerformance(store, predecessor),
    confirmTarget: attemptedTarget => Promise.resolve(attemptedTarget),
    confirmIncrementalApplicability: (predecessor, current) => readDischarge.confirmIncrementalApplicability(dischargeArgs, predecessor, current),
    confirmCurrentApplicability: predecessor => readDischarge.confirmCurrentIncrementalApplicability(dischargeArgs, predecessor),
  });
  if (admission.status === "unavailable") return { status: "blocked", obligation: { state: "blocked", detail: admission.detail } };
  return { status: "resolved", discharge: projectDeliveryAdmission(firstOutstanding, admission.policy, judgment, scopeSelection) };
}

function projectDeliveryAdmission(discharge: DeliveryStatusDischarge, policy: ReviewResolveEnvelope,
  judgment: ReviewStatusPolicyJudgment | undefined, scopeSelection: Awaited<ReturnType<typeof resolveDeliveryMemberScopeSelection>>): DeliveryStatusDischarge {
  return { ...discharge,
    ...(policy.state === "unavailable" ? { coverageSelectionAction: undefined } : {}),
    ...(policy.state === "ready" ? { nextSource: policy.payload.sourceId } : {}), requestAdmission: policy,
    ...(judgment?.ceilingOverride === undefined ? {} : { requestCeilingOverride: judgment.ceilingOverride }),
    ...(judgment?.additionalPassAuthorization === undefined ? {} : { requestAdditionalPassAuthorization: judgment.additionalPassAuthorization }),
    ...(scopeSelection === undefined ? {} : { requestScopeSelection: scopeSelection }) };
}
