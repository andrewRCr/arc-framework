/** Portable frontline outcomes retain original source digests before executable redaction. */
import { canonicalize } from "../../../kernel/index.js";
import { computeFrontlineSourceBindingId } from "../../../../scripts/review-gate/policy/frontline-operation.js";
import type { LaneProgressState } from "../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOutcome } from "./outcome/schema.js";
import type { ReviewMappingSources } from "./mapping-sources.js";

/** Join an admitted frontline attempt to exactly one recorded outcome, without requiring run state. */
export function mapFrontlineAttempt(attempt: LaneProgressState["attempts"][number], lane: LaneProgressState,
  endedAt: string, sources: ReviewMappingSources): ReviewOutcome {
  const binding = attempt.frontline;
  if (binding === undefined || attempt.outcome === "pending") throw new Error("Expected ended frontline admission.");
  const admission = binding.admission;
  const outcomes = [...sources.frontline.values()].filter((record) => record.operationId === admission.operationId);
  const record = outcomes[0];
  if (outcomes.length !== 1 || record === undefined) throw new Error(`Expected one frontline outcome for ${admission.operationId}.`);
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
  for (const state of sources.operations.values()) {
    if (state.kind === "frontline-run" && state.operationId === admission.operationId
      && state.sourceBindingId !== sourceBindingId) throw new Error(`Frontline source binding mismatch: ${admission.operationId}.`);
  }
  return {
    schemaVersion: 1, attemptId: attempt.attemptId, lane: lane.lane, lineage: admission.lineage,
    logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
    source: { sourceId: attempt.sourceId, kind: "frontline" }, target: admission.target,
    requestedCoverage: "complete", effectiveCoverage: binding.effectiveCoverage,
    outcome: attempt.outcome === "settled-findings" ? "findings" : attempt.outcome,
    findings: record.outcome.findings, endedAt,
    frontline: { admission: { ...admission, frontlineReview: { ...admission.frontlineReview, action: "attempt", promptText,
      source: source.kind === "command" ? { sourceId: source.sourceId, kind: "command", capability: null }
        : { sourceId: source.sourceId, kind: "agent", capability: source.handle.capabilityId } } },
    outcomeDigest: record.outcomeDigest, sourceBindingId, executableIdentity: record.executableIdentity,
    reason: record.outcome.reason, ...(record.responseBinding === undefined ? {} : { responseBinding: record.responseBinding }) },
  };
}
