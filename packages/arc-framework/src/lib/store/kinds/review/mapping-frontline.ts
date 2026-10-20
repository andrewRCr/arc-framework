/** Portable frontline outcomes retain original source digests before executable redaction. */
import { projectPortableFrontlineAdmission } from "../../../../scripts/review-gate/core/portable-frontline-admission.js";
import { frontlineLaneOutcome } from "../../../../scripts/review-gate/core/frontline-lane-outcome.js";
import type { FrontlineOutcomeRecord } from "../../../../scripts/review-gate/core/advisory-records.js";
import { FrontlineAdmissionSchema, type FrontlineAdmission } from "../../../../scripts/review-gate/core/frontline-admission.js";
import { canonicalize } from "../../../kernel/index.js";
import { computeFrontlineSourceBindingId } from "../../../../scripts/review-gate/core/frontline-source-binding.js";
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
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
      && state.sourceBindingId !== value.frontline?.sourceBindingId) throw new Error(`Frontline source binding mismatch: ${admission.operationId}.`);
  }
  return { ...value, attemptId: attempt.attemptId, lane: lane.lane,
    logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
    source: { sourceId: attempt.sourceId, kind: "frontline" }, effectiveCoverage: binding.effectiveCoverage,
    outcome: attempt.outcome === "settled-findings" ? "findings" : attempt.outcome };
}

/** Capture a run's original identities before removing executable launch coordinates. */
export function projectFrontlineOutcome(admissionInput: FrontlineAdmission, record: FrontlineOutcomeRecord,
  endedAt: string): ReviewOutcome {
  const admission = FrontlineAdmissionSchema.parse(admissionInput);
  const source = record.outcome.source;
  const promptText = admission.frontlineReview.promptText;
  if (admission.frontlineReview.action !== "attempt" || promptText === null
    || record.outcome.reason?.class === "pass-cap-exhausted") throw new Error("Frontline record has no admitted attempt.");
  const sourceBindingId = computeFrontlineSourceBindingId(source, record.responseBinding);
  if (canonicalize(source) !== canonicalize(admission.frontlineReview.source)
    || canonicalize(record.outcome.target) !== canonicalize(admission.target)
    || record.outcome.pass !== admission.logicalPass || record.outcome.maxPasses !== admission.maxPasses) {
    throw new Error(`Frontline outcome does not match admission ${admission.operationId}.`);
  }
  const outcome = frontlineLaneOutcome(record.outcome.outcome, record.outcome.reason?.class ?? null);
  if (outcome === null || outcome === "pending" || outcome === "settled-findings") throw new Error("Frontline record has no ended attempt.");
  const complete = outcome === "clean" || outcome === "findings";
  return {
    schemaVersion: 1, attemptId: admission.operationId, lane: "frontline", lineage: admission.lineage,
    logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration,
    source: { sourceId: source.sourceId, kind: "frontline" }, target: admission.target,
    requestedCoverage: "complete", effectiveCoverage: complete ? "complete" : null,
    outcome,
    findings: record.outcome.findings, endedAt,
    frontline: { admission: projectPortableFrontlineAdmission(admission),
    outcomeDigest: record.outcomeDigest, sourceBindingId, executableIdentity: record.executableIdentity,
    reason: record.outcome.reason, ...(record.responseBinding === undefined ? {} : { responseBinding: record.responseBinding }) },
  };
}
