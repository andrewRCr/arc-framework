/** Ordered admission for a hosted-review reservation carried across publication. */

import {
  sameDeliveryReviewMemberVehicle,
  type DeliveryReviewMemberVehicle,
} from "../../../lib/delivery/review-vehicle.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

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
