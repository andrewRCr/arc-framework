import { describe, expect, it } from "vitest";

import { DeliveryAssignmentsV1Schema } from "../../../src/lib/delivery/assignment.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

function assignment() {
  const assuranceSubjectId = canonicalDigest({ subject: "member-1" });
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-assignments/v1",
    planId: "8ddfd842-4c92-4ccb-9958-ae47b43e2c44",
    workUnitId: "delivery-plan-record",
    host: {
      adapterId: "github",
      providerBinding: { owner: "andrewRCr", repository: "arc-framework" },
    },
    terminalTarget: {
      sourceRef: "refs/heads/feat/delivery-plan-record",
      destinationRef: "refs/heads/main",
    },
    members: [{
      deliverableId: canonicalDigest({ member: "member-1" }),
      assuranceSubjectId,
      ref: "refs/heads/feat/delivery-plan-record-record-substrate",
      assignedHeadObjectId: "a".repeat(40),
      changeRequestHandles: [{ providerId: "github", changeRequestId: "pull/401" }],
      materializationGeneration: 3,
      reviewRouting: { routeId: "standard", binding: { lane: "reviewed" } },
    }],
    generationHighWater: [{ assuranceSubjectId, generation: 3 }],
  };
}

describe("delivery assignment record", () => {
  it("round-trips every decision-bearing assignment field", () => {
    const value = assignment();
    expect(DeliveryAssignmentsV1Schema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it("requires live generations to equal their retained subject high-water marks", () => {
    const value = assignment();
    expect(DeliveryAssignmentsV1Schema.safeParse({
      ...value,
      generationHighWater: [{ ...value.generationHighWater[0]!, generation: 2 }],
    }).success).toBe(false);
    expect(DeliveryAssignmentsV1Schema.safeParse({ ...value, generationHighWater: [] }).success).toBe(false);
  });

  it("refuses duplicate live or high-water subject identities", () => {
    const value = assignment();
    expect(DeliveryAssignmentsV1Schema.safeParse({
      ...value,
      members: [...value.members, value.members[0]],
    }).success).toBe(false);
    expect(DeliveryAssignmentsV1Schema.safeParse({
      ...value,
      generationHighWater: [...value.generationHighWater, value.generationHighWater[0]],
    }).success).toBe(false);
  });
});
