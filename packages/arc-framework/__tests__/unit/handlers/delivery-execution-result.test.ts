/** Delivery acknowledgment results can carry record authority without checkout artifacts. */
import { expect, it, vi } from "vitest";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { DeliveryExecutionResultSchema } from "../../../src/handlers/delivery-execution.js";
import { driveDeliveryReviewFixContinuation, type DeliveryReviewFixDriveDispatchAction } from "../../../src/lib/delivery/review-fix-driver.js";

it.each(["acknowledged", "already-acknowledged"] as const)("accepts %s with stored or tracked record authority", status => {
  const state = deliveryStateFixture(deliveryStackPlanFixture());
  const common = { status, state: { revision: 10, value: state }, nextAction: "resolve-delivery-status",
    candidate: { candidateId: canonicalDigest({ candidate: 1 }), verificationId: canonicalDigest({ verification: 1 }) },
    boundaryCarry: { candidateId: canonicalDigest({ candidate: 1 }), stateRevision: 10 } };
  const tracked = { ...common, candidate: { ...common.candidate, recordPath: "candidate.json" },
    boundaryCarry: { ...common.boundaryCarry, path: "boundary.json" }, recordEffects: [
      { path: "candidate.json", digest: canonicalDigest({ candidate: 1 }) },
      { path: "boundary.json", digest: canonicalDigest({ boundary: 1 }) },
    ] };
  expect(DeliveryExecutionResultSchema.parse(tracked)).toEqual(tracked);
  expect(DeliveryExecutionResultSchema.parse(common)).toEqual(common);
});

it("accepts a native review-fix drive whose boundary carry wrote no tracked path", async () => {
  const action: DeliveryReviewFixDriveDispatchAction = { kind: "delivery-review-fix-acknowledge" };
  const progress = { stateRevision: 10, operationId: null, boundaryVersion: "boundary-1", relevantHeads: ["a".repeat(40)] };
  const carry = { candidateId: canonicalDigest({ candidate: 1 }), stateRevision: 10 };
  const result = await driveDeliveryReviewFixContinuation({
    project: vi.fn().mockResolvedValue({ step: { status: "dispatch", action, recommendedActionText: "Acknowledge." }, progress }),
    execute: vi.fn().mockResolvedValue({ status: "acknowledged", boundaryCarry: carry }),
  });
  expect(result).toMatchObject({ status: "refused", effectLog: [
    { kind: "dispatch", actionKind: "delivery-review-fix-acknowledge", resultStatus: "acknowledged" },
    { kind: "boundary-carry", ...carry }] });
  expect(DeliveryExecutionResultSchema.parse(result)).toEqual(result);
});
