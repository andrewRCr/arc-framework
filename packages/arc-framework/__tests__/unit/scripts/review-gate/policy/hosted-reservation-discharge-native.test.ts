/** Native pending hosted requests carry the admitted owner's portable operation reference. */
import { expect, it } from "vitest";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../src/lib/delivery/review-vehicle.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { bindNativeReviewOperationReference } from "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { HostedAwaitActionSchema } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationDischarge } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";

it("binds the native owner's operation reference into a pending await", async () => {
  const workItem = OwnerIdentitySchema.parse({ type: "work-item", name: "delivery", uid: "123e4567-e89b-42d3-a456-426614174001" });
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member" as const, planId: "123e4567-e89b-12d3-a456-426614174000",
    deliverableId: `sha256:${"3".repeat(64)}`, workUnitId: "delivery", head: "b".repeat(40) });
  const target = { repository: "arc-framework/example", pullRequest: 42, headSha: vehicle.head };
  const handle = createHostedHandleFixture({ target, vehicle });
  const admission = handle.admission;
  const reservation = createStandardReviewReservation({ candidateId: `sha256:${"c".repeat(64)}`,
    sourceId: handle.provider, sources: [handle.provider], target: { kind: "delivery", repository: target.repository,
      workUnitId: "delivery", planId: vehicle.planId }, obligation: { obligation: "required", reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1", rubricDigest: admission.requirement.rubricDigest, retrigger: "full-final", count: 1 } });
  const bindCurrentOperationRef = (operationId: string) => bindNativeReviewOperationReference({ repositoryId: "repo-1",
    workItem, operationId });
  const unexpectedTerminal = async (): Promise<never> => { throw new Error("A pending request has no terminal policy."); };
  const result = await projectHostedReservationDischarge({ reservation, span: [vehicle.head], target: { ...target, vehicle },
    bindCurrentOperationRef, resolveTerminalPolicy: unexpectedTerminal, resolveEarlierTerminalPolicy: unexpectedTerminal,
    readLaneProgress: async () => ({ status: "recorded", completedPasses: 0, completePasses: 0, attempts: [{
      attemptId: admission.admissionId, logicalPass: admission.logicalPass, sourceId: handle.provider, outcome: "pending",
      hosted: { admission, handle, target, requestedCoverage: "complete", effectiveCoverage: "complete", vehicle,
        reviewTarget: admission.reviewTarget, requirement: admission.requirement, actorIdentity: admission.actorIdentity,
        requestFailureReason: null, findings: [], dispositionSetId: null, dispositionSetLineage: [], findingDispositions: [],
        settledFindingIds: [], settlementEvidence: [], reviewUrl: null, sealedResult: undefined },
    }] }) });
  const operationRef = bindCurrentOperationRef(admission.admissionId);
  expect(result).toMatchObject({ discharged: false, awaitAction: { schemaVersion: 1, handle, operationRef } });
  expect(HostedAwaitActionSchema.safeParse((result as { awaitAction: unknown }).awaitAction).success).toBe(true);
});
