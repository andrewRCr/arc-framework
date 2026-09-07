import { describe, expect, it, vi } from "vitest";

import {
  deriveDeliverableId,
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
    tasks: {
      inventoryDigest: digest,
      parents: [{
        taskId: "3.1",
        semanticDigest: null,
        role: { kind: "verification", scope: "work-unit" },
      }],
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      chunkKey: "record-substrate",
      title: "Record substrate",
      contract: "Provide the canonical delivery record substrate.",
      taskIds: [],
      designElementIds: [],
      mainlineLandability: "integration-only",
      deliverableId: digest,
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
