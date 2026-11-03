/** Content-only invariants for one approved response. */
import type { z } from "zod";
import { validateDispositionApproval } from "../../../../../scripts/review-gate/core/dispositions.js";
import { validateReviewFixTags } from "../../../../../scripts/review-gate/core/review-report-inputs.js";
import { validateEvidenceSettlement } from "./settlement.js";
import { validateEvidencePerformance } from "./performance.js";
import type { ReviewEvidence } from "./schema.js";

/** Validate canonical approval identity and the monotonic response envelope. */
export function validateReviewEvidenceContent(value: ReviewEvidence, context: z.RefinementCtx): void {
  const fail = (message: string) => { context.addIssue({ code: "custom", message }); };
  try {
    validateDispositionApproval(value.dispositionSet, value.approval);
    if (value.advisoryFixTags !== undefined) validateReviewFixTags(value.dispositionSet.findings, value.advisoryFixTags);
  }
  catch (error) { fail(error instanceof Error ? error.message : "invalid approved response"); }
  validateEvidencePerformance(value, context);
  validateEvidenceSettlement(value, context);
  const setId = value.dispositionSet.dispositionSetId;
  if (value.predecessorDispositionSetId === setId || value.successorDispositionSetId === setId) {
    fail("an evidence record cannot succeed or precede itself");
  }
  const binding = value.binding;
  if (binding?.kind === "candidate-member" && (binding.candidate.workUnit !== binding.deliveryMember.workUnitId
    || value.dispositionSet.frontlineBinding === undefined)) fail("a Candidate-owned member requires its exact frontline response owner");
  if (value.result.resultDigest !== value.dispositionSet.resultDigest) fail("result digest must match the approved set");
  if (value.policyProjectionPending === true && (value.performance !== undefined || value.successorDispositionSetId !== null)) {
    fail("pending policy projection cannot carry performance or a successor");
  }
}
