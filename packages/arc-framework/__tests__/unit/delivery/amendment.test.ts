import { describe, expect, it } from "vitest";

import { classifyDeliveryPlanAmendment } from "../../../src/lib/delivery/amendment.js";
import { bindDesignInventory } from "../../../src/lib/delivery/design-inventory.js";
import { constructDeliveryPlanRevision, deriveDeliveryPlanDigest } from "../../../src/lib/delivery/plan.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanAuthoringInputV1,
  type DeliveryPlanV1,
} from "../../../src/lib/delivery/schema.js";
import { canonicalDigest, SlugSchema, type CanonicalDigest } from "../../../src/lib/kernel/index.js";

const planId = "123e4567-e89b-42d3-a456-426614174000";

function authoringInput(): DeliveryPlanAuthoringInputV1 {
  return DeliveryPlanAuthoringInputV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [
        { elementId: "detailed:core-contract" },
        { elementId: "detailed:support-contract" },
        { elementId: "detailed:tail-contract" },
      ],
    },
    tasks: {
      parents: [
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "member" } },
        { taskId: "1.3", role: { kind: "implementation" } },
        { taskId: "1.4", role: { kind: "verification", scope: "member" } },
        { taskId: "1.5", role: { kind: "implementation" } },
        { taskId: "1.6", role: { kind: "verification", scope: "member" } },
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
        designElementIds: ["detailed:core-contract"],
        mainlineLandability: "integration-only",
      },
      {
        chunkKey: "second",
        title: "Second member",
        contract: "Publish the second contract.",
        taskIds: ["1.3", "1.4"],
        designElementIds: ["detailed:support-contract"],
        mainlineLandability: "integration-only",
      },
      {
        chunkKey: "third",
        title: "Third member",
        contract: "Publish the third contract.",
        taskIds: ["1.5", "1.6"],
        designElementIds: ["detailed:tail-contract"],
        mainlineLandability: "integration-only",
      },
    ],
    seams: [],
  });
}

function constructPlan(
  predecessor: DeliveryPlanV1 | null,
  authoring: DeliveryPlanAuthoringInputV1 = authoringInput(),
  semantics: {
    readonly task?: Readonly<Record<string, string>>;
    readonly design?: Readonly<Record<string, string>>;
  } = {},
): DeliveryPlanV1 {
  const design = bindDesignInventory({
    artifacts: [{
      artifactId: "spec-delivery-plan-record.md",
      revisionDigest: canonicalDigest({ source: "spec" }),
      form: "detailed",
      elements: [
        {
          elementId: "core-contract",
          semanticDigest: canonicalDigest({
            requirement: semantics.design?.["core-contract"] ?? "Core contract",
          }),
        },
        {
          elementId: "support-contract",
          semanticDigest: canonicalDigest({
            requirement: semantics.design?.["support-contract"] ?? "Support contract",
          }),
        },
        {
          elementId: "tail-contract",
          semanticDigest: canonicalDigest({
            requirement: semantics.design?.["tail-contract"] ?? "Tail contract",
          }),
        },
      ],
    }],
  });
  if (design.status !== "bound") throw new Error("fixture design inventory must bind");
  const parents = [
    {
      taskId: "1.1",
      semanticDigest: canonicalDigest({ goal: semantics.task?.["1.1"] ?? "First" }),
      role: { kind: "implementation" as const },
    },
    {
      taskId: "1.2",
      semanticDigest: canonicalDigest({ goal: "Verify first" }),
      role: { kind: "verification" as const, scope: "member" },
    },
    {
      taskId: "1.3",
      semanticDigest: canonicalDigest({ goal: semantics.task?.["1.3"] ?? "Second" }),
      role: { kind: "implementation" as const },
    },
    {
      taskId: "1.4",
      semanticDigest: canonicalDigest({ goal: "Verify second" }),
      role: { kind: "verification" as const, scope: "member" },
    },
    {
      taskId: "1.5",
      semanticDigest: canonicalDigest({ goal: semantics.task?.["1.5"] ?? "Third" }),
      role: { kind: "implementation" as const },
    },
    {
      taskId: "1.6",
      semanticDigest: canonicalDigest({ goal: "Verify third" }),
      role: { kind: "verification" as const, scope: "member" },
    },
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  const result = constructDeliveryPlanRevision({
    authoring,
    taskInventory: {
      inventoryDigest: canonicalDigest(parents),
      parents,
    },
    designInventory: design.inventory,
    predecessor,
    mintPlanId: () => planId,
  });
  if (result.status !== "constructed") throw new Error("fixture plan must construct");
  return result.plan;
}

function fixtures(): { readonly current: DeliveryPlanV1; readonly proposed: DeliveryPlanV1 } {
  const current = constructPlan(null);
  return { current, proposed: constructPlan(current) };
}

function successor(
  current: DeliveryPlanV1,
  mutate: (authoring: DeliveryPlanAuthoringInputV1) => void,
  semantics: Parameters<typeof constructPlan>[2] = {},
): DeliveryPlanV1 {
  const authoring = structuredClone(authoringInput());
  mutate(authoring);
  return constructPlan(current, DeliveryPlanAuthoringInputV1Schema.parse(authoring), semantics);
}

function classify(input: {
  readonly current?: DeliveryPlanV1;
  readonly proposed?: DeliveryPlanV1;
  readonly bound?: readonly CanonicalDigest[];
  readonly landed?: readonly CanonicalDigest[];
} = {}) {
  const plans = fixtures();
  return classifyDeliveryPlanAmendment({
    current: input.current ?? plans.current,
    proposed: input.proposed ?? plans.proposed,
    boundDeliverableIds: input.bound ?? [],
    landedDeliverableIds: input.landed ?? [],
  });
}

function redigest(plan: DeliveryPlanV1): DeliveryPlanV1 {
  return { ...plan, planDigest: deriveDeliveryPlanDigest(plan) };
}

describe("classifyDeliveryPlanAmendment", () => {
  it("refuses invalid plans and contradictory bound or landed facts before policy", () => {
    const { current, proposed } = fixtures();
    const [firstId, secondId] = current.members.map((member) => member.deliverableId) as [
      CanonicalDigest,
      CanonicalDigest,
    ];
    const unknown = canonicalDigest({ member: "unknown" });
    const invalidCurrent = { ...current, planDigest: canonicalDigest({ invalid: "current" }) };
    const invalidProposed = redigest({
      ...proposed,
      previousPlanDigest: canonicalDigest({ invalid: "predecessor" }),
    });

    expect(classify({ current: invalidCurrent })).toEqual({
      status: "refused",
      reason: "current-plan-invalid",
    });
    expect(classify({ current, proposed: invalidProposed })).toEqual({
      status: "refused",
      reason: "proposed-plan-invalid",
    });
    for (const bound of [[firstId!, firstId!], [unknown]]) {
      expect(classify({ current, proposed, bound })).toEqual({
        status: "refused",
        reason: "bound-facts-invalid",
      });
    }
    for (const landed of [[secondId!], [firstId!, firstId!], [unknown]]) {
      expect(classify({ current, proposed, bound: [firstId!, secondId!], landed })).toEqual({
        status: "refused",
        reason: "landed-facts-invalid",
      });
    }
    expect(classify({ current, proposed, landed: [firstId!] })).toEqual({
      status: "refused",
      reason: "landed-facts-invalid",
    });
  });

  it("routes member and projection changes by current bound and landed position", () => {
    const current = constructPlan(null);
    const [firstId, secondId, thirdId] = current.members.map((member) => member.deliverableId) as [
      CanonicalDigest,
      CanonicalDigest,
      CanonicalDigest,
    ];
    const titleOnly = successor(current, (authoring) => {
      authoring.members[0]!.title = "Retitled landed member";
    });
    expect(classify({ current, proposed: titleOnly, bound: [firstId], landed: [firstId] }))
      .toEqual({ status: "accepted" });

    const unboundSuffix = successor(current, (authoring) => {
      const secondTaskIds = authoring.members[1]!.taskIds;
      const secondDesignElementIds = authoring.members[1]!.designElementIds;
      const thirdTaskIds = authoring.members[2]!.taskIds;
      const thirdDesignElementIds = authoring.members[2]!.designElementIds;
      [authoring.members[1], authoring.members[2]] = [authoring.members[2]!, authoring.members[1]!];
      authoring.members[1]!.taskIds = secondTaskIds;
      authoring.members[1]!.designElementIds = secondDesignElementIds;
      authoring.members[2]!.taskIds = thirdTaskIds;
      authoring.members[2]!.designElementIds = thirdDesignElementIds;
      authoring.members[2]!.contract = "Re-cut the unbound suffix.";
    });
    expect(classify({ current, proposed: unboundSuffix, bound: [firstId] }))
      .toEqual({ status: "accepted" });

    const additive = successor(current, (authoring) => {
      authoring.members[1]!.taskIds = [
        authoring.members[0]!.taskIds.at(-1)!,
        ...authoring.members[1]!.taskIds,
      ];
      authoring.members[1]!.designElementIds = [
        ...authoring.members[1]!.designElementIds,
        authoring.members[0]!.designElementIds[0]!,
      ];
    });
    expect(classify({ current, proposed: additive, bound: [secondId] }))
      .toEqual({ status: "accepted" });

    const changedBound = successor(current, (authoring) => {
      authoring.members[0]!.contract = "Changed first contract.";
      authoring.members[2]!.contract = "Changed third contract.";
    });
    expect(classify({ current, proposed: changedBound, bound: [thirdId, firstId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [firstId, thirdId],
    });

    const sharedAuthoring = authoringInput();
    sharedAuthoring.members[1]!.taskIds = [
      sharedAuthoring.members[0]!.taskIds.at(-1)!,
      ...sharedAuthoring.members[1]!.taskIds,
    ];
    const sharedCurrent = constructPlan(null, sharedAuthoring);
    const reducedCoverage = constructPlan(sharedCurrent);
    const sharedSecondId = sharedCurrent.members[1]!.deliverableId as CanonicalDigest;
    expect(classify({
      current: sharedCurrent,
      proposed: reducedCoverage,
      bound: [sharedSecondId],
    })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [sharedSecondId],
    });

    const movedSemantics = successor(current, () => undefined, { task: { "1.3": "Moved second semantics" } });
    expect(classify({ current, proposed: movedSemantics, bound: [secondId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });

    const replacedPredecessor = successor(current, (authoring) => {
      authoring.members[0]!.chunkKey = SlugSchema.parse("replacement-first");
    });
    expect(classify({ current, proposed: replacedPredecessor, bound: [secondId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });

    const changedLanded = successor(current, (authoring) => {
      authoring.members[0]!.contract = "Changed landed contract.";
    });
    expect(classify({ current, proposed: changedLanded, bound: [firstId], landed: [firstId] })).toEqual({
      status: "refused",
      reason: "landed-member-changed",
    });

    const projected = successor(current, (authoring) => {
      authoring.projection = { kind: "stack-to-main" };
      for (const member of authoring.members) member.mainlineLandability = "independently-landable";
    });
    expect(classify({ current, proposed: projected })).toEqual({ status: "accepted" });
    expect(classify({ current, proposed: projected, bound: [secondId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });
    expect(classify({ current, proposed: projected, bound: [firstId], landed: [firstId] })).toEqual({
      status: "refused",
      reason: "landed-projection-changed",
    });
  });

  it("preserves landed-side seam obligations while allowing proportionate suffix replacement", () => {
    const seamAuthoring = structuredClone(authoringInput());
    seamAuthoring.seams = DeliveryPlanAuthoringInputV1Schema.parse({
      ...seamAuthoring,
      seams: [{
        seamKey: "shared-contract",
        title: "Shared contract",
        acceptance: "The incident members preserve the shared contract.",
        incidentChunkKeys: ["first", "second"],
        designElementIds: ["detailed:core-contract"],
      }],
    }).seams;
    const current = constructPlan(null, seamAuthoring);
    const [firstId, secondId] = current.members.map((member) => member.deliverableId) as [
      CanonicalDigest,
      CanonicalDigest,
    ];

    const titleOnly = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.title = "Retitled shared contract";
    });
    expect(classify({ current, proposed: titleOnly, bound: [firstId], landed: [firstId] }))
      .toEqual({ status: "accepted" });

    const changedAcceptance = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.acceptance = "Re-describe the landed obligation.";
    });
    expect(classify({ current, proposed: changedAcceptance, bound: [firstId], landed: [firstId] })).toEqual({
      status: "refused",
      reason: "landed-seam-changed",
    });

    const recutSuffix = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.incidentChunkKeys = [
        authoring.members[0]!.chunkKey,
        authoring.members[2]!.chunkKey,
      ];
    });
    expect(classify({
      current,
      proposed: recutSuffix,
      bound: [firstId],
      landed: [firstId],
    })).toEqual({ status: "accepted" });
    expect(classify({
      current,
      proposed: recutSuffix,
      bound: [firstId, secondId],
      landed: [firstId],
    })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });

    const removedLandedSide = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.incidentChunkKeys = [
        authoring.members[1]!.chunkKey,
        authoring.members[2]!.chunkKey,
      ];
    });
    expect(classify({
      current,
      proposed: removedLandedSide,
      bound: [firstId, secondId],
      landed: [firstId],
    })).toEqual({ status: "refused", reason: "landed-seam-changed" });

    const additiveCoverage = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.designElementIds = [
        ...authoring.seams[0]!.designElementIds,
        authoring.members[2]!.designElementIds[0]!,
      ];
    });
    expect(classify({ current, proposed: additiveCoverage, bound: [secondId] }))
      .toEqual({ status: "accepted" });
    expect(classify({
      current,
      proposed: additiveCoverage,
      bound: [firstId, secondId],
      landed: [firstId],
    })).toEqual({ status: "refused", reason: "landed-seam-changed" });

    const removedCoverage = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
      authoring.seams[0]!.designElementIds = [];
    });
    expect(classify({ current, proposed: removedCoverage, bound: [secondId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });

    const movedCoverageSemantics = successor(current, (authoring) => {
      authoring.seams = structuredClone(seamAuthoring.seams);
    }, { design: { "core-contract": "Moved shared semantics" } });
    expect(classify({ current, proposed: movedCoverageSemantics, bound: [secondId] })).toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [secondId],
    });
  });
});
