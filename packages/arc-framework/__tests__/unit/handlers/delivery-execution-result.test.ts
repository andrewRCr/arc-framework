/** Delivery acknowledgment results can carry record authority without checkout artifacts. */
import { expect, it } from "vitest";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { DeliveryExecutionResultSchema } from "../../../src/handlers/delivery-execution.js";

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
