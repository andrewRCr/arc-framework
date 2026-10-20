/** Native pending records enforce one admission per logical pass in every lane. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { createFrontlineFixture } from "../../../../fixtures/frontline-review.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { ReviewInFlightLaneSchema, projectReviewInFlightAttempt } from "../../../../../src/scripts/review-gate/core/in-flight-state-schema.js";
import { LaneAttemptSchema } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { laneProgressOperationId } from "../../../../../src/scripts/review-gate/lane-progress.js";

it.each(["local", "frontline", "hosted"] as const)("refuses duplicate %s pending admissions and accepts a repaired single admission", kind => {
  const handle = createHostedHandleFixture(), target = handle.admission.reviewTarget;
  const local = localOutcome({ target });
  const frontline = createFrontlineFixture(target);
  const lane = kind === "frontline" ? "frontline" as const : "standard" as const;
  const lineage = kind === "local" ? local.lineage : kind === "frontline" ? frontline.admission.lineage : handle.admission.lineage;
  const attempt = projectReviewInFlightAttempt(LaneAttemptSchema.parse({
    attemptId: kind === "local" ? local.attemptId : kind === "frontline" ? frontline.admission.operationId : handle.admission.admissionId,
    logicalPass: 1, retryGeneration: 0, headSha: target.headSha, changeRequestId: null,
    sourceId: kind === "local" ? local.source.sourceId : kind === "frontline" ? frontline.outcomeRecord.sourceIdentity : handle.provider,
    outcome: "pending", terminalProducer: false,
    ...(kind === "local" ? { local: LaneAttemptSchema.shape.local.unwrap().strip().parse({ ...local.local, effectiveCoverage: null }) }
      : kind === "frontline" ? { frontline: { admission: frontline.admission, effectiveCoverage: null } }
      : { hosted: { admission: handle.admission, target: handle.target, requestedCoverage: handle.requestedCoverage,
        effectiveCoverage: null, reviewTarget: target, requirement: handle.admission.requirement,
        actorIdentity: handle.admission.actorIdentity, requestFailureReason: null, dispositionSetId: null,
        dispositionSetLineage: [], settledFindingIds: [], settlementEvidence: [] } }),
  }));
  const state = { schemaVersion: 1, semanticsVersion: "review-operation/v1", kind: "lane-progress", lane, lineage,
    repositoryId: target.repositoryId, operationId: laneProgressOperationId({ lane, lineage,
      repositoryId: target.repositoryId, headSha: target.headSha }), updatedAt: "2026-10-20T12:00:00Z",
    workItem: OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "123e4567-e89b-42d3-a456-426614174099" }),
    attempts: [attempt, { ...attempt, attemptId: `${attempt.attemptId}-duplicate` }] };
  const invalid = ReviewInFlightLaneSchema.safeParse(state);
  expect(invalid.success).toBe(false);
  if (invalid.success) throw new Error("Expected duplicate pending-pass refusal");
  expect(invalid.error.issues).toContainEqual(expect.objectContaining({ message: "One logical pass may have only one attempt in flight." }));
  expect(ReviewInFlightLaneSchema.parse({ ...state, attempts: [attempt] }).attempts).toEqual([attempt]);
});
