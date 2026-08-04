import { describe, expect, it, vi } from "vitest";

import {
  deriveDeliverableId,
  deriveMemberAssuranceSubjectId,
  deriveSeamAssuranceSubjectId,
  deriveUniqueDeliverableIds,
  resolveDeliveryPlanId,
} from "../../../src/lib/delivery/identity.js";
import { DeliveryPlanV1Schema } from "../../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const firstPlanId = "123e4567-e89b-42d3-a456-426614174000";
const replacementPlanId = "123e4567-e89b-42d3-a456-426614174001";

function priorRevision(workUnitId = "delivery-plan-record") {
  return DeliveryPlanV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId,
    planId: firstPlanId,
    planRevision: 1,
    previousPlanDigest: null,
    design: { artifacts: [{ artifactId: "spec-delivery-plan-record.md", revisionDigest: digest }], elements: [] },
    tasks: { inventoryDigest: digest, implementation: [], verificationTaskId: "3.1" },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      status: "live",
      chunkKey: "record-substrate",
      title: "Record substrate",
      contract: "Provide the canonical delivery record substrate.",
      taskIds: [],
      designElementIds: [],
      mainlineLandability: "integration-only",
      deliverableId: digest,
      assuranceSubjectId: digest,
      semanticFingerprint: digest,
    }],
    seams: [],
    planDigest: digest,
  });
}

describe("resolveDeliveryPlanId", () => {
  it("mints once and carries the identity independently of work-unit renames", () => {
    const mint = vi.fn().mockReturnValueOnce(firstPlanId).mockReturnValue(replacementPlanId);

    expect(resolveDeliveryPlanId(null, mint)).toBe(firstPlanId);
    expect(resolveDeliveryPlanId(priorRevision(), mint)).toBe(firstPlanId);
    expect(resolveDeliveryPlanId(priorRevision("renamed-unit"), mint)).toBe(firstPlanId);
    expect(mint).toHaveBeenCalledTimes(1);
  });
});

describe("deliverable identity", () => {
  it("derives only from the registered plan-and-chunk preimage", () => {
    const expected = canonicalDigest({
      domain: "arc.delivery.deliverable-id/v1",
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      planId: firstPlanId,
      chunkKey: "record-substrate",
    });

    expect(deriveDeliverableId(firstPlanId, "record-substrate")).toBe(expected);
    expect(deriveDeliverableId(firstPlanId, "record-substrate")).toBe(expected);
  });

  it("refuses duplicate chunk keys before deriving a member identity sequence", () => {
    expect(() => deriveUniqueDeliverableIds(firstPlanId, ["record-substrate", "record-substrate"]))
      .toThrow("duplicate chunk key");
  });
});

describe("assurance-subject identity", () => {
  it("derives stable and distinct member and seam subjects from tagged preimages", () => {
    const deliverableId = deriveDeliverableId(firstPlanId, "record-substrate");
    const expectedMember = canonicalDigest({
      domain: "arc.delivery.assurance-subject-id/v1",
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      subjectKind: "member",
      planId: firstPlanId,
      deliverableId,
    });
    const expectedSeam = canonicalDigest({
      domain: "arc.delivery.assurance-subject-id/v1",
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      subjectKind: "seam",
      planId: firstPlanId,
      seamKey: "record-substrate",
    });

    expect(deriveMemberAssuranceSubjectId(firstPlanId, deliverableId)).toBe(expectedMember);
    expect(deriveSeamAssuranceSubjectId(firstPlanId, "record-substrate")).toBe(expectedSeam);
    expect(expectedSeam).not.toBe(expectedMember);
  });
});
