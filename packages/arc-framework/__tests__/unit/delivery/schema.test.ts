import { describe, expect, it } from "vitest";

import {
  DeliveryPlanV1Schema,
  LandedDeliveryPlanMemberV1Schema,
  LiveDeliveryPlanMemberV1Schema,
} from "../../../src/lib/delivery/schema.js";

const digest = `sha256:${"a".repeat(64)}`;

function validPlan(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    planId: "123e4567-e89b-42d3-a456-426614174000",
    planRevision: 1,
    previousPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md", revisionDigest: digest }],
      elements: [],
    },
    tasks: {
      inventoryDigest: digest,
      implementation: [{ taskId: "1.1", semanticDigest: digest }],
      verificationTaskId: "3.1",
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      status: "live",
      chunkKey: "record-substrate",
      deliverableId: digest,
      title: "Record substrate",
      contract: "Publish the canonical record.",
      taskIds: ["1.1"],
      designElementIds: [],
      mainlineLandability: "independently-landable",
      assuranceSubjectId: digest,
      semanticFingerprint: digest,
    }],
    seams: [],
    planDigest: digest,
  };
}

describe("DeliveryPlanV1Schema", () => {
  it("refuses unknown delivery and execution fields instead of dropping them", () => {
    for (const forbidden of [
      "providerBinding",
      "branch",
      "pullRequest",
      "reviewTarget",
      "taskCompletionState",
      "workflowSteps",
    ]) {
      const plan = validPlan();
      plan[forbidden] = "not plan intent";
      expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
    }

    const plan = validPlan();
    const [member] = plan.members as Array<Record<string, unknown>>;
    member!.providerBinding = { provider: "github" };
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("permits landed members only after the first plan revision", () => {
    const firstRevision = validPlan();
    const [firstMember] = firstRevision.members as Array<Record<string, unknown>>;
    firstMember!.status = "landed";
    expect(DeliveryPlanV1Schema.safeParse(firstRevision).success).toBe(false);

    const laterRevision = validPlan();
    laterRevision.planRevision = 2;
    laterRevision.previousPlanDigest = digest;
    const [laterMember] = laterRevision.members as Array<Record<string, unknown>>;
    laterMember!.status = "landed";
    expect(DeliveryPlanV1Schema.safeParse(laterRevision).success).toBe(true);

    expect(LiveDeliveryPlanMemberV1Schema.safeParse(laterMember).success).toBe(false);
    laterMember!.status = "live";
    expect(LandedDeliveryPlanMemberV1Schema.safeParse(laterMember).success).toBe(false);
  });

  it("requires every seam to name at least two distinct incident deliverables", () => {
    const plan = validPlan();
    plan.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The production artifact exposes the delivery family.",
      incidentDeliverableIds: [digest, digest],
      ownerDeliverableId: digest,
      designElementIds: [],
      assuranceSubjectId: digest,
      semanticFingerprint: digest,
    }];
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);

    const [seam] = plan.seams as Array<Record<string, unknown>>;
    seam!.incidentDeliverableIds = [digest];
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("accepts an omitted project identity and refuses an empty one", () => {
    expect(DeliveryPlanV1Schema.safeParse(validPlan()).success).toBe(true);

    const plan = validPlan();
    plan.projectId = "";
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });

  it("requires every member to carry its mainline landability assertion", () => {
    const plan = validPlan();
    const [member] = plan.members as Array<Record<string, unknown>>;
    delete member!.mainlineLandability;
    expect(DeliveryPlanV1Schema.safeParse(plan).success).toBe(false);
  });
});
