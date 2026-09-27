import { bindDesignInventory } from "../../src/lib/delivery/design-inventory.js";
import { constructDeliveryPlanRevision } from "../../src/lib/delivery/plan.js";
import type { DeliveryTaskInventoryEntry } from "../../src/lib/delivery/task-inventory.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanAuthoringInputV1,
  type DeliveryPlanV1,
} from "../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const defaultPlanId = "123e4567-e89b-42d3-a456-426614174000";

/** Construct a valid two-member plan for delivery-state and operation tests. */
export function deliveryPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId);
}

/** Construct a valid independently-landable two-member stack plan. */
export function deliveryStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId);
}

/** Construct a valid two-member stack plan for a caller-selected work unit. */
export function deliveryStackPlanForWorkUnitFixture(
  workUnitId: string,
  planId = defaultPlanId,
): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 2, undefined, workUnitId);
}

/** Construct a valid stack plan with caller-selected member titles. */
export function deliveryStackPlanWithMemberTitlesFixture(titles: readonly string[]): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(defaultPlanId, titles.length, titles);
}

/** Construct a valid independently-landable one-member stack plan. */
export function deliverySingleMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 1);
}

/** Construct a valid independently-landable three-member stack plan. */
export function deliveryThreeMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 3);
}

/** Construct a valid three-member stack plan for a caller-selected work unit. */
export function deliveryThreeMemberStackPlanForWorkUnitFixture(
  workUnitId: string,
  planId = defaultPlanId,
): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 3, undefined, workUnitId);
}

/** Construct a valid independently-landable four-member stack plan. */
export function deliveryFourMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 4);
}

/** Construct a valid independently-landable five-member stack plan. */
export function deliveryFiveMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 5);
}

/** Construct a valid independently-landable eight-member stack plan. */
export function deliveryEightMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, 8);
}

function buildDeliveryPlanFixture(
  planId: string,
  memberCount = 2,
  memberTitles: readonly string[] | undefined = undefined,
  workUnitId = "delivery-plan-record",
): DeliveryPlanV1 {
  const resolvedMemberTitles = memberTitles
    ?? [
      "First member",
      "Second member",
      "Third member",
      "Fourth member",
      "Fifth member",
      "Sixth member",
      "Seventh member",
      "Eighth member",
    ];
  const ordinalNames = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];
  const chunkKeys = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  const assignableParents: DeliveryTaskInventoryEntry[] = Array.from({ length: memberCount }, (_, index) => ({
    taskId: `1.${index + 1}`,
    semanticDigest: canonicalDigest({ goal: ordinalNames[index] }),
    role: { kind: "verification" as const, scope: "member" },
  }));
  const parents: DeliveryTaskInventoryEntry[] = [
    ...assignableParents,
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  const rawAuthoring = {
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId,
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:state-contract" }],
    },
    tasks: {
      parents: parents.map(({ taskId, role }) => ({ taskId, role })),
    },
    entry: "from-tasks",
    projection: { kind: "stack-to-main" },
    members: assignableParents.map(({ taskId }, index) => ({
      chunkKey: chunkKeys[index],
      title: resolvedMemberTitles[index] ?? `${ordinalNames[index]} member`,
      contract: `Publish the ${chunkKeys[index]} contract.`,
      taskIds: [taskId],
      designElementIds: index === 0 ? ["detailed:state-contract"] : [],
      mainlineLandability: "independently-landable",
    })),
    seams: [],
  };
  const authoring: DeliveryPlanAuthoringInputV1 = DeliveryPlanAuthoringInputV1Schema.parse(rawAuthoring);
  const design = bindDesignInventory({
    artifacts: [{
      artifactId: "spec-delivery-plan-record.md",
      revisionDigest: canonicalDigest({ source: "spec" }),
      form: "detailed",
      elements: [{ elementId: "state-contract", semanticDigest: canonicalDigest({ contract: "state" }) }],
    }],
  });
  if (design.status !== "bound") throw new Error("fixture design inventory must bind");
  const result = constructDeliveryPlanRevision({
    authoring,
    taskInventory: {
      inventoryDigest: canonicalDigest(parents),
      parents,
    },
    designInventory: design.inventory,
    predecessor: null,
    mintPlanId: () => planId,
  });
  if (result.status !== "constructed") throw new Error("fixture plan must construct");
  return result.plan;
}
