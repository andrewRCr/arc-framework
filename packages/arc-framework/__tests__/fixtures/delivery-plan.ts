import { bindDesignInventory } from "../../src/lib/delivery/design-inventory.js";
import { constructDeliveryPlanRevision } from "../../src/lib/delivery/plan.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanV1,
} from "../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const defaultPlanId = "123e4567-e89b-42d3-a456-426614174000";

/** Construct a valid two-member plan for delivery-state and operation tests. */
export function deliveryPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, "wu-integration-target");
}

/** Construct a valid independently-landable two-member stack plan. */
export function deliveryStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, "stack-to-main");
}

/** Construct a valid independently-landable three-member stack plan. */
export function deliveryThreeMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, "stack-to-main", 3);
}

/** Construct a valid independently-landable four-member stack plan. */
export function deliveryFourMemberStackPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  return buildDeliveryPlanFixture(planId, "stack-to-main", 4);
}

function buildDeliveryPlanFixture(
  planId: string,
  projection: "wu-integration-target" | "stack-to-main",
  memberCount = 2,
): DeliveryPlanV1 {
  const assignableParents = Array.from({ length: memberCount }, (_, index) => ({
    taskId: `1.${index + 1}`,
    semanticDigest: canonicalDigest({ goal: ["First", "Second", "Third", "Fourth"][index] }),
    role: { kind: "verification" as const, scope: "member" },
  }));
  const parents = [
    ...assignableParents,
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:state-contract" }],
    },
    tasks: {
      parents: parents.map(({ taskId, role }) => ({ taskId, role })),
    },
    entry: "from-tasks",
    projection: { kind: projection },
    members: assignableParents.map(({ taskId }, index) => ({
      chunkKey: ["first", "second", "third", "fourth"][index],
      title: `${["First", "Second", "Third", "Fourth"][index]} member`,
      contract: `Publish the ${["first", "second", "third", "fourth"][index]} contract.`,
      taskIds: [taskId],
      designElementIds: index === 0 ? ["detailed:state-contract"] : [],
      mainlineLandability: projection === "stack-to-main" ? "independently-landable" : "integration-only",
    })),
    seams: [],
  });
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
