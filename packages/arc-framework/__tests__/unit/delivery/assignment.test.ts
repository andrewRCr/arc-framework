import { describe, expect, it } from "vitest";

import {
  DeliveryAssignmentsV1Schema,
  isDeliveryAssignmentSuccessor,
} from "../../../src/lib/delivery/assignment.js";
import { deriveMemberAssuranceSubjectId } from "../../../src/lib/delivery/identity.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

function assignment() {
  const planId = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
  const deliverableId = canonicalDigest({ member: "member-1" });
  const assuranceSubjectId = deriveMemberAssuranceSubjectId(planId, deliverableId);
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-assignments/v1",
    planId,
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
      deliverableId,
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

  it("refuses a member subject that was not derived from its deliverable", () => {
    const value = assignment();
    const assuranceSubjectId = canonicalDigest({ subject: "different-member" });

    expect(DeliveryAssignmentsV1Schema.safeParse({
      ...value,
      members: [{ ...value.members[0]!, assuranceSubjectId }],
      generationHighWater: [{ assuranceSubjectId, generation: 3 }],
    }).success).toBe(false);
  });

  it("requires every active member generation to advance when host authority changes", () => {
    const current = DeliveryAssignmentsV1Schema.parse(assignment());
    const rebound = DeliveryAssignmentsV1Schema.parse({
      ...current,
      host: {
        adapterId: "gitlab",
        providerBinding: { project: "andrewRCr/arc-framework" },
      },
    });
    const advanced = DeliveryAssignmentsV1Schema.parse({
      ...rebound,
      members: rebound.members.map((member) => ({
        ...member,
        materializationGeneration: member.materializationGeneration + 1,
      })),
      generationHighWater: rebound.generationHighWater.map((mark) => ({
        ...mark,
        generation: mark.generation + 1,
      })),
    });

    expect(isDeliveryAssignmentSuccessor(current, rebound)).toBe(false);
    expect(isDeliveryAssignmentSuccessor(current, advanced)).toBe(true);
  });

  it("requires a member generation to advance when its change request is rebound", () => {
    const current = DeliveryAssignmentsV1Schema.parse(assignment());
    const rebound = DeliveryAssignmentsV1Schema.parse({
      ...current,
      members: current.members.map((member) => ({
        ...member,
        changeRequestHandles: [{ providerId: "github", changeRequestId: "pull/402" }],
      })),
    });
    const advanced = DeliveryAssignmentsV1Schema.parse({
      ...rebound,
      members: rebound.members.map((member) => ({
        ...member,
        materializationGeneration: member.materializationGeneration + 1,
      })),
      generationHighWater: rebound.generationHighWater.map((mark) => ({
        ...mark,
        generation: mark.generation + 1,
      })),
    });

    expect(isDeliveryAssignmentSuccessor(current, rebound)).toBe(false);
    expect(isDeliveryAssignmentSuccessor(current, advanced)).toBe(true);
  });
});
