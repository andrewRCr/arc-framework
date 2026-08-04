import { describe, expect, it } from "vitest";

import { bindDesignInventory } from "../../../src/lib/delivery/design-inventory.js";
import {
  constructDeliveryPlanRevision,
  DeliveryPlanV1Codec,
  deriveDeliveryPlanDigest,
  validateDeliveryPlanRevision,
} from "../../../src/lib/delivery/plan.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanAuthoringInputV1,
  type DeliveryPlanV1,
} from "../../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

const planId = "123e4567-e89b-42d3-a456-426614174000";

function authoringInput(): DeliveryPlanAuthoringInputV1 {
  return DeliveryPlanAuthoringInputV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:R1" }, { elementId: "detailed:R2" }],
    },
    tasks: {
      implementation: [{ taskId: "1.1" }, { taskId: "1.2" }],
      verificationTaskId: "2.1",
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [
      {
        status: "live",
        chunkKey: "first",
        title: "First member",
        contract: "Publish the first contract.",
        taskIds: ["1.1"],
        designElementIds: ["detailed:R1"],
        mainlineLandability: "independently-landable",
      },
      {
        status: "live",
        chunkKey: "second",
        title: "Second member",
        contract: "Publish the second contract.",
        taskIds: ["1.2"],
        designElementIds: ["detailed:R2"],
        mainlineLandability: "integration-only",
      },
    ],
    seams: [],
  });
}

function constructionInput(overrides: Partial<Parameters<typeof constructDeliveryPlanRevision>[0]> = {}) {
  const design = bindDesignInventory({
    artifacts: [{
      artifactId: "spec-delivery-plan-record.md",
      revisionDigest: canonicalDigest({ source: "spec" }),
      form: "detailed",
      elements: [
        { elementId: "R1", semanticDigest: canonicalDigest({ requirement: 1 }) },
        { elementId: "R2", semanticDigest: canonicalDigest({ requirement: 2 }) },
      ],
    }],
  });
  if (design.status !== "bound") throw new Error("fixture design inventory must bind");
  const implementation = [
    { taskId: "1.1", semanticDigest: canonicalDigest({ goal: "First" }) },
    { taskId: "1.2", semanticDigest: canonicalDigest({ goal: "Second" }) },
  ];
  return {
    authoring: authoringInput(),
    taskInventory: {
      inventoryDigest: canonicalDigest(implementation),
      implementation,
      verificationTaskId: "2.1",
    },
    designInventory: design.inventory,
    predecessor: null,
    mintPlanId: () => planId,
    ...overrides,
  };
}

function constructedPlan(authoring: DeliveryPlanAuthoringInputV1 = authoringInput()): DeliveryPlanV1 {
  const result = constructDeliveryPlanRevision(constructionInput({ authoring }));
  if (result.status !== "constructed") throw new Error("fixture plan must construct");
  return result.plan;
}

function redigest(plan: DeliveryPlanV1): DeliveryPlanV1 {
  return { ...plan, planDigest: deriveDeliveryPlanDigest(plan) };
}

function expectIssue(plan: DeliveryPlanV1, code: string): void {
  const result = validateDeliveryPlanRevision(plan, null);
  expect(result.status).toBe("refused");
  if (result.status !== "refused") return;
  expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe("constructDeliveryPlanRevision", () => {
  it("preserves member order exactly as authored", () => {
    const result = constructDeliveryPlanRevision(constructionInput());

    expect(result).toMatchObject({
      status: "constructed",
      plan: {
        members: [
          { chunkKey: "first" },
          { chunkKey: "second" },
        ],
      },
    });
  });

  it("normalizes set-like member values without altering membership", () => {
    const authoring = authoringInput();
    authoring.members[0]!.taskIds = ["1.2", "1.1"];
    authoring.members[0]!.designElementIds = ["detailed:R2", "detailed:R1"];
    authoring.members[1]!.taskIds = [];
    authoring.members[1]!.designElementIds = [];

    const result = constructDeliveryPlanRevision(constructionInput({ authoring }));
    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;
    expect(result.plan.members[0]).toMatchObject({
      taskIds: ["1.1", "1.2"],
      designElementIds: ["detailed:R1", "detailed:R2"],
    });
  });

  it("derives planDigest from every record field except itself", () => {
    const result = constructDeliveryPlanRevision(constructionInput());
    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;

    expect(deriveDeliveryPlanDigest(result.plan)).toBe(result.plan.planDigest);
    expect(deriveDeliveryPlanDigest({
      ...result.plan,
      planDigest: canonicalDigest({ ignored: true }),
    })).toBe(result.plan.planDigest);
    expect(deriveDeliveryPlanDigest({
      ...result.plan,
      members: result.plan.members.map((member, index) => (
        index === 0 ? { ...member, title: "Retitled member" } : member
      )),
    })).not.toBe(result.plan.planDigest);
  });

  it("refuses authoring identities that disagree with the supplied inventories", () => {
    const taskAuthoring = authoringInput();
    taskAuthoring.tasks.implementation = [{ taskId: "1.9" }];
    const taskResult = constructDeliveryPlanRevision(constructionInput({ authoring: taskAuthoring }));
    expect(taskResult).toEqual({
      status: "refused",
      issues: [{ code: "task-inventory-binding-mismatch" }],
    });

    const designAuthoring = authoringInput();
    designAuthoring.design.elements = [{ elementId: "detailed:R9" }];
    const designResult = constructDeliveryPlanRevision(constructionInput({ authoring: designAuthoring }));
    expect(designResult).toEqual({
      status: "refused",
      issues: [{ code: "design-inventory-binding-mismatch" }],
    });
  });

  it("refuses a landed member in the first revision", () => {
    const authoring = authoringInput();
    authoring.members[0]!.status = "landed";

    expect(constructDeliveryPlanRevision(constructionInput({ authoring }))).toEqual({
      status: "refused",
      issues: [{ code: "structural-invalid" }],
    });
  });

  it("carries retrofit coverage gaps as advisories", () => {
    const authoring = authoringInput();
    authoring.entry = "from-branch";
    authoring.members[1]!.taskIds = [];

    const result = constructDeliveryPlanRevision(constructionInput({ authoring }));

    expect(result).toMatchObject({
      status: "constructed",
      advisories: [{ kind: "uncovered-implementation-task", taskId: "1.2" }],
    });
  });
});

describe("validateDeliveryPlanRevision", () => {
  it("refuses a persisted plan whose self-contained refinements fail", () => {
    const corrupted = structuredClone(constructedPlan());
    corrupted.planDigest = canonicalDigest({ wrong: "persisted-digest" });

    expect(DeliveryPlanV1Codec.decode(corrupted)).toEqual({ status: "refused" });
  });

  it("refuses a non-canonical set-like ordering", () => {
    const authoring = authoringInput();
    authoring.members[0]!.taskIds = ["1.2", "1.1"];
    authoring.members[1]!.taskIds = [];
    const plan = structuredClone(constructedPlan(authoring));
    plan.members[0]!.taskIds = ["1.2", "1.1"];

    expectIssue(redigest(plan), "normalization-mismatch");
  });

  it("distinguishes identity, digest, and uniqueness failures", () => {
    const identity = structuredClone(constructedPlan());
    identity.members[0]!.deliverableId = canonicalDigest({ wrong: "identity" });
    expectIssue(redigest(identity), "identity-mismatch");

    const digest = structuredClone(constructedPlan());
    digest.planDigest = canonicalDigest({ wrong: "digest" });
    expectIssue(digest, "plan-digest-mismatch");

    const uniqueness = structuredClone(constructedPlan());
    uniqueness.members[1]!.chunkKey = uniqueness.members[0]!.chunkKey;
    expectIssue(redigest(uniqueness), "duplicate-member-chunk-key");
  });

  it("refuses a verification task duplicated into the implementation inventory", () => {
    const plan = structuredClone(constructedPlan());
    plan.tasks.verificationTaskId = plan.tasks.implementation[0]!.taskId;

    expectIssue(redigest(plan), "verification-task-in-implementation");
  });

  it("refuses a repeated seam design-element reference", () => {
    const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
      ...authoringInput(),
      seams: [{
        seamKey: "shared-contract",
        title: "Shared contract",
        acceptance: "Both members preserve the shared contract.",
        incidentChunkKeys: ["first", "second"],
        designElementIds: ["detailed:R1"],
      }],
    });
    const plan = structuredClone(constructedPlan(authoring));
    plan.seams[0]!.designElementIds = ["detailed:R1", "detailed:R1"];

    expectIssue(redigest(plan), "duplicate-seam-design-element-id");
  });

  it("distinguishes a derived seam-owner mismatch", () => {
    const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
      ...authoringInput(),
      seams: [{
        seamKey: "shared-contract",
        title: "Shared contract",
        acceptance: "Both members preserve the shared contract.",
        incidentChunkKeys: ["first", "second"],
        designElementIds: [],
      }],
    });
    const plan = structuredClone(constructedPlan(authoring));
    plan.seams[0]!.ownerDeliverableId = plan.members[0]!.deliverableId;

    expectIssue(redigest(plan), "seam-owner-mismatch");
  });

  it("fires the declared task-coverage refinement", () => {
    const plan = structuredClone(constructedPlan());
    plan.members[1]!.taskIds = [];

    expectIssue(redigest(plan), "uncovered-implementation-task");
  });

  it("refuses stack projection cardinality and landability defects", () => {
    const tooShort = structuredClone(constructedPlan());
    tooShort.projection = { kind: "stack-to-main" };
    tooShort.members = tooShort.members.slice(0, 1);
    expectIssue(redigest(tooShort), "stack-member-count");

    const notLandable = structuredClone(constructedPlan());
    notLandable.projection = { kind: "stack-to-main" };
    expectIssue(redigest(notLandable), "stack-member-not-landable");
  });

  it("re-derives live member fingerprints", () => {
    const plan = structuredClone(constructedPlan());
    plan.members[0]!.semanticFingerprint = canonicalDigest({ wrong: "fingerprint" });

    expectIssue(redigest(plan), "member-fingerprint-mismatch");
  });

  it("carries a landed fingerprint without re-deriving moved inventory semantics", () => {
    const first = constructedPlan();
    const authoring = authoringInput();
    authoring.members[0]!.status = "landed";
    const next = constructionInput({ authoring, predecessor: first });
    const implementation = next.taskInventory.implementation.map((task) => (
      task.taskId === "1.1"
        ? { ...task, semanticDigest: canonicalDigest({ goal: "Moved after landing" }) }
        : task
    ));
    const result = constructDeliveryPlanRevision({
      ...next,
      taskInventory: {
        ...next.taskInventory,
        implementation,
        inventoryDigest: canonicalDigest(implementation),
      },
    });

    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;
    expect(result.plan.members[0]!.status).toBe("landed");
    expect(result.plan.members[0]!.semanticFingerprint).toBe(first.members[0]!.semanticFingerprint);
  });

  it("requires a converting landed member to equal its live predecessor modulo status", () => {
    const first = constructedPlan();
    const authoring = authoringInput();
    authoring.members[0]!.status = "landed";
    authoring.members[0]!.contract = "Changed while converting.";

    const result = constructDeliveryPlanRevision(constructionInput({
      authoring,
      predecessor: first,
    }));
    expect(result.status).toBe("refused");
    if (result.status !== "refused") return;
    expect(result.issues.map((issue) => issue.code)).toContain("landed-conversion-mismatch");
  });

  it("keeps an already frozen member byte-identical", () => {
    const first = constructedPlan();
    const conversionAuthoring = authoringInput();
    conversionAuthoring.members[0]!.status = "landed";
    const secondResult = constructDeliveryPlanRevision(constructionInput({
      authoring: conversionAuthoring,
      predecessor: first,
    }));
    expect(secondResult.status).toBe("constructed");
    if (secondResult.status !== "constructed") return;

    const changedAuthoring = authoringInput();
    changedAuthoring.members[0]!.status = "landed";
    changedAuthoring.members[0]!.title = "Changed after freezing";
    const thirdResult = constructDeliveryPlanRevision(constructionInput({
      authoring: changedAuthoring,
      predecessor: secondResult.plan,
    }));
    expect(thirdResult.status).toBe("refused");
    if (thirdResult.status !== "refused") return;
    expect(thirdResult.issues.map((issue) => issue.code)).toContain("landed-member-mismatch");
  });

  it("constructs revision one with no predecessor digest", () => {
    const plan = constructedPlan();

    expect(plan).toMatchObject({
      planRevision: 1,
      previousPlanDigest: null,
    });
  });

  it("refuses revision-one lineage that claims a predecessor", () => {
    const plan = structuredClone(constructedPlan());
    plan.planRevision = 2;
    plan.previousPlanDigest = canonicalDigest({ impossible: "predecessor" });

    expectIssue(redigest(plan), "first-revision-lineage-mismatch");
  });

  it("requires exact predecessor identity, revision, and digest lineage", () => {
    const first = constructedPlan();
    const secondResult = constructDeliveryPlanRevision(constructionInput({ predecessor: first }));
    expect(secondResult.status).toBe("constructed");
    if (secondResult.status !== "constructed") return;
    expect(secondResult.plan).toMatchObject({
      planId: first.planId,
      planRevision: 2,
      previousPlanDigest: first.planDigest,
    });

    const wrongIdentity = structuredClone(secondResult.plan);
    wrongIdentity.planId = "123e4567-e89b-42d3-a456-426614174001";
    expectIssueAgainst(redigest(wrongIdentity), first, "plan-id-lineage-mismatch");

    const skippedRevision = structuredClone(secondResult.plan);
    skippedRevision.planRevision = 3;
    expectIssueAgainst(redigest(skippedRevision), first, "plan-revision-lineage-mismatch");

    const wrongDigest = structuredClone(secondResult.plan);
    wrongDigest.previousPlanDigest = canonicalDigest({ wrong: "predecessor" });
    expectIssueAgainst(redigest(wrongDigest), first, "predecessor-digest-mismatch");
  });

  it("carries an optional opaque project identity without interpreting it or deriving identities from it", () => {
    const withoutProject = constructedPlan();
    const authoring = authoringInput();
    authoring.projectId = "clone-local://remote-shaped value";
    const withProject = constructedPlan(authoring);

    expect(withProject.projectId).toBe("clone-local://remote-shaped value");
    expect(validateDeliveryPlanRevision(withProject, null).status).toBe("valid");
    expect(withProject.planId).toBe(withoutProject.planId);
    expect(withProject.members.map((member) => ({
      deliverableId: member.deliverableId,
      assuranceSubjectId: member.assuranceSubjectId,
    }))).toEqual(withoutProject.members.map((member) => ({
      deliverableId: member.deliverableId,
      assuranceSubjectId: member.assuranceSubjectId,
    })));
  });
});

function expectIssueAgainst(
  plan: DeliveryPlanV1,
  predecessor: DeliveryPlanV1,
  code: string,
): void {
  const result = validateDeliveryPlanRevision(plan, predecessor);
  expect(result.status).toBe("refused");
  if (result.status !== "refused") return;
  expect(result.issues.map((issue) => issue.code)).toContain(code);
}
