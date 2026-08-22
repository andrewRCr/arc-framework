/** Ordered admission for a hosted-review reservation carried across publication. */

import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

interface ReservationAttempt {
  sourceId: string;
  outcome: string;
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
  if (input.binding.sources.length !== input.configuredSources.length
    || input.binding.sources.some((source, index) => source !== input.configuredSources[index])) {
    throw new Error("Hosted Errand source binding does not match the configured standard-review sources.");
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
  boundary: { candidateId: string; candidateSubjectDigest: string | null };
  candidate: { candidateId: string; subjectDigest: string; headSha: string };
  attempts: readonly ReservationAttempt[];
}): void {
  if (input.reservation.target.repository.toLowerCase() !== input.repository.toLowerCase()) {
    throw new Error("Hosted review target does not match the carried standard-review reservation.");
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
