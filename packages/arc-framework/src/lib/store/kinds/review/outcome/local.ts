/** Portable local-review facts and their exact request and receipt bindings. */
import { z } from "zod";
import { canonicalize } from "../../../../kernel/index.js";
import { LaneAttemptSchema, LocalReviewStateSchema } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import { ReviewReceiptV2Schema } from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import {
  validateReviewReceipt, validateReviewRequest,
} from "../../../../../scripts/review-gate/core/gate-contract-v2.js";
import { laneSubjectLineageId } from "../../../../../scripts/review-gate/core/lane-admission.js";
import type { ReviewOutcome } from "./schema.js";

const state = LocalReviewStateSchema.shape;
export const LocalOutcomeBindingSchema = LaneAttemptSchema.shape.local.unwrap().safeExtend({
  request: state.request,
  attestation: state.attestation,
  policyVersion: state.policyVersion,
  policyBindingDigest: state.policyBindingDigest,
  attestationRuntimeKind: state.attestationRuntimeKind,
  sourceDigest: state.sourceDigest,
  guidanceDigest: state.guidanceDigest,
  receipt: ReviewReceiptV2Schema.optional(),
});

/** Refuse local facts that cannot reproduce their admitted result on another machine. */
export function validateLocalOutcome(value: ReviewOutcome, context: z.RefinementCtx): void {
  const local = value.local;
  if (local === undefined) return;
  const fail = (message: string) => { context.addIssue({ code: "custom", path: ["local"], message }); };
  const verdict = value.outcome === "clean" || value.outcome === "findings";
  if (value.source.kind !== "local" || value.source.sourceId !== "delegated-agent"
    || value.lane !== "standard" || local.operationId !== value.attemptId
    || canonicalize(local.target) !== canonicalize(value.target)
    || local.requestedCoverage !== value.requestedCoverage || local.effectiveCoverage !== value.effectiveCoverage
    || canonicalize(local.correctionScope ?? null) !== canonicalize(value.correctionScope ?? null)
    || value.effectiveCoverage !== (verdict ? value.requestedCoverage : null)) {
    fail("local outcome must match its admitted producer and coverage");
  }
  if (value.lineage.kind === "delivery-member" && local.vehicle.kind === "delivery-member"
    && local.vehicle.identity !== value.lineage.deliverableId) {
    fail("local outcome must remain inside its delivery member lineage");
  }
  try {
    const requirement = value.requirement;
    if (requirement === undefined) throw new Error("local outcome requires its review requirement");
    const request = validateReviewRequest(value.target, local.request);
    if (request.requestId !== local.requestId || request.requirementId !== requirement.requirementId
      || request.lineageId !== laneSubjectLineageId(value.lineage)
      || request.logicalPass !== value.logicalPass || request.generation !== value.retryGeneration
      || requirement.policyVersion !== local.policyVersion
      || request.evaluatorIdentity !== local.attestation.evaluatorIdentity) {
      fail("local request and attestation must match the outcome admission");
    }
    validateLocalReceipt(value, context);
  } catch (error) { fail(error instanceof Error ? error.message : "invalid local admission"); }
}

function validateLocalReceipt(value: ReviewOutcome, context: z.RefinementCtx): void {
  const local = value.local;
  const requirement = value.requirement;
  if (local === undefined || requirement === undefined) return;
  const verdict = value.outcome === "clean" || value.outcome === "findings";
  if (verdict && local.receipt === undefined) {
    context.addIssue({ code: "custom", path: ["local", "receipt"], message: "local verdict requires its recorded receipt" });
  }
  if (local.receipt === undefined) return;
  const receipt = validateReviewReceipt(value.target, requirement, local.request, local.receipt);
  const receiptOutcome = receipt.result === "failed" ? "terminal-failure"
    : receipt.result === "unavailable" ? "transient-unavailable" : receipt.result;
  if (receiptOutcome !== value.outcome || canonicalize(receipt.findings) !== canonicalize(value.findings)) {
    context.addIssue({ code: "custom", path: ["local", "receipt"], message: "local receipt result and findings must match the outcome" });
  }
}
