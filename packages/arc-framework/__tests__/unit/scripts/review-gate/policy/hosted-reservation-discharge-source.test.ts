/** Native delegated findings retain their submit-ready local continuation through discharge. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { DeliveryLocalReviewAdmissionSchema } from "../../../../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { bindNativeReviewOperationReference } from "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { DeliveryLocalResumeActionSchema } from "../../../../../src/scripts/review-gate/status.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationDischarge } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";

it("projects a native local resume action accepted by its published delivery schema", async () => {
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example", { branch: null });
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174002", deliverableId: `sha256:${"7".repeat(64)}`, head: "c".repeat(40) });
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId, baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
    headSha: vehicle.head, headTree: "d".repeat(40) });
  const hostedTarget = { repository: "owner/repository", pullRequest: 42, headSha: vehicle.head };
  const admission = DeliveryLocalReviewAdmissionSchema.parse({ schemaVersion: 1, sourceId: "delegated-agent",
    statusTarget: { repository: hostedTarget.repository, headRef: "topic/example", headSha: vehicle.head },
    target: hostedTarget, vehicle, pass: 1, requestedCoverage: "complete" });
  const operationId = "local-review-prior";
  const operationRef = bindNativeReviewOperationReference({ repositoryId, workItem: primary.reference.owner, operationId });
  const reservation = createStandardReviewReservation({ candidateId: `sha256:${"8".repeat(64)}`,
    sourceId: "delegated-agent", sources: ["delegated-agent"], repository: hostedTarget.repository, headSha: vehicle.head,
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"9".repeat(64)}`, retrigger: "full-final", count: 1 } });
  const unreachable = async (): Promise<never> => { throw new Error("Findings must resume before terminal policy"); };
  const result = await projectHostedReservationDischarge({ reservation, span: [vehicle.head], target: { ...hostedTarget, vehicle },
    bindCurrentOperationRef: () => operationRef,
    readLaneProgress: async () => ({ status: "recorded", completedPasses: 1, completePasses: 1,
      attempts: [{ attemptId: operationId, logicalPass: 1, sourceId: "delegated-agent", outcome: "findings",
        local: { vehicle: { kind: "delivery-member", identity: vehicle.deliverableId }, target,
          requestedCoverage: "complete", effectiveCoverage: "complete", scopeMode: "whole-target", deliveryAdmission: admission } }] }),
    resolveTerminalPolicy: unreachable, resolveEarlierTerminalPolicy: unreachable });
  expect(result.localResumeAction).toEqual({ schemaVersion: 1, operationId, operationRef });
  expect(DeliveryLocalResumeActionSchema.parse(result.localResumeAction)).toEqual(result.localResumeAction);
});

it("refuses a delivery resume locator for another operation and accepts its correction", async () => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example", { branch: null });
  const binding = { repositoryId: "native-project", workItem: primary.reference.owner };
  const action = { schemaVersion: 1, operationId: "local-review-prior" };
  const mismatched = { ...action, operationRef: bindNativeReviewOperationReference({ ...binding, operationId: "another-operation" }) };
  expect(DeliveryLocalResumeActionSchema.safeParse(mismatched).success).toBe(false);
  const corrected = { ...action, operationRef: bindNativeReviewOperationReference({ ...binding, operationId: action.operationId }) };
  expect(DeliveryLocalResumeActionSchema.parse(corrected)).toEqual(corrected);
});
