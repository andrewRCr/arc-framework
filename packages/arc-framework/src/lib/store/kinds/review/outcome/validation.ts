/** Content-only invariants for immutable review producer results. */
import { z } from "zod";
import { canonicalize } from "../../../../kernel/index.js";
import { LaneProgressStateSchema } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import { projectHostedFinding } from "../../../../../scripts/review-gate/hosted/await.js";
import { laneSubjectOwnerMatches } from "../../../../../scripts/review-gate/core/lane-admission.js";
import { validateReviewRequirement, validateReviewTarget } from "../../../../../scripts/review-gate/core/gate-contract-v2.js";
import { validateFrontlineResult } from "./frontline.js";
import { validateLocalOutcome } from "./local.js";
import type { ReviewOutcome } from "./schema.js";

function issue(context: z.RefinementCtx, message: string): void {
  context.addIssue({ code: "custom", message });
}

/** Validate the shared target and the complete hosted admission without storing mutable settlement state. */
export function validateReviewOutcome(value: ReviewOutcome, context: z.RefinementCtx): void {
  try {
    const target = validateReviewTarget(value.target);
    if (value.requirement !== undefined) validateReviewRequirement(target, value.requirement);
  } catch (error) {
    issue(context, error instanceof Error ? error.message : "invalid review target or requirement");
  }
  const bindings = [value.local, value.frontline, value.hosted].filter((binding) => binding !== undefined);
  if (bindings.length !== 1) issue(context, "outcome requires exactly one source binding");
  if (value.lane === "frontline" && value.frontline === undefined) {
    issue(context, "frontline lane requires its admitted frontline producer");
  }
  if (value.lineage.kind === "head-bound" && value.lineage.headSha !== value.target.headSha) {
    issue(context, "outcome target must remain at its head-bound lineage head");
  }
  if ((value.outcome === "findings") !== (value.findings.length > 0)) {
    issue(context, "only findings outcomes carry a nonempty finding set");
  }
  if (value.hosted === undefined && value.attemptId.includes("/")) {
    issue(context, "non-hosted outcome identity must be one path segment");
  }
  validateLocalOutcome(value, context);
  if (value.frontline !== undefined) validateFrontline(value, context);
  validateHosted(value, context);
}

function validateHosted(value: ReviewOutcome, context: z.RefinementCtx): void {
  if (value.hosted === undefined) return;
  const hosted = value.hosted;
  if (value.source.kind !== "hosted"
    || canonicalize(value.target) !== canonicalize(hosted.reviewTarget)
    || canonicalize(value.requirement ?? null) !== canonicalize(hosted.requirement)
    || value.requestedCoverage !== hosted.requestedCoverage
    || value.effectiveCoverage !== hosted.effectiveCoverage
    || canonicalize(value.correctionScope ?? null) !== canonicalize(hosted.admission.correctionScope ?? null)) {
    issue(context, "hosted outcome must match its complete source binding");
  }
  if (hosted.sealedResult !== undefined
    && canonicalize(value.findings) !== canonicalize(hosted.sealedResult.findings.map(projectHostedFinding))) {
    issue(context, "normalized hosted findings must match their sealed producer findings");
  }
  if (value.retryGeneration !== 0) issue(context, "hosted attempts must use generation zero");
  validateHostedProgress(value, context);
}

function validateHostedProgress(value: ReviewOutcome, context: z.RefinementCtx): void {
  const hosted = value.hosted;
  if (hosted === undefined) return;
  try {
    const verdict = value.outcome === "clean" || value.outcome === "findings";
    const projected = LaneProgressStateSchema.safeParse({
      schemaVersion: 1, semanticsVersion: "review-operation/v1", operationId: "outcome-validation",
      updatedAt: value.endedAt, kind: "lane-progress", lane: value.lane,
      repositoryId: value.target.repositoryId, lineage: value.lineage, completedPasses: verdict ? 1 : 0,
      attempts: [{
        attemptId: value.attemptId, logicalPass: value.logicalPass, retryGeneration: value.retryGeneration,
        changeRequestId: null, headSha: value.target.headSha, sourceId: value.source.sourceId,
        terminalProducer: verdict, outcome: value.outcome,
        hosted: { ...hosted, dispositionSetId: null, dispositionSetLineage: [], settledFindingIds: [], settlementEvidence: [] },
      }],
    });
    if (!projected.success) {
      for (const item of projected.error.issues) context.addIssue({ code: "custom", path: item.path, message: item.message });
    }
  } catch (error) {
    issue(context, error instanceof Error ? error.message : "invalid hosted producer binding");
  }
}

function validateFrontline(value: ReviewOutcome, context: z.RefinementCtx): void {
  const frontline = value.frontline;
  if (frontline === undefined) return;
  validateFrontlineResult(frontline, value.outcome, context);
  const admission = frontline.admission;
  const verdict = value.outcome === "clean" || value.outcome === "findings";
  if (value.source.kind !== "frontline" || value.lane !== "frontline"
    || value.attemptId !== admission.operationId
    || value.logicalPass !== admission.logicalPass
    || value.retryGeneration !== admission.retryGeneration
    || value.source.sourceId !== admission.frontlineReview.source.sourceId
    || canonicalize(value.target) !== canonicalize(admission.target)
    || !laneSubjectOwnerMatches(value.lineage, admission.lineage)
    || value.requestedCoverage !== "complete"
    || value.effectiveCoverage !== (verdict ? "complete" : null)) {
    issue(context, "frontline outcome must match its complete admission and coverage");
  }
}
