/** Portable frontline outcomes retain original source digests before executable redaction. */
import { FrontlineAdmissionSchema } from "../../../../scripts/review-gate/core/frontline-admission.js";
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import { projectFrontlineOutcome } from "./outcome/frontline.js";
import type { ReviewOutcome } from "./outcome/schema.js";
import { mappingFrontlineOutcome, type ReviewMappingSources } from "./mapping-sources.js";

/** Join an admitted frontline attempt to exactly one recorded outcome, without requiring run state. */
export function mapFrontlineAttempt(attempt: LaneProgressState["attempts"][number], lane: LaneProgressState,
  endedAt: string, sources: ReviewMappingSources): ReviewOutcome {
  const binding = attempt.frontline;
  if (binding === undefined || attempt.outcome === "pending") throw new Error("Expected ended frontline admission.");
  const admission = FrontlineAdmissionSchema.parse(binding.admission);
  const record = mappingFrontlineOutcome(sources, admission.operationId);
  const value = projectFrontlineOutcome(admission, record, endedAt);
  for (const state of sources.operations.values()) {
    if (state.kind === "frontline-run" && state.operationId === admission.operationId
      && state.sourceBindingId !== value.frontline.sourceBindingId) throw new Error(`Frontline source binding mismatch: ${admission.operationId}.`);
  }
  return { ...value, attemptId: attempt.attemptId, lane: lane.lane,
    logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
    source: { sourceId: attempt.sourceId, kind: "frontline" }, effectiveCoverage: binding.effectiveCoverage,
    outcome: attempt.outcome === "settled-findings" ? "findings" : attempt.outcome };
}
