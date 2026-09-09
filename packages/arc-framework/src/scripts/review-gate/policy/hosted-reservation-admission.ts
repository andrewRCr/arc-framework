/** Ordered admission for a hosted-review reservation carried across publication. */

import {
  sameDeliveryReviewMemberIdentity,
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import type { ReviewOperationStateSnapshot } from "../core/ports.js";
import {
  assertStandardReviewExecutionAdmission,
  resolveReviewPolicy,
  type ReviewPolicyCommandRequest,
  type ReviewResolveEnvelope,
} from "./review-policy-driver.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";
import type { ReviewApplicabilityConsumerAction } from "./review-applicability-authority.js";
import type { HostedReservationDischarge } from "./hosted-reservation-discharge.js";

interface ReservationAttempt {
  sourceId: string;
  outcome: string;
}

interface HostedTargetAttempt extends ReservationAttempt {
  hosted?: {
    target: { repository: string; pullRequest: number; headSha: string };
    vehicle?: DeliveryReviewMemberVehicle;
  };
}

/** Factual standard-lane attempt retained for one stable delivery-member identity. */
export interface HostedReservationPolicyAttemptProgress {
  readonly updatedAt: string;
  readonly headSha: string;
  readonly sourceId: string;
  readonly outcome: string;
  readonly requestedCoverage: "complete" | "incremental";
  readonly effectiveCoverage: "complete" | "incremental" | null;
  readonly findingCount: number;
  readonly settledFindingCount: number;
}

/** Exact delivery-member progress projected for one standard-review driver invocation. */
export type HostedReservationPolicyProgress =
  | {
    readonly status: "complete";
    readonly completedPasses: number;
    readonly completePasses: number;
    readonly attempts: ReviewPolicyCommandRequest["attempts"];
    readonly attemptHistory: readonly HostedReservationPolicyAttemptProgress[];
  }
  | { readonly status: "unavailable"; readonly detail: string };

/** Driver resolution or the typed snapshot failure that prevented one. */
export type HostedReservationPolicyResolution =
  | { readonly status: "resolved"; readonly policy: ReviewResolveEnvelope }
  | { readonly status: "unavailable"; readonly detail: string };

/** Project driver-grade progress for one delivery member across exact head movement. */
export function projectHostedReservationPolicyProgress(input: {
  readonly snapshot: ReviewOperationStateSnapshot;
  readonly repositoryId: string;
  readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly vehicle: DeliveryReviewMemberVehicle;
}): HostedReservationPolicyProgress {
  if (input.snapshot.status !== "complete") {
    return {
      status: "unavailable",
      detail: `Review operation progress is ${input.snapshot.status}: ${input.snapshot.reason}`,
    };
  }
  if (input.vehicle.head !== input.target.headSha) {
    return { status: "unavailable", detail: "The delivery-member vehicle does not identify the current target head." };
  }
  const completedLogicalPasses = new Set<number>();
  const completeLogicalPasses = new Set<number>();
  const historyTimeline: Array<{
    readonly progress: HostedReservationPolicyAttemptProgress;
    readonly operationId: string;
    readonly attemptIndex: number;
  }> = [];
  const currentTimeline: Array<{
    readonly updatedAt: string;
    readonly operationId: string;
    readonly attemptIndex: number;
    readonly attempt: ReviewPolicyCommandRequest["attempts"][number];
  }> = [];
  for (const { state } of input.snapshot.records) {
    if (state.kind !== "lane-progress"
      || state.lane !== "standard"
      || state.repositoryId !== input.repositoryId) continue;
    for (const [attemptIndex, attempt] of state.attempts.entries()) {
      const hosted = attempt.hosted;
      const local = attempt.local;
      const hostedIdentityMatches = attempt.changeRequestId === `pull/${String(input.target.pullRequest)}`
        && hosted !== undefined
        && hosted.vehicle !== undefined
        && hosted.target.repository.toLowerCase() === input.target.repository.toLowerCase()
        && hosted.target.pullRequest === input.target.pullRequest
        && hosted.target.headSha === attempt.headSha
        && hosted.reviewTarget.repositoryId === input.repositoryId
        && hosted.reviewTarget.headSha === attempt.headSha
        && sameDeliveryReviewMemberIdentity(input.vehicle, hosted.vehicle);
      const hostedCompleteMatches = hostedIdentityMatches
        && (hosted.requestedCoverage === "complete" || hosted.effectiveCoverage === "complete");
      const localMatches = attempt.changeRequestId === null
        && local?.deliveryAdmission !== undefined
        && local.vehicle.kind === "delivery-member"
        && sameDeliveryReviewMemberIdentity(input.vehicle, local.deliveryAdmission.vehicle)
        && local.deliveryAdmission.target.repository.toLowerCase() === input.target.repository.toLowerCase()
        && local.deliveryAdmission.target.pullRequest === input.target.pullRequest
        && local.target.kind === "delivery-member"
        && local.target.repositoryId === input.repositoryId
        && local.target.headSha === attempt.headSha;
      if (!hostedIdentityMatches && !localMatches) continue;
      const coverageBinding = localMatches ? local : hosted;
      if (coverageBinding === undefined) continue;
      historyTimeline.push({
        operationId: state.operationId,
        attemptIndex,
        progress: {
          updatedAt: state.updatedAt,
          headSha: attempt.headSha,
          sourceId: attempt.sourceId,
          outcome: attempt.outcome,
          requestedCoverage: coverageBinding.requestedCoverage,
          effectiveCoverage: coverageBinding.effectiveCoverage,
          findingCount: hosted?.sealedResult?.findings.length ?? 0,
          settledFindingCount: hosted?.settledFindingIds.length ?? 0,
        },
      });
      if (attempt.terminalProducer
        && (attempt.outcome === "clean"
        || attempt.outcome === "findings"
        || attempt.outcome === "settled-findings")) {
        completedLogicalPasses.add(attempt.logicalPass);
        if (local?.effectiveCoverage === "complete" || hosted?.effectiveCoverage === "complete") {
          completeLogicalPasses.add(attempt.logicalPass);
        }
      }
      if (attempt.headSha === input.target.headSha
        && attempt.outcome !== "pending"
        && ((localMatches && local.effectiveCoverage === "complete") || (hostedCompleteMatches
          && sameDeliveryReviewMemberVehicle(input.vehicle, hosted.vehicle)))) {
        currentTimeline.push({
          updatedAt: state.updatedAt,
          operationId: state.operationId,
          attemptIndex,
          attempt: {
            sourceId: attempt.sourceId,
            outcome: attempt.outcome,
            ...(attempt.chunkSeriesComplete === undefined
              ? {}
              : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
          },
        });
      }
    }
  }
  const compareTimeline = (
    left: { readonly updatedAt: string; readonly operationId: string; readonly attemptIndex: number },
    right: { readonly updatedAt: string; readonly operationId: string; readonly attemptIndex: number },
  ) => left.updatedAt.localeCompare(right.updatedAt)
    || left.operationId.localeCompare(right.operationId)
    || left.attemptIndex - right.attemptIndex;
  historyTimeline.sort((left, right) => compareTimeline(
    { updatedAt: left.progress.updatedAt, operationId: left.operationId, attemptIndex: left.attemptIndex },
    { updatedAt: right.progress.updatedAt, operationId: right.operationId, attemptIndex: right.attemptIndex },
  ));
  currentTimeline.sort(compareTimeline);
  let latestSettledIndex = -1;
  for (const [index, entry] of currentTimeline.entries()) {
    if (entry.attempt.outcome === "settled-findings") latestSettledIndex = index;
  }
  const attempts = currentTimeline.slice(latestSettledIndex + 1).map(({ attempt }) => attempt);
  const attemptHistory = historyTimeline.map(({ progress }) => progress);
  return {
    status: "complete",
    completedPasses: completedLogicalPasses.size,
    completePasses: completeLogicalPasses.size,
    attempts,
    attemptHistory,
  };
}

/** Resolve one delivery member's next request through the configured standard-review driver. */
export function resolveHostedReservationPolicy(input: {
  readonly reservation: StandardReviewReservationV1;
  readonly snapshot: ReviewOperationStateSnapshot;
  readonly repositoryId: string;
  readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly vehicle: DeliveryReviewMemberVehicle;
  readonly maxPasses: number;
  readonly requestAttempts?: ReviewPolicyCommandRequest["attempts"];
  readonly invocation?: ReviewPolicyCommandRequest["invocation"];
  readonly ceilingOverride?: ReviewPolicyCommandRequest["ceilingOverride"];
  readonly scopeSelection?: ReviewPolicyCommandRequest["scopeSelection"];
}): HostedReservationPolicyResolution {
  const progress = projectHostedReservationPolicyProgress(input);
  if (progress.status === "unavailable") return progress;
  const attemptsBySource = new Map<string, ReviewPolicyCommandRequest["attempts"][number]>();
  for (const attempt of [...(input.requestAttempts ?? []), ...progress.attempts]) {
    attemptsBySource.set(attempt.sourceId, attempt);
  }
  const attempts = input.reservation.sources.flatMap((sourceId) => {
    const attempt = attemptsBySource.get(sourceId);
    return attempt === undefined ? [] : [attempt];
  });
  if (attempts.length !== attemptsBySource.size) {
    return { status: "unavailable", detail: "Review request progress names a source outside the reservation." };
  }
  return {
    status: "resolved",
    policy: resolveReviewPolicy({
      schemaVersion: 1,
      target: input.target,
      lane: "standard",
      standardReview: input.reservation.obligation,
      sources: input.reservation.sources,
      maxPasses: input.maxPasses,
      completedPasses: progress.completedPasses,
      attempts,
      ...(input.invocation === undefined ? {} : { invocation: input.invocation }),
      ...(input.ceilingOverride === undefined ? {} : { ceilingOverride: input.ceilingOverride }),
      ...(input.scopeSelection === undefined ? {} : { scopeSelection: input.scopeSelection }),
    }),
  };
}

/** Refuse a hosted request that no longer has exact driver admission at capacity-spend time. */
export function assertHostedReservationPolicyAdmission(input: {
  readonly reservation: StandardReviewReservationV1;
  readonly snapshot: ReviewOperationStateSnapshot;
  readonly repositoryId: string;
  readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly vehicle: DeliveryReviewMemberVehicle;
  readonly provider: string;
  readonly maxPasses: number;
  readonly requestAttempts?: ReviewPolicyCommandRequest["attempts"];
  readonly invocation?: ReviewPolicyCommandRequest["invocation"];
  readonly ceilingOverride?: ReviewPolicyCommandRequest["ceilingOverride"];
}): void {
  const resolution = resolveHostedReservationPolicy(input);
  if (resolution.status === "unavailable") throw new Error(resolution.detail);
  if (resolution.policy.state !== "ready"
    || resolution.policy.nextAction !== "hosted-request") {
    throw new Error(
      `Hosted review capacity lacks standard-review driver admission (${resolution.policy.state}/${resolution.policy.nextAction}).`,
    );
  }
  if (resolution.policy.payload.sourceId !== input.provider) {
    throw new Error(
      `Hosted review source \`${input.provider}\` is not driver-admissible; `
      + `the standard lane requires \`${resolution.policy.payload.sourceId}\` next.`,
    );
  }
}

/** Refuse a Candidate request that no longer has fresh discharge and driver admission. */
export function assertCandidateHostedReservationPolicyAdmission(input: {
  readonly reservation: StandardReviewReservationV1;
  readonly discharge: HostedReservationDischarge;
  readonly progress: {
    readonly completedPasses: number;
    readonly attempts: ReadonlyArray<{
      readonly headSha: string;
      readonly sourceId: string;
      readonly outcome: "pending" | ReviewPolicyCommandRequest["attempts"][number]["outcome"];
      readonly chunkSeriesComplete?: boolean;
    }>;
  } | null;
  readonly target: { readonly repository: string; readonly pullRequest: number; readonly headSha: string };
  readonly provider: string;
  readonly coverage: "complete" | "incremental";
  readonly maxPasses: number;
  readonly logicalPass: number;
  readonly invocation?: ReviewPolicyCommandRequest["invocation"];
  readonly ceilingOverride?: ReviewPolicyCommandRequest["ceilingOverride"];
}): void {
  if (input.discharge.discharged || input.discharge.nextSource === null
    || (input.invocation === undefined && input.discharge.nextSource !== input.provider)) {
    throw new Error("Hosted Candidate request no longer matches the fresh discharge position.");
  }
  if (input.discharge.requestCoverage !== undefined
    && input.discharge.requestCoverage !== input.coverage) {
    throw new Error("Hosted Candidate request coverage no longer matches the fresh discharge position.");
  }
  const currentHeadAttempts = input.progress?.attempts.filter((attempt) => (
    attempt.headSha === input.target.headSha
  )) ?? [];
  if (currentHeadAttempts.some(({ outcome }) => outcome === "pending")) {
    throw new Error("Hosted review capacity is already held by a pending request.");
  }
  const completedCurrentHeadAttempts = currentHeadAttempts.filter((attempt): attempt is typeof attempt & {
    outcome: ReviewPolicyCommandRequest["attempts"][number]["outcome"];
  } => attempt.outcome !== "pending");
  let lastSettledIndex = -1;
  completedCurrentHeadAttempts.forEach((attempt, index) => {
    if (attempt.outcome === "settled-findings") lastSettledIndex = index;
  });
  const attemptsBySource = new Map<string, ReviewPolicyCommandRequest["attempts"][number]>();
  for (const attempt of [
    ...input.discharge.requestAttempts ?? [],
    ...completedCurrentHeadAttempts.slice(lastSettledIndex + 1),
  ]) {
    attemptsBySource.set(attempt.sourceId, {
      sourceId: attempt.sourceId,
      outcome: attempt.outcome,
      ...(!("chunkSeriesComplete" in attempt) || attempt.chunkSeriesComplete === undefined
        ? {}
        : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
    });
  }
  const attempts = input.reservation.sources.flatMap((sourceId) => {
    const attempt = attemptsBySource.get(sourceId);
    return attempt === undefined ? [] : [attempt];
  });
  if (attempts.length !== attemptsBySource.size) {
    throw new Error("Hosted Candidate request progress names a source outside the reservation.");
  }
  const admission = assertStandardReviewExecutionAdmission({
    target: input.target,
    frontlineActive: false,
    standardReview: input.reservation.obligation,
    completedPasses: input.progress?.completedPasses ?? 0,
    attempts,
    sources: input.reservation.sources,
    maxPasses: input.maxPasses,
    expectedSourceId: input.provider,
    expectedNextAction: "hosted-request",
    ...(input.invocation === undefined
      ? {}
      : { judgment: { invocation: input.invocation } }),
    ...(input.ceilingOverride === undefined
      ? {}
      : { ceilingOverride: input.ceilingOverride }),
  });
  if (admission.payload.pass !== input.logicalPass) {
    throw new Error("Hosted review capacity changed before durable admission.");
  }
}

/**
 * Select only source progress recorded for one exact hosted target and optional delivery member.
 *
 * @param input - Lane attempts plus the exact host coordinates and optional member selector.
 * @returns Source outcomes admissible as ordering evidence for that exact target.
 */
export function hostedReservationAttemptsForTarget(input: {
  attempts: readonly HostedTargetAttempt[];
  target: { repository: string; pullRequest: number; headSha: string };
  vehicle?: DeliveryReviewMemberVehicle;
}): ReservationAttempt[] {
  return input.attempts.filter((attempt) => (
    attempt.hosted !== undefined
    && attempt.hosted.target.repository.toLowerCase() === input.target.repository.toLowerCase()
    && attempt.hosted.target.pullRequest === input.target.pullRequest
    && attempt.hosted.target.headSha === input.target.headSha
    && sameDeliveryReviewMemberVehicle(input.vehicle, attempt.hosted.vehicle)
  )).map(({ sourceId, outcome }) => ({ sourceId, outcome }));
}

/**
 * Return the selected source and its ordered fallbacks from current configuration.
 *
 * @param configuredSources - Current ordered standard-review source configuration.
 * @param selectedSource - Explicit source selected for this review run.
 * @returns The exact configured suffix beginning at the selected source.
 */
export function configuredSourceSuffix(
  configuredSources: readonly string[],
  selectedSource: string,
): readonly string[] {
  const selectedSourceIndex = configuredSources.indexOf(selectedSource);
  if (selectedSourceIndex < 0) {
    throw new Error(`Hosted review source \`${selectedSource}\` is not a configured standard-review source.`);
  }
  return configuredSources.slice(selectedSourceIndex);
}

/**
 * Refuse carrier fields that can be checked against existing standard-review authority.
 *
 * @param input - Carried binding plus the independently resolved source order and rubric identity.
 * @returns Nothing; throws when either authoritative comparison fails.
 */
export function assertHostedErrandBindingAuthority(input: {
  binding: {
    sources: readonly string[];
    standardReview: { rubricVersion: string; rubricDigest: string };
  };
  configuredSources: readonly string[];
  rubricIdentity: { version: string; digest: string };
}): void {
  const firstBoundSource = input.binding.sources[0];
  const configuredSuffix = firstBoundSource === undefined
    ? []
    : configuredSourceSuffix(input.configuredSources, firstBoundSource);
  if (input.binding.sources.length === 0
    || input.binding.sources.length !== configuredSuffix.length
    || input.binding.sources.some((source, index) => source !== configuredSuffix[index])) {
    throw new Error("Hosted Errand source binding is not an exact configured suffix.");
  }
  if (input.binding.standardReview.rubricVersion !== input.rubricIdentity.version
    || input.binding.standardReview.rubricDigest !== input.rubricIdentity.digest) {
    throw new Error("Hosted Errand rubric binding does not match the current standard-review rubric.");
  }
}

/** The first reserved source whose current-head attempts are not all safely unavailable. */
export function firstAdmissibleHostedSource(
  reservation: { readonly sources: readonly string[] },
  attempts: readonly ReservationAttempt[],
): string | null {
  for (const sourceId of reservation.sources) {
    const sourceAttempts = attempts.filter((attempt) => attempt.sourceId === sourceId);
    const safelyUnavailable = sourceAttempts.length > 0 && sourceAttempts.every(({ outcome }) => (
      outcome === "rate-limited" || outcome === "transient-unavailable"
    ));
    if (!safelyUnavailable) return sourceId;
  }
  return null;
}

/** Refuse hosted progress that is not bound to the exact active Errand and ordered source. */
export function assertHostedErrandAdmission(input: {
  binding: { key: string; claimId: string; branch: string; sources: readonly string[] };
  current: { key: string; claimId: string; branch: string };
  provider: string;
  attempts: readonly ReservationAttempt[];
}): void {
  if (input.binding.key !== input.current.key
    || input.binding.claimId !== input.current.claimId
    || input.binding.branch !== input.current.branch) {
    throw new Error("Hosted review progress does not match the current Errand.");
  }
  const expected = firstAdmissibleHostedSource(input.binding, input.attempts);
  if (expected === null) {
    throw new Error("Every source in the Errand's standard-review binding is safely unavailable.");
  }
  if (input.provider !== expected) {
    throw new Error(
      `Hosted review source \`${input.provider}\` is not admissible; the Errand binding requires \`${expected}\` next.`,
    );
  }
}

/** Refuse a hosted target that does not belong to the carried reservation and current Candidate. */
export function assertHostedReservationBindingAuthority(input: {
  reservation: StandardReviewReservationV1;
  repository: string;
  headSha: string;
  targetKind: "change-set" | "delivery-member";
  vehicle?: DeliveryReviewMemberVehicle;
  boundary: { candidateId: string; candidateSubjectDigest: string | null };
  candidate: { candidateId: string; subjectDigest: string; headSha: string };
}): void {
  if (input.reservation.target.repository.toLowerCase() !== input.repository.toLowerCase()) {
    throw new Error("Hosted review target does not match the carried standard-review reservation.");
  }
  if (input.targetKind === "delivery-member") {
    const marker = input.reservation.target;
    if (marker.kind !== "delivery"
      || input.vehicle === undefined
      || input.vehicle.planId !== marker.planId
      || input.vehicle.workUnitId !== marker.workUnitId
      || input.vehicle.head !== input.headSha) {
      throw new Error("Hosted delivery-member target does not match the carried reservation vehicle.");
    }
  } else if (input.reservation.target.kind !== "pinned-head") {
    throw new Error("Hosted change-set target does not match the carried reservation vehicle.");
  }
  // The caller supplies only a Candidate already proven current. Candidate review binds its current
  // host head directly; a delivery member instead arrives through the exact-head reverse lookup, while
  // this gate retains the originating Candidate's lineage authority without equating the two heads.
  if (input.boundary.candidateSubjectDigest === null
    || input.boundary.candidateId !== input.candidate.candidateId
    || (input.targetKind === "change-set" && input.candidate.headSha !== input.headSha)) {
    throw new Error("Hosted review reservation does not match the current Candidate.");
  }
}

/** Refuse a hosted provider that would skip an earlier source in the durable reservation. */
export function assertHostedReservationAdmission(input: {
  reservation: StandardReviewReservationV1;
  provider: string;
  repository: string;
  headSha: string;
  targetKind: "change-set" | "delivery-member";
  vehicle?: DeliveryReviewMemberVehicle;
  boundary: { candidateId: string; candidateSubjectDigest: string | null };
  candidate: { candidateId: string; subjectDigest: string; headSha: string };
  attempts: readonly ReservationAttempt[];
  applicabilityAction?: ReviewApplicabilityConsumerAction;
}): void {
  if (input.applicabilityAction === "retain-prior-attempt") {
    throw new Error("Hosted review capacity is not admissible while the prior attempt remains applicable.");
  }
  if (input.applicabilityAction === "stop") {
    throw new Error("Hosted review capacity is not admissible while contribution applicability is unresolved.");
  }
  assertHostedReservationBindingAuthority(input);
  const expected = firstAdmissibleHostedSource(input.reservation, input.attempts);
  if (expected === null) {
    throw new Error("Every source in the carried standard-review reservation is safely unavailable.");
  }
  if (input.provider !== expected) {
    throw new Error(
      `Hosted review source \`${input.provider}\` is not admissible; the reservation requires \`${expected}\` next.`,
    );
  }
}
