/** Replay completed local admissions directly from their immutable native outcomes. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { validateReviewReceipt } from "../core/gate-contract-v2.js";
import { LocalPrepareEnvelopeSchema } from "../core/review-command-envelope.js";
import type { LaneProgressState } from "../core/operation-state-schema.js";
import type { ReviewOutcomePort } from "../core/ports.js";
import type { LocalPrepareDependencies } from "./local-prepare.js";
import type { StablePendingReplayContext } from "./local-pending-replay.js";
import { LocalPrepareCommandError } from "./local-prepare-error.js";
import { confirmReservedLocalReplay } from "./local-reserved-obligation.js";
import { bindEndedLocalReview } from "./local-outcome-source.js";
import { localAttemptCoverageAdmission } from "../policy/local-review-coverage-selection.js";
import { projectDeliveryLocalReviewAdmissionIdentity } from "../policy/delivery-local-review-admission.js";
import type { z } from "zod";

/** Preserve the admitted target, scope, pass, and reservation without recreating execution state. */
export async function replayCompletedNativeLocalAdmission(input: StablePendingReplayContext & {
  dependencies: LocalPrepareDependencies; outcomes: ReviewOutcomePort; persistedVersion: number;
}, attempt: LaneProgressState["attempts"][number]): Promise<z.infer<typeof LocalPrepareEnvelopeSchema> | null> {
  const stored = await input.outcomes.read(attempt.attemptId);
  const outcome = stored?.value, local = outcome?.local, binding = attempt.local;
  if (stored === null || outcome === undefined || local === undefined || binding === undefined
    || outcome.requirement === undefined || local.receipt === undefined
    || outcome.attemptId !== attempt.attemptId || local.operationId !== binding.operationId
    || local.requestId !== binding.requestId || canonicalize(outcome.target) !== canonicalize(input.target)
    || local.scopeMode !== binding.scopeMode || local.scopeMode !== input.scopeMode
    || outcome.logicalPass !== attempt.logicalPass || outcome.retryGeneration !== attempt.retryGeneration
    || canonicalize(localAttemptCoverageAdmission(local)) !== canonicalize(input.coverageAdmission)
    || canonicalize(outcome.lineage) !== canonicalize(input.lineage)
    || canonicalize(projectDeliveryLocalReviewAdmissionIdentity(local.deliveryAdmission))
      !== canonicalize(projectDeliveryLocalReviewAdmissionIdentity(input.request.deliveryAdmission))) {
    throw new LocalPrepareCommandError("local completed admission does not match its outcome");
  }
  const replay = bindEndedLocalReview(stored, local, input.dependencies,
    () => new LocalPrepareCommandError("local review source reference mismatch"));
  await confirmReservedLocalReplay({ request: input.request, state: { ...local, requirement: outcome.requirement },
    lineage: input.lineage, dependencies: input.dependencies });
  const receipt = validateReviewReceipt(outcome.target, outcome.requirement, local.request, local.receipt);
  await replay.readRetainedSource();
  if (receipt.result === "clean" && outcome.requirement.retrigger === "full-final"
    && local.requestedCoverage === "incremental"
    && input.request.coverageAdmission === undefined && input.request.deliveryAdmission === undefined) return null;
  return LocalPrepareEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-local-prepare", diagnostics: [],
    state: "review-complete", nextAction: "reduce", payload: { operationId: outcome.attemptId,
      persistedVersion: input.persistedVersion, target: outcome.target,
      operationRef: replay.operationRef } });
}
