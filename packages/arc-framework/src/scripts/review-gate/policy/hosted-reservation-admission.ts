/** Ordered admission for a hosted-review reservation carried across publication. */

import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

interface ReservationAttempt {
  sourceId: string;
  outcome: string;
}

/** The first reserved source whose current-head attempts are not all safely unavailable. */
export function firstAdmissibleHostedSource(
  reservation: StandardReviewReservationV1,
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

/** Refuse a hosted provider that would skip an earlier source in the durable reservation. */
export function assertHostedReservationAdmission(input: {
  reservation: StandardReviewReservationV1;
  provider: string;
  repository: string;
  headSha: string;
  attempts: readonly ReservationAttempt[];
}): void {
  if (input.reservation.target.repository.toLowerCase() !== input.repository.toLowerCase()
    || input.reservation.target.headSha !== input.headSha) {
    throw new Error("Hosted review target does not match the carried standard-review reservation.");
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
