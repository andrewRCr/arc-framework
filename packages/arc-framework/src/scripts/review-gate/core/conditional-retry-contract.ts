/** Shared retry contracts over actual lane attempts and portable local request metadata. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { LaneProgressState, LocalReviewState } from "./operation-state-schema.js";
import type { ConditionalPendingAdmission } from "../lane-progress-conditional.js";
import { frontlineRetryContract } from "./frontline-retry-contract.js";

type LaneAttempt = LaneProgressState["attempts"][number];

function localRetryContract(attempt: LaneAttempt): unknown {
  const local = attempt.local;
  if (local === undefined) return null;
  return {
    logicalPass: attempt.logicalPass, sourceId: attempt.sourceId,
    vehicle: local.vehicle, scopeMode: local.scopeMode, requestedCoverage: local.requestedCoverage,
    correctionScope: local.correctionScope ?? null, rubricIdentity: local.rubricIdentity,
    deliveryAdmission: local.deliveryAdmission ?? null,
  };
}

/** Compare the actual request actors, policy binding, and attestation mechanism of a local retry. */
export function localReviewRetryActorContract(state: Pick<LocalReviewState,
  "request" | "policyBindingDigest" | "attestationRuntimeKind" | "attestation">): unknown {
  return {
    authorIdentity: state.request.authorIdentity, evaluatorIdentity: state.request.evaluatorIdentity,
    policyBindingDigest: state.policyBindingDigest, requestMechanism: state.request.requestMechanism,
    attestationRuntimeKind: state.attestationRuntimeKind, attestationMechanism: state.attestation.mechanism,
  };
}

function consumedRetryContract(attempt: LaneAttempt): unknown {
  return attempt.frontline === undefined ? localRetryContract(attempt) : frontlineRetryContract(attempt.frontline.admission);
}

function consumedAttemptRetryable(attempt: LaneAttempt | undefined): boolean {
  if (attempt === undefined || attempt.terminalProducer) return false;
  return attempt.frontline === undefined
    ? attempt.outcome === "stale-target" || attempt.outcome === "terminal-failure"
    : attempt.outcome !== "pending";
}

/** Require a pending retry to retain its original consumed admission's source, scope, coverage, and next generation. */
export function requireConsumedReviewRetryAttempts(
  progress: LaneProgressState, originalAdmissionId: string,
  input: ConditionalPendingAdmission,
  next: LaneProgressState,
): { original: LaneAttempt; replacement: LaneAttempt } {
  const original = progress.attempts.find((attempt) => attempt.attemptId === originalAdmissionId);
  const previous = progress.attempts.filter((attempt) => attempt.logicalPass === input.nextPass).at(-1);
  const replacement = next.attempts.find((attempt) => attempt.attemptId === input.admissionId);
  if (original === undefined || previous === undefined || replacement === undefined
    || !consumedAttemptRetryable(original) || !consumedAttemptRetryable(previous)
    || replacement.outcome !== "pending" || replacement.terminalProducer
    || replacement.retryGeneration !== previous.retryGeneration + 1
    || consumedRetryContract(original) === null
    || canonicalize(consumedRetryContract(original)) !== canonicalize(consumedRetryContract(previous))
    || canonicalize(consumedRetryContract(original)) !== canonicalize(consumedRetryContract(replacement))) {
    throw new Error("conditional pass authorization retry must retain its original admission's source, scope and coverage");
  }
  return { original, replacement };
}

/** Require complete standard-lane coverage before consuming a conditional next pass. */
export function requireCompleteConditionalCoverage(lane: LaneProgressState["lane"], attempt: LaneAttempt): void {
  if (lane === "standard" && (attempt.local?.requestedCoverage ?? attempt.hosted?.requestedCoverage) !== "complete") {
    throw new Error("conditional next-pass authorization admits only a complete pass; "
      + "choose complete coverage or use conditionalNextPassWithdrawal before the fix check");
  }
}
