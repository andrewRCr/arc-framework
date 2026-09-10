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
import type { DeliveryTaskInventoryEntry } from "../../../src/lib/delivery/task-inventory.js";
import { canonicalDigest, SlugSchema } from "../../../src/lib/kernel/index.js";
import { deliverySingleMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";

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
      parents: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "member" } },
        { taskId: "1.3", role: { kind: "implementation" } },
        { taskId: "1.4", role: { kind: "verification", scope: "member" } },
        { taskId: "2.1", role: { kind: "verification", scope: "work-unit" } },
      ],
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [
      {
        chunkKey: "first",
        title: "First member",
        contract: "Publish the first contract.",
        taskIds: ["1.1", "1.2"],
        designElementIds: ["detailed:R1"],
        mainlineLandability: "independently-landable",
      },
      {
        chunkKey: "second",
        title: "Second member",
        contract: "Publish the second contract.",
        taskIds: ["1.3", "1.4"],
        designElementIds: ["detailed:R2"],
        mainlineLandability: "integration-only",
      },
    ],
    seams: [],
  });
}

function constructionInput(
  overrides: Partial<Parameters<typeof constructDeliveryPlanRevision>[0]> = {},
): Parameters<typeof constructDeliveryPlanRevision>[0] {
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
  const parents: DeliveryTaskInventoryEntry[] = [
    {
      taskId: "1.1",
      semanticDigest: canonicalDigest({ goal: "First" }),
      role: { kind: "implementation" as const },
    },
    {
      taskId: "1.2",
      semanticDigest: canonicalDigest({ goal: "Verify first" }),
      role: { kind: "verification" as const, scope: "member" },
    },
    {
      taskId: "1.3",
      semanticDigest: canonicalDigest({ goal: "Second" }),
      role: { kind: "implementation" as const },
    },
    {
      taskId: "1.4",
      semanticDigest: canonicalDigest({ goal: "Verify second" }),
      role: { kind: "verification" as const, scope: "member" },
    },
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  return {
    authoring: authoringInput(),
    taskInventory: {
      inventoryDigest: canonicalDigest(parents),
      parents,
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
    taskAuthoring.tasks.parents = [{ taskId: "1.9", role: { kind: "implementation" } }];
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

  it("carries retrofit coverage gaps as advisories", () => {
    const authoring = authoringInput();
    authoring.entry = "from-branch";
    authoring.members[1]!.taskIds = ["1.4"];

    const result = constructDeliveryPlanRevision(constructionInput({ authoring }));

    expect(result).toMatchObject({
      status: "constructed",
      advisories: [{ kind: "uncovered-assignable-task", taskId: "1.3" }],
    });
  });

  it("refuses a member whose final assigned task is not a member verifier", () => {
    const input = constructionInput();
    const authoredTask = input.authoring.tasks.parents.find((task) => task.taskId === "1.2");
    if (authoredTask === undefined) throw new Error("expected authored task");
    authoredTask.role = { kind: "implementation" };
    const parents = input.taskInventory.parents.map((task) => task.taskId === "1.2"
      ? { ...task, role: { kind: "implementation" as const } }
      : task);

    const result = constructDeliveryPlanRevision({
      ...input,
      taskInventory: {
        ...input.taskInventory,
        parents,
        inventoryDigest: canonicalDigest(parents),
      },
    });

    expect(result).toEqual({
      status: "refused",
      issues: [{ code: "member-verification-task-boundary" }],
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

  it("requires exactly one terminal work-unit verifier", () => {
    const plan = structuredClone(constructedPlan());
    const terminal = plan.tasks.parents.at(-1)!;
    terminal.role = { kind: "verification", scope: "member" };
    terminal.semanticDigest = canonicalDigest({ goal: "Member close-out" });

    expectIssue(redigest(plan), "work-unit-verification-task-ambiguous");
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

  it("fires the declared task-coverage refinements", () => {
    const plan = structuredClone(constructedPlan());
    plan.members[1]!.taskIds = [];

    expectIssue(redigest(plan), "member-task-order");
    expectIssue(redigest(plan), "uncovered-assignable-task");
  });

  it("admits a one-member stack and refuses landability defects", () => {
    expect(validateDeliveryPlanRevision(deliverySingleMemberStackPlanFixture(), null))
      .toMatchObject({ status: "valid" });

    const notLandable = structuredClone(constructedPlan());
    notLandable.projection = { kind: "stack-to-main" };
    expectIssue(redigest(notLandable), "stack-member-not-landable");
  });

  it("re-derives member fingerprints", () => {
    const plan = structuredClone(constructedPlan());
    plan.members[0]!.semanticFingerprint = canonicalDigest({ wrong: "fingerprint" });

    expectIssue(redigest(plan), "member-fingerprint-mismatch");
  });

  it("re-derives member fingerprints from current task roles", () => {
    const authoring = authoringInput();
    const first = constructedPlan(authoring);
    const next = constructionInput({
      authoring: structuredClone(authoring),
      predecessor: first,
    });
    const authoredTask = next.authoring.tasks.parents.find((task) => task.taskId === "1.1");
    if (authoredTask === undefined) throw new Error("expected authored task");
    authoredTask.role = { kind: "verification", scope: "segment" };
    const parents = next.taskInventory.parents.map((task) => (
      task.taskId === "1.1"
        ? { ...task, role: { kind: "verification" as const, scope: "segment" as const } }
        : task
    ));
    const result = constructDeliveryPlanRevision({
      ...next,
      taskInventory: {
        ...next.taskInventory,
        parents,
        inventoryDigest: canonicalDigest(parents),
      },
    });

    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;
    expect(result.plan.members[0]!.semanticFingerprint).not.toBe(first.members[0]!.semanticFingerprint);
    expect(result.plan.members[1]!.semanticFingerprint).toBe(first.members[1]!.semanticFingerprint);
  });

  it("re-derives seam and incident-member fingerprints from current seam semantics", () => {
    const firstAuthoring = DeliveryPlanAuthoringInputV1Schema.parse({
      ...authoringInput(),
      seams: [{
        seamKey: "shared-contract",
        title: "Shared contract",
        acceptance: "Both members preserve the first shared contract.",
        incidentChunkKeys: ["first", "second"],
        designElementIds: [],
      }],
    });
    const first = constructedPlan(firstAuthoring);
    const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
      ...authoringInput(),
      seams: [{
        ...firstAuthoring.seams[0]!,
        acceptance: "Both members preserve the current shared contract.",
      }],
    });

    const result = constructDeliveryPlanRevision(constructionInput({
      authoring,
      predecessor: first,
    }));
    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;
    expect(result.plan.seams[0]!.semanticFingerprint).not.toBe(first.seams[0]!.semanticFingerprint);
    expect(result.plan.members.map((member) => member.semanticFingerprint)).not.toEqual(
      first.members.map((member) => member.semanticFingerprint),
    );
  });

  it("moves the plan digest but not semantic fingerprints for presentation-only title changes", () => {
    const initialAuthoring = DeliveryPlanAuthoringInputV1Schema.parse({
      ...authoringInput(),
      seams: [{
        seamKey: "shared-contract",
        title: "Shared contract",
        acceptance: "Both members preserve the shared contract.",
        incidentChunkKeys: ["first", "second"],
        designElementIds: [],
      }],
    });
    const first = constructedPlan(initialAuthoring);
    const changedAuthoring = structuredClone(initialAuthoring);
    changedAuthoring.members[0]!.title = "Retitled first member";
    changedAuthoring.seams[0]!.title = "Retitled shared contract";

    const result = constructDeliveryPlanRevision(constructionInput({
      authoring: changedAuthoring,
      predecessor: first,
    }));
    expect(result.status).toBe("constructed");
    if (result.status !== "constructed") return;
    expect(result.plan.planDigest).not.toBe(first.planDigest);
    expect(result.plan.members.map((member) => member.semanticFingerprint)).toEqual(
      first.members.map((member) => member.semanticFingerprint),
    );
    expect(result.plan.seams[0]!.semanticFingerprint).toBe(first.seams[0]!.semanticFingerprint);
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

  it("requires exact predecessor identity, authored context, revision, and digest lineage", () => {
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

    const wrongProject = structuredClone(secondResult.plan);
    wrongProject.projectId = "clone-local://different-project";
    expectIssueAgainst(redigest(wrongProject), first, "project-id-lineage-mismatch");

    const wrongWorkUnit = structuredClone(secondResult.plan);
    wrongWorkUnit.workUnitId = SlugSchema.parse("different-work-unit");
    expectIssueAgainst(redigest(wrongWorkUnit), first, "work-unit-id-lineage-mismatch");

    const wrongEntry = structuredClone(secondResult.plan);
    wrongEntry.entry = "from-branch";
    expectIssueAgainst(redigest(wrongEntry), first, "entry-changed");

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
    expect(withProject.members.map((member) => member.deliverableId)).toEqual(
      withoutProject.members.map((member) => member.deliverableId),
    );
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
