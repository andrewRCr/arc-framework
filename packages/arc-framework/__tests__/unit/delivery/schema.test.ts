import { describe, expect, it } from "vitest";

import {
  DeliveryPlanAuthoringInputV1Schema,
  DeliveryPlanV1Schema,
  LandedDeliveryPlanMemberV1Schema,
  LiveDeliveryPlanMemberV1Schema,
  resolveAuthoredSeamIncidence,
  validateDeliveryPlanAuthoringInputV1,
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

function validAuthoringInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:R1" }],
    },
    tasks: {
      implementation: [{ taskId: "1.1" }],
      verificationTaskId: "3.1",
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      status: "live",
      chunkKey: "record-substrate",
      title: "Record substrate",
      contract: "Publish the canonical record.",
      taskIds: ["1.1"],
      designElementIds: ["detailed:R1"],
      mainlineLandability: "independently-landable",
    }],
    seams: [],
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

describe("DeliveryPlanAuthoringInputV1Schema", () => {
  it("refuses every derived identity, owner, fingerprint, and digest", () => {
    const derivedFields: Array<readonly [readonly (string | number)[], unknown]> = [
      [["planId"], "123e4567-e89b-42d3-a456-426614174000"],
      [["planRevision"], 1],
      [["previousPlanDigest"], null],
      [["planDigest"], digest],
      [["design", "artifacts", 0, "revisionDigest"], digest],
      [["design", "elements", 0, "semanticDigest"], digest],
      [["tasks", "inventoryDigest"], digest],
      [["tasks", "implementation", 0, "semanticDigest"], digest],
      [["members", 0, "deliverableId"], digest],
      [["members", 0, "assuranceSubjectId"], digest],
      [["members", 0, "semanticFingerprint"], digest],
    ];

    for (const [path, value] of derivedFields) {
      const input = validAuthoringInput();
      let target: Record<string | number, unknown> = input;
      for (const segment of path.slice(0, -1)) {
        target = target[segment] as Record<string | number, unknown>;
      }
      target[path.at(-1)!] = value;

      const result = DeliveryPlanAuthoringInputV1Schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain(String(path.at(-1)));
    }
  });

  it("refuses derived seam incidence, ownership, identity, and fingerprints", () => {
    const input = validAuthoringInput();
    const members = input.members as Array<Record<string, unknown>>;
    members.push({ ...members[0]!, chunkKey: "authoring", title: "Authoring" });
    input.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The authoring surface consumes the published schema.",
      incidentChunkKeys: ["record-substrate", "authoring"],
      designElementIds: [],
      incidentDeliverableIds: [digest, `sha256:${"b".repeat(64)}`],
      ownerDeliverableId: digest,
      assuranceSubjectId: digest,
      semanticFingerprint: digest,
    }];

    const result = DeliveryPlanAuthoringInputV1Schema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      for (const field of [
        "incidentDeliverableIds",
        "ownerDeliverableId",
        "assuranceSubjectId",
        "semanticFingerprint",
      ]) {
        expect(result.error.message).toContain(field);
      }
    }
  });

  it("restricts first authoring to live members and accepts a validated predecessor later", () => {
    const input = validAuthoringInput();
    const [member] = input.members as Array<Record<string, unknown>>;
    member!.status = "landed";
    expect(validateDeliveryPlanAuthoringInputV1(input, null).success).toBe(false);

    const priorRevision = DeliveryPlanV1Schema.parse(validPlan());
    expect(validateDeliveryPlanAuthoringInputV1(input, priorRevision).success).toBe(true);
  });

  it("resolves authored seam chunk keys and refuses unknown members", () => {
    const input = validAuthoringInput();
    const members = input.members as Array<Record<string, unknown>>;
    members.push({ ...members[0]!, chunkKey: "authoring", title: "Authoring" });
    input.seams = [{
      seamKey: "schema-publication",
      title: "Schema publication",
      acceptance: "The authoring surface consumes the published schema.",
      incidentChunkKeys: ["record-substrate", "authoring"],
      designElementIds: [],
    }];

    const parsed = DeliveryPlanAuthoringInputV1Schema.parse(input);
    const secondDigest = `sha256:${"b".repeat(64)}`;
    expect(resolveAuthoredSeamIncidence(
      parsed,
      (chunkKey) => chunkKey === "record-substrate" ? digest : secondDigest,
    )).toEqual([{
      seamKey: "schema-publication",
      incidentDeliverableIds: [digest, secondDigest],
    }]);

    const [seam] = input.seams as Array<Record<string, unknown>>;
    seam!.incidentChunkKeys = ["record-substrate", "missing-member"];
    expect(DeliveryPlanAuthoringInputV1Schema.safeParse(input).success).toBe(false);
  });
});
